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
    launched_admin_password: String,
}

pub struct ProcessManager {
    app_handle: AppHandle,
    processes: Arc<Mutex<HashMap<i64, TrackedProcess>>>,
    crash_history: Arc<Mutex<HashMap<i64, Vec<std::time::Instant>>>>,
}

impl ProcessManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            processes: Arc::new(Mutex::new(HashMap::new())),
            crash_history: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start a Palworld dedicated server
    pub fn start_server(
        &self,
        server_id: i64,
        install_path: &str,
        startup_args: &str,
        game_port: u16,
        query_port: u16,
        _rcon_port: u16,
        admin_password: &str,
    ) -> Result<u32> {
        // Clear crash history for this server since the user is starting/restarting it manually
        {
            let mut history = self.crash_history.lock().unwrap();
            history.remove(&server_id);
        }

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

        let optimize_ram = {
            if let Some(state) = self.app_handle.try_state::<crate::AppState>() {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT optimize_ram FROM servers WHERE id = ?1",
                            [server_id],
                            |row| row.get::<_, i32>(0),
                        ).map(|v| v != 0).unwrap_or(true)
                    } else { true }
                } else { true }
            } else { true }
        };

        // Build command line arguments
        let mut args: Vec<String> = vec![
            format!("-port={}", game_port),
            format!("-queryport={}", query_port),
            "-log".to_string(),
            "-stdout".to_string(),
            "-FORCELOGFLUSH".to_string(),
            "EpicApp=PalServer".to_string(),
            "-publiclobby".to_string(),
        ];

        if optimize_ram {
            args.push("-useperformanceboost".to_string());
            args.push("-NoAsyncLoadingThread".to_string());
        }

        // RCON is configured via PalWorldSettings.ini (RCONEnabled, RCONPort, AdminPassword).
        // No command-line RCON arguments are needed for Palworld.

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

        #[cfg(debug_assertions)]
        {
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            admin_password.hash(&mut hasher);
            log::debug!(
                "[DEBUG] Launch-time admin password length: {}, hash: {:x}",
                admin_password.len(),
                hasher.finish()
            );
        }

        let run_as_admin = {
            if let Some(state) = self.app_handle.try_state::<crate::AppState>() {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT run_as_admin FROM servers WHERE id = ?1",
                            [server_id],
                            |row| row.get::<_, i32>(0),
                        ).map(|v| v != 0).unwrap_or(false)
                    } else { false }
                } else { false }
            } else { false }
        };

        let log_dir = std::path::Path::new(&install_path)
            .join("Pal")
            .join("Saved")
            .join("Logs");
        let _ = std::fs::create_dir_all(&log_dir);

        #[cfg(target_os = "windows")]
        let pid = {
            let escaped_exe = server_exe.to_string_lossy().replace('\'', "''");
            let escaped_args = args.iter()
                .map(|a| format!("'{}'", a.replace('\'', "''")))
                .collect::<Vec<_>>()
                .join(", ");

            let verb_part = if run_as_admin && !is_app_elevated() {
                "-Verb RunAs"
            } else {
                ""
            };

            let ps_cmd = format!(
                "Start-Process -FilePath \"{}\" -ArgumentList {} -WorkingDirectory \"{}\" -WindowStyle Normal {} -PassThru | Select-Object -ExpandProperty Id",
                escaped_exe,
                escaped_args,
                install_path.replace('\"', "\\\""),
                verb_part,
            );

            log::info!("[PROCESS] Spawning PalServer on Windows via: {}", ps_cmd);

            let mut cmd = Command::new("powershell");
            cmd.args(["-NoProfile", "-Command", &ps_cmd]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let mut child = cmd.spawn().context("Failed to spawn PalServer via PowerShell")?;
            
            // Read stdout to get the PID. We only read a small buffer and do not read to EOF
            // because the spawned process might inherit the stdout/stderr handles, causing cmd.output() to block forever.
            let mut stdout_str = String::new();
            if let Some(mut stdout) = child.stdout.take() {
                use std::io::Read;
                let mut buf = [0u8; 64];
                if let Ok(n) = stdout.read(&mut buf) {
                    stdout_str = String::from_utf8_lossy(&buf[..n]).trim().to_string();
                }
            }

            // Wait for the powershell wrapper process to exit (which it should do immediately)
            let status = child.wait().context("Failed to wait for PowerShell process")?;
            if status.success() {
                if let Ok(p) = stdout_str.parse::<u32>() {
                    p
                } else {
                    anyhow::bail!("Failed to parse PID from PowerShell output: '{}'", stdout_str);
                }
            } else {
                let mut stderr_str = String::new();
                if let Some(mut stderr) = child.stderr.take() {
                    use std::io::Read;
                    let mut buf = [0u8; 1024];
                    if let Ok(n) = stderr.read(&mut buf) {
                        stderr_str = String::from_utf8_lossy(&buf[..n]).to_string();
                    }
                }
                anyhow::bail!("PowerShell failed to spawn process: {}", stderr_str);
            }
        };

        #[cfg(not(target_os = "windows"))]
        let pid = {
            let mut cmd = Command::new(&server_exe);
            cmd.args(&args)
                .current_dir(&install_path);

            if let Ok(f) = std::fs::File::create(&console_log_path) {
                if let Ok(f_err) = f.try_clone() {
                    cmd.stdout(std::process::Stdio::from(f));
                    cmd.stderr(std::process::Stdio::from(f_err));
                }
            }

            let child = cmd.spawn().context("Failed to spawn PalServer executable")?;
            child.id()
        };

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
                    launched_admin_password: admin_password.to_string(),
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

        // Send Discord Start Notification
        let app_handle_clone = self.app_handle.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(state) = app_handle_clone.try_state::<crate::AppState>() {
                let server_name = {
                    if let Ok(db) = state.db.lock() {
                        db.get_all_servers().unwrap_or_default().into_iter()
                            .find(|s| s.id == server_id)
                            .map(|s| s.name)
                            .unwrap_or_else(|| format!("Server #{}", server_id))
                    } else {
                        format!("Server #{}", server_id)
                    }
                };
                let _ = crate::commands::discord::send_discord_notification(
                    state,
                    "start".to_string(),
                    server_name,
                    "Palworld server is now starting up!".to_string(),
                ).await;
            }
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
            // Try graceful shutdown without elevation first (works if target server has same privileges)
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            // Wait a moment for graceful shutdown
            std::thread::sleep(std::time::Duration::from_secs(3));

            // Force kill without elevation if still running
            if self.is_process_alive(pid) {
                let _ = Command::new("taskkill")
                    .args(["/F", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
                std::thread::sleep(std::time::Duration::from_millis(500));
            }

            // Fallback to elevated force kill only if still alive and app is not elevated
            if self.is_process_alive(pid) && !is_app_elevated() {
                log::warn!("[PROCESS] Process still alive. Attempting elevated taskkill for PID {}", pid);
                let ps_cmd = format!("Start-Process taskkill -ArgumentList '/F', '/PID', '{}' -Verb RunAs -WindowStyle Hidden", pid);
                let _ = Command::new("powershell")
                    .args(["-NoProfile", "-Command", &ps_cmd])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
                std::thread::sleep(std::time::Duration::from_secs(2));
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

        self.untrack_server(server_id, reason);

        Ok(())
    }

    /// Set the stopping state on a tracked server process to prevent crash detection triggers
    pub fn set_server_stopping(&self, server_id: i64, stopping: bool) {
        let processes = self.processes.lock().unwrap();
        if let Some(p) = processes.get(&server_id) {
            p.stopping.store(stopping, Ordering::SeqCst);
        }
    }

    /// Untrack a server process, emit stopped lifecycle event, and send Discord stop alert
    pub fn untrack_server(&self, server_id: i64, reason: StopReason) {
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

        // Send Discord Stop Notification
        let app_handle_clone = self.app_handle.clone();
        let reason_str = reason.to_string();
        tauri::async_runtime::spawn(async move {
            if let Some(state) = app_handle_clone.try_state::<crate::AppState>() {
                let server_name = {
                    if let Ok(db) = state.db.lock() {
                        db.get_all_servers().unwrap_or_default().into_iter()
                            .find(|s| s.id == server_id)
                            .map(|s| s.name)
                            .unwrap_or_else(|| format!("Server #{}", server_id))
                    } else {
                        format!("Server #{}", server_id)
                    }
                };
                let msg = format!("Palworld server has been stopped. Reason: {}.", reason_str);
                let _ = crate::commands::discord::send_discord_notification(
                    state,
                    "stop".to_string(),
                    server_name,
                    msg,
                ).await;
            }
        });
    }

    pub fn is_process_alive(&self, pid: u32) -> bool {
        #[cfg(target_os = "windows")]
        {
            use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, GetExitCodeProcess};
            use windows_sys::Win32::Foundation::{CloseHandle, FALSE};
            const STILL_ACTIVE: u32 = 259;

            unsafe {
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
                if handle == std::ptr::null_mut() {
                    return false;
                }
                let mut exit_code: u32 = 0;
                let success = GetExitCodeProcess(handle, &mut exit_code);
                CloseHandle(handle);
                
                if success == FALSE {
                    false
                } else {
                    exit_code == STILL_ACTIVE
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            unsafe {
                let res = libc::kill(pid as i32, 0);
                if res == 0 {
                    true
                } else {
                    let err = std::io::Error::last_os_error().raw_os_error();
                    err == Some(libc::EPERM)
                }
            }
        }
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

    /// Get launched admin password for a server
    pub fn get_launched_admin_password(&self, server_id: i64) -> Option<String> {
        let processes = self.processes.lock().unwrap();
        processes.get(&server_id).map(|p| p.launched_admin_password.clone())
    }

    /// Get uptime for a server
    pub fn get_server_uptime(&self, server_id: i64) -> Option<u64> {
        let processes = self.processes.lock().unwrap();
        processes.get(&server_id).map(|p| p.start_time.elapsed().as_secs())
    }

    /// Adopt an existing running process on the OS
    pub fn adopt_server_process(&self, server_id: i64, pid: u32, admin_password: &str) {
        let mut processes = self.processes.lock().unwrap();
        if processes.contains_key(&server_id) {
            return; // Already tracked
        }

        log::info!("[PROCESS] Adopting running server process for server {} with PID {}", server_id, pid);
        
        processes.insert(server_id, TrackedProcess {
            pid,
            server_id,
            start_time: std::time::Instant::now(),
            stopping: Arc::new(AtomicBool::new(false)),
            launched_admin_password: admin_password.to_string(),
        });

        // Spawn the crash/lifecycle monitor for the adopted process
        self.spawn_crash_monitor(server_id, pid);
    }

    /// Spawn a background task to monitor for crashes
    fn spawn_crash_monitor(&self, server_id: i64, pid: u32) {
        let processes = self.processes.clone();
        let app_handle = self.app_handle.clone();
        let crash_history = self.crash_history.clone();

        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(3));

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

                // Check if process is still alive using the robust, native check
                let is_alive = if let Some(state) = app_handle.try_state::<crate::AppState>() {
                    state.process_manager.is_process_alive(pid)
                } else {
                    false
                };

                if !is_alive {
                    log::error!("[PROCESS] Server {} (PID {}) has crashed!", server_id, pid);

                    // Remove from tracking
                    let uptime = {
                        let mut procs = processes.lock().unwrap();
                        let uptime = procs.get(&server_id).map(|p| p.start_time.elapsed().as_secs());
                        procs.remove(&server_id);
                        uptime
                    };

                    let is_rapid = uptime.unwrap_or(0) < 30;
                    let mut should_block_restart = false;

                    if is_rapid {
                        let mut history = crash_history.lock().unwrap();
                        let entry = history.entry(server_id).or_insert_with(Vec::new);
                        entry.push(std::time::Instant::now());

                        // Clean old crash timestamps (older than 2 minutes)
                        entry.retain(|t| t.elapsed() < std::time::Duration::from_secs(120));

                        if entry.len() >= 2 {
                            should_block_restart = true;
                            log::warn!("[PROCESS] Server {} is crash-looping! Blocking auto-restart.", server_id);

                            // Log server event in SQLite
                            if let Some(state) = app_handle.try_state::<crate::AppState>() {
                                if let Ok(db) = state.db.lock() {
                                    let _ = db.insert_server_event(
                                        server_id,
                                        "crash_loop",
                                        "Server is crash-looping and was auto-paused.",
                                        "PalServer process crashed within 30 seconds of starting twice consecutively. Please check your mod compatibility settings.",
                                    );
                                }
                            }

                            // Emit crash-loop event
                            let _ = app_handle.emit("server-crash-loop", server_id);
                        }
                    }

                    // Emit crash event
                    let _ = app_handle.emit("server-lifecycle", ServerLifecycleEvent {
                        server_id,
                        event: "crashed".to_string(),
                        reason: Some("Process exited unexpectedly".to_string()),
                        exit_code: None,
                        uptime_seconds: uptime,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    });

                    // Update DB status, send Discord alert, and handle Auto-Restart
                    let app_handle_clone = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(state) = app_handle_clone.try_state::<crate::AppState>() {
                            if let Ok(db) = state.db.lock() {
                                let _ = db.update_server_status(server_id, "crashed");
                            }
                            let server_name = {
                                if let Ok(db) = state.db.lock() {
                                    db.get_all_servers().unwrap_or_default().into_iter()
                                        .find(|s| s.id == server_id)
                                        .map(|s| s.name)
                                        .unwrap_or_else(|| format!("Server #{}", server_id))
                                } else {
                                    format!("Server #{}", server_id)
                                }
                            };
                            let _ = crate::commands::discord::send_discord_notification(
                                state.clone(),
                                "crash".to_string(),
                                server_name.clone(),
                                "Palworld server process exited unexpectedly! Server crashed.".to_string(),
                            ).await;

                            // Read auto_restart option
                            let auto_restart = {
                                if let Ok(db) = state.db.lock() {
                                    if let Ok(conn) = db.get_connection() {
                                        conn.query_row(
                                            "SELECT auto_restart FROM servers WHERE id = ?1",
                                            [server_id],
                                            |row| row.get::<_, i32>(0),
                                        ).map(|v| v != 0).unwrap_or(true)
                                    } else { true }
                                } else { true }
                            };

                            if auto_restart && !should_block_restart {
                                log::info!("[PROCESS] Auto-restart active. Initializing recovery for server {} ({}) in 5 seconds...", server_id, server_name);
                                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                                // Fetch settings to restart
                                let server_info = {
                                    if let Ok(db) = state.db.lock() {
                                        if let Ok(conn) = db.get_connection() {
                                            conn.query_row(
                                                "SELECT install_path, startup_args, game_port, query_port, rcon_port, admin_password FROM servers WHERE id = ?1",
                                                [server_id],
                                                |row| Ok((
                                                    row.get::<_, String>(0)?,
                                                    row.get::<_, String>(1).unwrap_or_default(),
                                                    row.get::<_, u16>(2).unwrap_or(8211),
                                                    row.get::<_, u16>(3).unwrap_or(27015),
                                                    row.get::<_, u16>(4).unwrap_or(25575),
                                                    row.get::<_, String>(5).unwrap_or_default(),
                                                ))
                                            ).ok()
                                        } else { None }
                                    } else { None }
                                };

                                if let Some((install_path, startup_args, game_port, query_port, rcon_port, admin_password)) = server_info {
                                    log::info!("[PROCESS] Triggering auto-restart spawn for server {}...", server_id);
                                    if let Ok(db) = state.db.lock() {
                                        let _ = db.update_server_status(server_id, "starting");
                                        let _ = db.update_server_last_started(server_id);
                                    }

                                    match state.process_manager.start_server(
                                        server_id,
                                        &install_path,
                                        &startup_args,
                                        game_port,
                                        query_port,
                                        rcon_port,
                                        &admin_password,
                                    ) {
                                        Ok(_) => {
                                            log::info!("[PROCESS] Auto-restart successful for server {}", server_id);
                                            if let Ok(db) = state.db.lock() {
                                                let _ = db.update_server_status(server_id, "running");
                                            }
                                        }
                                        Err(e) => {
                                            log::error!("[PROCESS] Auto-restart failed to spawn for server {}: {}", server_id, e);
                                            if let Ok(db) = state.db.lock() {
                                                let _ = db.update_server_status(server_id, "crashed");
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    });

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

#[cfg(target_os = "windows")]
fn is_app_elevated() -> bool {
    let output = std::process::Command::new("net")
        .arg("session")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output();
    output.map(|o| o.status.success()).unwrap_or(false)
}

