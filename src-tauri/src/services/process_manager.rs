/// Palworld Server Process Manager
///
/// Handles spawning, monitoring, and stopping PalServer.exe processes.
/// Adapted from ARK SM's ProcessManager with Palworld-specific process names and behavior.

use anyhow::{Context, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(target_os = "windows")]
const CREATE_NEW_CONSOLE: u32 = 0x00000010;
#[cfg(target_os = "windows")]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;

/// Reason why a server stop was initiated
#[derive(Debug, Clone, Serialize)]
pub enum StopReason {
    UserAction,
    ScheduledRestart,
    UpdateRequired,
    CrashDetected,
    StartupTimeout,
    SystemShutdown,
}

impl std::fmt::Display for StopReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StopReason::UserAction => write!(f, "USER_ACTION"),
            StopReason::ScheduledRestart => write!(f, "SCHEDULED_RESTART"),
            StopReason::UpdateRequired => write!(f, "UPDATE_REQUIRED"),
            StopReason::CrashDetected => write!(f, "CRASH_DETECTED"),
            StopReason::StartupTimeout => write!(f, "STARTUP_TIMEOUT"),
            StopReason::SystemShutdown => write!(f, "SYSTEM_SHUTDOWN"),
        }
    }
}

/// Lifecycle event emitted to the frontend
#[derive(Clone, Serialize)]
pub struct ServerLifecycleEvent {
    pub server_id: i64,
    pub event: String,
    pub reason: Option<String>,
    pub exit_code: Option<i32>,
    pub uptime_seconds: Option<u64>,
    pub timestamp: String,
}

/// Tracked server process
struct TrackedProcess {
    pid: u32,
    server_id: i64,
    start_time: std::time::Instant,
    stopping: Arc<AtomicBool>,
}

pub struct ProcessManager {
    app_handle: AppHandle,
    processes: Arc<Mutex<HashMap<i64, TrackedProcess>>>,
}

impl ProcessManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start a Palworld dedicated server
    pub fn start_server(
        &self,
        server_id: i64,
        install_path: &str,
        startup_args: &str,
        game_port: u16,
        rcon_port: u16,
        admin_password: &str,
    ) -> Result<u32> {
        // Check for existing process
        {
            let processes = self.processes.lock().unwrap();
            if processes.contains_key(&server_id) {
                anyhow::bail!("Server {} is already running", server_id);
            }
        }

        let shipping_exe = PathBuf::from(install_path)
            .join("Pal")
            .join("Binaries")
            .join("Win64")
            .join("PalServer-Win64-Shipping-Cmd.exe");

        let server_exe = if shipping_exe.exists() {
            shipping_exe
        } else {
            PathBuf::from(install_path).join("PalServer.exe")
        };

        if !server_exe.exists() {
            anyhow::bail!(
                "PalServer executable not found at: {}",
                server_exe.display()
            );
        }

        // Build command line arguments
        let mut args: Vec<String> = vec![
            format!("-port={}", game_port),
            "-stdout".to_string(),
            "-FORCELOGFLUSH".to_string(),
        ];

        // Add RCON args
        if !admin_password.is_empty() {
            args.push(format!("-rconport={}", rcon_port));
            args.push(format!("-AdminPassword={}", admin_password));
        }

        // Parse and add custom startup args
        if !startup_args.is_empty() {
            for arg in startup_args.split_whitespace() {
                args.push(arg.to_string());
            }
        }

        log::info!(
            "[PROCESS] Starting PalServer for server {} at {} with args: {:?}",
            server_id,
            install_path,
            args
        );

        let mut cmd = Command::new(&server_exe);
        cmd.args(&args)
            .current_dir(install_path);

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NEW_CONSOLE | CREATE_NEW_PROCESS_GROUP);

        let child = cmd.spawn().context("Failed to spawn PalServer executable")?;
        let pid = child.id();

        log::info!("[PROCESS] PalServer started with PID {} for server {}", pid, server_id);

        // Track the process
        {
            let mut processes = self.processes.lock().unwrap();
            processes.insert(
                server_id,
                TrackedProcess {
                    pid,
                    server_id,
                    start_time: std::time::Instant::now(),
                    stopping: Arc::new(AtomicBool::new(false)),
                },
            );
        }

        // Emit lifecycle event
        let _ = self.app_handle.emit("server-lifecycle", ServerLifecycleEvent {
            server_id,
            event: "started".to_string(),
            reason: None,
            exit_code: None,
            uptime_seconds: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        // Spawn crash monitor
        self.spawn_crash_monitor(server_id, pid);

        Ok(pid)
    }

    /// Stop a running server
    pub fn stop_server(&self, server_id: i64, reason: StopReason) -> Result<()> {
        let pid = {
            let processes = self.processes.lock().unwrap();
            match processes.get(&server_id) {
                Some(p) => {
                    p.stopping.store(true, Ordering::SeqCst);
                    p.pid
                }
                None => anyhow::bail!("Server {} is not running", server_id),
            }
        };

        log::info!(
            "[PROCESS] Stopping server {} (PID {}) reason: {}",
            server_id,
            pid,
            reason
        );

        // Try graceful shutdown first via taskkill
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            // Wait a moment for graceful shutdown
            std::thread::sleep(std::time::Duration::from_secs(5));

            // Force kill if still running
            if self.is_process_alive(pid) {
                log::warn!("[PROCESS] Force killing PID {}", pid);
                let _ = Command::new("taskkill")
                    .args(["/F", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }
            std::thread::sleep(std::time::Duration::from_secs(5));
            if self.is_process_alive(pid) {
                unsafe {
                    libc::kill(pid as i32, libc::SIGKILL);
                }
            }
        }

        // Remove from tracking
        let uptime = {
            let mut processes = self.processes.lock().unwrap();
            let uptime = processes.get(&server_id).map(|p| p.start_time.elapsed().as_secs());
            processes.remove(&server_id);
            uptime
        };

        // Emit lifecycle event
        let _ = self.app_handle.emit("server-lifecycle", ServerLifecycleEvent {
            server_id,
            event: "stopped".to_string(),
            reason: Some(reason.to_string()),
            exit_code: Some(0),
            uptime_seconds: uptime,
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        Ok(())
    }

    /// Check if a specific PID is still alive
    pub fn is_process_alive(&self, pid: u32) -> bool {
        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        sys.process(sysinfo::Pid::from_u32(pid)).is_some()
    }

    /// Check if a server is being tracked
    pub fn is_server_running(&self, server_id: i64) -> bool {
        let processes = self.processes.lock().unwrap();
        if let Some(tracked) = processes.get(&server_id) {
            self.is_process_alive(tracked.pid)
        } else {
            false
        }
    }

    /// Get PID for a server
    pub fn get_server_pid(&self, server_id: i64) -> Option<u32> {
        let processes = self.processes.lock().unwrap();
        processes.get(&server_id).map(|p| p.pid)
    }

    /// Get uptime for a server
    pub fn get_server_uptime(&self, server_id: i64) -> Option<u64> {
        let processes = self.processes.lock().unwrap();
        processes.get(&server_id).map(|p| p.start_time.elapsed().as_secs())
    }

    /// Spawn a background task to monitor for crashes
    fn spawn_crash_monitor(&self, server_id: i64, pid: u32) {
        let processes = self.processes.clone();
        let app_handle = self.app_handle.clone();

        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(10));

                let is_stopping = {
                    let procs = processes.lock().unwrap();
                    match procs.get(&server_id) {
                        Some(p) => p.stopping.load(Ordering::SeqCst),
                        None => return, // No longer tracked
                    }
                };

                if is_stopping {
                    return;
                }

                // Check if process is still alive
                let mut sys = sysinfo::System::new();
                sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

                if sys.process(sysinfo::Pid::from_u32(pid)).is_none() {
                    log::error!("[PROCESS] Server {} (PID {}) has crashed!", server_id, pid);

                    // Remove from tracking
                    let uptime = {
                        let mut procs = processes.lock().unwrap();
                        let uptime = procs.get(&server_id).map(|p| p.start_time.elapsed().as_secs());
                        procs.remove(&server_id);
                        uptime
                    };

                    // Emit crash event
                    let _ = app_handle.emit("server-lifecycle", ServerLifecycleEvent {
                        server_id,
                        event: "crashed".to_string(),
                        reason: Some("Process exited unexpectedly".to_string()),
                        exit_code: None,
                        uptime_seconds: uptime,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    });

                    // Update DB status
                    if let Some(state) = app_handle.try_state::<crate::AppState>() {
                        if let Ok(db) = state.db.lock() {
                            let _ = db.update_server_status(server_id, "crashed");
                        }
                    }

                    return;
                }
            }
        });
    }

    /// Check if any PalServer processes are running (for startup recovery)
    pub fn check_for_running_palservers() -> bool {
        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        sys.processes().values().any(|p| {
            let name = p.name().to_string_lossy().to_lowercase();
            name.contains("palserver")
        })
    }
}

fn detect_log_level(line: &str) -> String {
    let lower = line.to_lowercase();
    if lower.contains("error") || lower.contains("fatal") {
        "error".to_string()
    } else if lower.contains("warning") || lower.contains("warn") {
        "warning".to_string()
    } else if lower.contains("chat") {
        "chat".to_string()
    } else {
        "info".to_string()
    }
}

