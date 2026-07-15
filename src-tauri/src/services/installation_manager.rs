use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Instant, Duration};
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter};
use anyhow::{Result, Context};
use std::path::{Path, PathBuf};
// Removed unused imports
use tokio::sync::oneshot;
use crate::db::Database;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum InstallStage {
    Preparing,
    CheckingUpdates,
    InitializingRuntime,
    Connecting,
    Authenticating,
    FetchingManifest,
    AllocatingDiskSpace,
    Downloading,
    Verifying,
    Installing,
    Finalizing,
    Completed,
    Failed,
}

impl std::fmt::Display for InstallStage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InstallStage::Preparing => write!(f, "Preparing SteamCMD"),
            InstallStage::CheckingUpdates => write!(f, "Checking SteamCMD Updates"),
            InstallStage::InitializingRuntime => write!(f, "Initializing Runtime"),
            InstallStage::Connecting => write!(f, "Connecting to Steam"),
            InstallStage::Authenticating => write!(f, "Authenticating"),
            InstallStage::FetchingManifest => write!(f, "Fetching Depot Manifest"),
            InstallStage::AllocatingDiskSpace => write!(f, "Allocating Disk Space"),
            InstallStage::Downloading => write!(f, "Downloading Files"),
            InstallStage::Verifying => write!(f, "Verifying Files"),
            InstallStage::Installing => write!(f, "Installing Files"),
            InstallStage::Finalizing => write!(f, "Finalizing Installation"),
            InstallStage::Completed => write!(f, "Completed"),
            InstallStage::Failed => write!(f, "Failed"),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallState {
    pub server_id: i64,
    pub is_installing: bool,
    pub stage: InstallStage,
    pub progress: f32,
    pub status: String,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub speed_bps: f64,
    pub avg_speed_bps: f64,
    pub peak_speed_bps: f64,
    pub disk_write_speed_bps: f64,
    pub disk_read_speed_bps: f64,
    pub eta_seconds: Option<u64>,
    pub cdn_server: String,
    pub log: String,
    pub elapsed_seconds: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallLogPayload {
    pub server_id: i64,
    pub line: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsResult {
    pub steam_status: String,      // "online" | "offline"
    pub internet_ping: String,      // "excellent" | "poor" | "offline"
    pub disk_space: String,         // "healthy" | "low" | "critical"
    pub write_permissions: String,  // "ok" | "denied"
    pub firewall_status: String,    // "configured" | "blocked"
    pub steamcmd_status: String,    // "ready" | "corrupt" | "missing"
    pub issues: Vec<DiagnosticIssue>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticIssue {
    pub category: String, // "Steam" | "Windows" | "Disk" | "Network" | "SteamCMD"
    pub cause: String,
    pub description: String,
    pub recommended_fix: String,
    pub one_click_repair_id: Option<String>,
}

struct ActiveInstall {
    state: Arc<Mutex<InstallState>>,
    cancel_tx: Option<oneshot::Sender<()>>,
    start_time: Instant,
}

pub struct InstallationManager {
    db: Arc<Mutex<Database>>,
    active_installs: Arc<Mutex<HashMap<i64, ActiveInstall>>>,
}

impl InstallationManager {
    pub fn new(db: Database) -> Self {
        Self {
            db: Arc::new(Mutex::new(db)),
            active_installs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_active_state(&self, server_id: i64) -> Option<InstallState> {
        let active = self.active_installs.lock().unwrap();
        active.get(&server_id).map(|ai| ai.state.lock().unwrap().clone())
    }

    pub fn cancel_installation(&self, server_id: i64) -> Result<()> {
        let mut active = self.active_installs.lock().unwrap();
        if let Some(ai) = active.remove(&server_id) {
            if let Some(cancel) = ai.cancel_tx {
                let _ = cancel.send(());
            }
            log::info!("[INSTALL] Cancelled active in-memory installation for server {}", server_id);
        } else {
            log::info!("[INSTALL] Cancel request received, but no active in-memory installation found for server {}. Clearing db recovery state.", server_id);
        }
        let _ = self.db.lock().unwrap().clear_install_recovery(server_id);
        Ok(())
    }

    pub async fn run_diagnostics(&self, server_id: i64) -> Result<DiagnosticsResult> {
        let install_path = {
            let db = self.db.lock().unwrap();
            db.get_server_install_path(server_id).unwrap_or_else(|_| "C:\\".to_string())
        };
        
        let mut issues = Vec::new();
        
        // 1. Internet & Steam Status
        let mut internet = "offline".to_string();
        let mut steam = "offline".to_string();
        
        let ping_start = Instant::now();
        if let Ok(_res) = reqwest::get("https://api.steampowered.com").await {
            // Any response (even 404 from root path) means Steam is online and DNS resolved
            internet = if ping_start.elapsed() < Duration::from_millis(300) { "excellent".to_string() } else { "poor".to_string() };
            steam = "online".to_string();
        } else if let Ok(_res) = reqwest::get("https://www.google.com").await {
            internet = "excellent".to_string();
            issues.push(DiagnosticIssue {
                category: "Steam".to_string(),
                cause: "Steam API unreachable".to_string(),
                description: "Steam Web API is not reachable. Steam servers may be experiencing downtime or maintenance.".to_string(),
                recommended_fix: "Check Steam Status website and wait, or disable any active proxy.".to_string(),
                one_click_repair_id: None,
            });
        } else {
            issues.push(DiagnosticIssue {
                category: "Network".to_string(),
                cause: "No internet connection".to_string(),
                description: "The application is unable to reach any public web services.".to_string(),
                recommended_fix: "Verify your network connection, DNS settings, and router/modem status.".to_string(),
                one_click_repair_id: None,
            });
        }

        // 2. Disk Space
        let mut disk_status = "healthy".to_string();
        let path = Path::new(&install_path);
        
        let disks = sysinfo::Disks::new_with_refreshed_list();
        let mut free_space = 0;
        let mut best_match_len = 0;
        for disk in &disks {
            let mount = disk.mount_point();
            if path.starts_with(mount) {
                let len = mount.to_string_lossy().len();
                if len > best_match_len {
                    best_match_len = len;
                    free_space = disk.available_space();
                }
            }
        }
        
        let required_bytes = 8 * 1024 * 1024 * 1024; // 8 GB
        
        if free_space > 0 {
            if free_space < required_bytes {
                disk_status = "low".to_string();
                issues.push(DiagnosticIssue {
                    category: "Disk".to_string(),
                    cause: "Low disk space".to_string(),
                    description: format!(
                        "The target installation drive has only {:.2} GB free. Palworld Dedicated Server requires at least 8 GB.",
                        free_space as f64 / 1024.0 / 1024.0 / 1024.0
                    ),
                    recommended_fix: "Free up some space on the target drive or change the server installation folder path.".to_string(),
                    one_click_repair_id: None,
                });
            } else if free_space < 2 * 1024 * 1024 * 1024 { // <2GB
                disk_status = "critical".to_string();
            }
        }

        // 3. Folder Permissions
        let mut write_permissions = "ok".to_string();
        let temp_file = path.join(".perms_check.tmp");
        if let Err(e) = std::fs::write(&temp_file, b"check") {
            write_permissions = "denied".to_string();
            issues.push(DiagnosticIssue {
                category: "Disk".to_string(),
                cause: "Permission denied".to_string(),
                description: format!("Unable to write files to target directory {}. Error: {}", install_path, e),
                recommended_fix: "Ensure the application is running with admin permissions, or adjust folder safety attributes.".to_string(),
                one_click_repair_id: Some("run_as_admin".to_string()),
            });
        } else {
            let _ = std::fs::remove_file(&temp_file);
        }

        // 4. SteamCMD Status
        let steamcmd_status = if path.join("steamcmd").join("steamcmd.exe").exists() {
            "ready".to_string()
        } else {
            "missing".to_string()
        };

        Ok(DiagnosticsResult {
            steam_status: steam,
            internet_ping: internet,
            disk_space: disk_status,
            write_permissions,
            firewall_status: "configured".to_string(), // Simplified default
            steamcmd_status,
            issues,
        })
    }

    pub fn start_installation(
        self: &Arc<Self>,
        app_handle: AppHandle,
        server_id: i64,
        branch: String,
        steamcmd_dir: PathBuf,
        steamcmd_exe: PathBuf,
    ) -> Result<()> {
        let mut active = self.active_installs.lock().unwrap();
        if active.contains_key(&server_id) {
            anyhow::bail!("Installation is already in progress for server {}", server_id);
        }

        let install_path = {
            let db = self.db.lock().unwrap();
            db.get_server_install_path(server_id).map_err(|e| anyhow::anyhow!(e))?
        };

        // Try load recovery logs if exists
        let initial_logs = {
            let db = self.db.lock().unwrap();
            db.get_install_recovery(server_id)
                .ok()
                .flatten()
                .map(|r| r.logs)
                .unwrap_or_default()
        };

        let state = Arc::new(Mutex::new(InstallState {
            server_id,
            is_installing: true,
            stage: InstallStage::Preparing,
            progress: 0.0,
            status: "Initializing installation pipeline...".to_string(),
            bytes_downloaded: 0,
            bytes_total: 0,
            speed_bps: 0.0,
            avg_speed_bps: 0.0,
            peak_speed_bps: 0.0,
            disk_write_speed_bps: 0.0,
            disk_read_speed_bps: 0.0,
            eta_seconds: None,
            cdn_server: "Detecting CDN node...".to_string(),
            log: initial_logs,
            elapsed_seconds: 0,
        }));

        let (cancel_tx, cancel_rx) = oneshot::channel();
        let active_install = ActiveInstall {
            state: state.clone(),
            cancel_tx: Some(cancel_tx),
            start_time: Instant::now(),
        };
        active.insert(server_id, active_install);

        // Spawn async background processing thread
        let self_clone = self.clone();
        tokio::spawn(async move {
            let res = self_clone.installation_task(
                app_handle.clone(),
                server_id,
                install_path,
                branch,
                steamcmd_dir,
                steamcmd_exe,
                state.clone(),
                cancel_rx,
            ).await;

            // Notify finished/failed
            if let Err(e) = res {
                log::error!("[INSTALL] Server {} installation error: {}", server_id, e);
                let mut st = state.lock().unwrap();
                st.is_installing = false;
                st.stage = InstallStage::Failed;
                st.status = format!("Installation failed: {}", e);
                
                let _ = app_handle.emit("install-tick", st.clone());
                let _ = app_handle.emit("install-log", InstallLogPayload {
                    server_id,
                    line: format!("❌ Installation failed: {}\n", e),
                });
                
                let _ = self_clone.db.lock().unwrap().add_install_history(
                    server_id,
                    "",
                    "public",
                    "failed",
                    st.bytes_downloaded,
                    st.elapsed_seconds as u32,
                    st.avg_speed_bps,
                    st.peak_speed_bps,
                    "failed",
                    &st.status,
                );
            } else {
                let mut st = state.lock().unwrap();
                st.is_installing = false;
                st.stage = InstallStage::Completed;
                st.progress = 100.0;
                st.status = "Installation finished successfully!".to_string();

                let _ = app_handle.emit("install-tick", st.clone());
                let _ = app_handle.emit("install-log", InstallLogPayload {
                    server_id,
                    line: "✓ Server installed successfully!\n".to_string(),
                });
                let _ = self_clone.db.lock().unwrap().clear_install_recovery(server_id);
                
                let _ = self_clone.db.lock().unwrap().add_install_history(
                    server_id,
                    "v1.0.0", // Hardcoded build release index
                    "public",
                    "completed",
                    st.bytes_downloaded,
                    st.elapsed_seconds as u32,
                    st.avg_speed_bps,
                    st.peak_speed_bps,
                    "passed",
                    "Success",
                );
            }

            // Remove from active list at the very end
            let mut active = self_clone.active_installs.lock().unwrap();
            active.remove(&server_id);
        });

        Ok(())
    }

    async fn installation_task(
        &self,
        app_handle: AppHandle,
        server_id: i64,
        install_path: String,
        branch: String,
        steamcmd_dir: PathBuf,
        steamcmd_exe: PathBuf,
        state: Arc<Mutex<InstallState>>,
        mut cancel_rx: oneshot::Receiver<()>,
    ) -> Result<()> {
        log::info!("[INSTALL] Running installation loop for server ID {}", server_id);

        // 1. Kill any existing orphaned steamcmd processes to release locks
        {
            let mut sys = sysinfo::System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            for (pid, process) in sys.processes() {
                let name = process.name().to_string_lossy().to_lowercase();
                if name == "steamcmd.exe" || name == "steamcmd" {
                    log::info!("[INSTALL] Killing orphaned steamcmd process with PID {}", pid);
                    let _ = process.kill();
                }
            }
            // Give the OS a moment to release locks
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        let log_file_path = steamcmd_dir.join("logs").join("console_log.txt");
        if log_file_path.exists() {
            let _ = std::fs::remove_file(&log_file_path);
        }

        let mut child = self.launch_steamcmd(install_path.clone(), branch.clone(), steamcmd_exe)?;
        let child_pid = child.id();
        
        let stdout = child.stdout.take().context("Stdout piped handle corrupted")?;
        let stderr = child.stderr.take().context("Stderr piped handle corrupted")?;
        
        // Output channel streams lines
        let (log_tx, mut log_rx) = tokio::sync::mpsc::channel::<String>(100);
        let log_tx_file = log_tx.clone();

        // Spawn async reader task for stdout to drain it (prevent blocking)
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut reader = stdout;
            let mut buf = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buf).await {
                if n == 0 { break; }
            }
        });

        // Spawn async reader task for stderr to drain it (prevent blocking)
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut reader = stderr;
            let mut buf = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buf).await {
                if n == 0 { break; }
            }
        });

        // Spawn async reader task for console_log.txt
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            
            // Wait for the log file to be created by SteamCMD
            let mut file = None;
            for _ in 0..100 { // try for 10 seconds
                if log_file_path.exists() {
                    if let Ok(f) = tokio::fs::File::open(&log_file_path).await {
                        file = Some(f);
                        break;
                    }
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }

            let mut file = match file {
                Some(f) => f,
                None => {
                    log::error!("[INSTALL] Failed to open SteamCMD console_log.txt after 10 seconds");
                    return;
                }
            };

            let mut accumulated = Vec::new();
            let mut buf = [0u8; 1024];

            loop {
                match file.read(&mut buf).await {
                    Ok(0) => {
                        // EOF reached, wait a bit for new writes
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                    Ok(n) => {
                        for &byte in &buf[..n] {
                            if byte == b'\n' || byte == b'\r' {
                                if !accumulated.is_empty() {
                                    let line = String::from_utf8_lossy(&accumulated).into_owned();
                                    let _ = log_tx_file.send(line).await;
                                    accumulated.clear();
                                }
                            } else {
                                accumulated.push(byte);
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("[INSTALL] Error reading console_log.txt: {}", e);
                        break;
                    }
                }
            }
        });

        // Monitor ticks
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        let mut sys = sysinfo::System::new();
        
        let mut last_progress_bytes = 0u64;
        let mut last_progress_time = Instant::now();
        let mut last_log_time = Instant::now();
        let start_instant = Instant::now();

        // Regex definitions
        // Download state: Update state (0x61) downloading, progress: 26.49 (1608797781 / 6073520175)
        let dl_re = regex::Regex::new(
            r"Update state \((0x[0-9a-fA-F]+)\) ([^,]+), progress: ([0-9.]+)\s*\((\d+)\s*/\s*(\d+)\)"
        ).unwrap();
        // Verification / Allocating: Update state (0x3) verifying, progress: 49.23
        let state_re = regex::Regex::new(
            r"Update state \((0x[0-9a-fA-F]+)\) ([^,]+), progress: ([0-9.]+)"
        ).unwrap();

        loop {
            tokio::select! {
                _ = &mut cancel_rx => {
                    let _ = child.kill().await;
                    anyhow::bail!("Installation cancelled by user");
                }
                
                Some(log_line) = log_rx.recv() => {
                    last_log_time = Instant::now();
                    let trimmed = log_line.trim();
                    if trimmed.is_empty() { continue; }
                    
                    // Log output handling
                    log::info!("[STEAMCMD_{}] {}", server_id, trimmed);
                    
                    let mut st = state.lock().unwrap();
                    st.log.push_str(trimmed);
                    st.log.push('\n');
                    
                    let _ = app_handle.emit("install-log", InstallLogPayload {
                        server_id,
                        line: format!("{}\n", trimmed),
                    });
                    
                    // Parse line for stages
                    if trimmed.contains("Checking for available updates") {
                        st.stage = InstallStage::CheckingUpdates;
                        st.status = "Checking SteamCMD updates...".to_string();
                    } else if trimmed.contains("Connecting to Steam") {
                        st.stage = InstallStage::Connecting;
                        st.status = "Connecting to Steam servers...".to_string();
                    } else if trimmed.contains("Logging in") {
                        st.stage = InstallStage::Authenticating;
                        st.status = "Authenticating login...".to_string();
                    } else if trimmed.contains("Logged in OK") {
                        st.status = "Authenticated successfully".to_string();
                    } else if trimmed.contains("Fetching depot manifest") {
                        st.stage = InstallStage::FetchingManifest;
                        st.status = "Fetching depot manifest...".to_string();
                    } else if trimmed.contains("Allocating") {
                        st.stage = InstallStage::AllocatingDiskSpace;
                        st.status = "Allocating disk space...".to_string();
                    } else if trimmed.contains("Verifying installation") {
                        st.stage = InstallStage::Verifying;
                        st.status = "Verifying files...".to_string();
                    }
                    
                    // Parse download speed regexes
                    if let Some(caps) = dl_re.captures(trimmed) {
                        st.stage = InstallStage::Downloading;
                        st.status = "Downloading dedicated server files...".to_string();
                        st.progress = caps.get(3).unwrap().as_str().parse::<f32>().unwrap_or(0.0);
                        let bytes_dl = caps.get(4).unwrap().as_str().parse::<u64>().unwrap_or(0);
                        st.bytes_total = caps.get(5).unwrap().as_str().parse::<u64>().unwrap_or(0);
                        
                        let now = Instant::now();
                        let elapsed = now.duration_since(last_progress_time).as_secs_f64();
                        if elapsed > 0.2 {
                            let diff = bytes_dl.saturating_sub(last_progress_bytes);
                            let calculated_speed = diff as f64 / elapsed;
                            if calculated_speed > 0.0 {
                                st.speed_bps = calculated_speed;
                                if st.speed_bps > st.peak_speed_bps {
                                    st.peak_speed_bps = st.speed_bps;
                                }
                            }
                            last_progress_bytes = bytes_dl;
                            last_progress_time = now;
                        }
                        st.bytes_downloaded = bytes_dl;
                    } else if let Some(caps) = state_re.captures(trimmed) {
                        let op_state = caps.get(2).unwrap().as_str();
                        st.progress = caps.get(3).unwrap().as_str().parse::<f32>().unwrap_or(0.0);
                        if op_state.contains("verifying") {
                            st.stage = InstallStage::Verifying;
                            st.status = "Verifying installation files...".to_string();
                        } else if op_state.contains("preallocating") {
                            st.stage = InstallStage::AllocatingDiskSpace;
                            st.status = "Allocating disk space...".to_string();
                        } else if op_state.contains("extracting") {
                            st.stage = InstallStage::Installing;
                            st.status = "Extracting files...".to_string();
                        }
                    }
                }
                
                _ = interval.tick() => {
                    let duration_secs = start_instant.elapsed().as_secs();
                    
                    // Freeze Stall Detection (Checked first to prevent MutexGuard across await)
                    let last_log_elapsed = last_log_time.elapsed().as_secs();
                    if last_log_elapsed >= 600 {
                        let _ = child.kill().await;
                        anyhow::bail!("SteamCMD stalled. No console output for 10 minutes. Aborting install.");
                    }
                    
                    let mut st = state.lock().unwrap();
                    st.elapsed_seconds = duration_secs;
                    
                    // Decay speed to 0 if no progress updates received in 5 seconds
                    if last_progress_time.elapsed().as_secs() > 5 {
                        st.speed_bps = 0.0;
                    }
                    
                    // Calculate download speeds
                    if st.stage == InstallStage::Downloading {
                        if duration_secs > 0 {
                            st.avg_speed_bps = st.bytes_downloaded as f64 / duration_secs as f64;
                        }
                        
                        if st.avg_speed_bps > 0.0 {
                            let rem = st.bytes_total.saturating_sub(st.bytes_downloaded);
                            st.eta_seconds = Some((rem as f64 / st.avg_speed_bps) as u64);
                        }
                    }
                    
                    // Refresh CPU, Memory, and Disk stats of the process
                    if let Some(pid) = child_pid {
                        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]), true);
                        if let Some(proc) = sys.process(sysinfo::Pid::from_u32(pid)) {
                            let disk_usage = proc.disk_usage();
                            st.disk_write_speed_bps = disk_usage.written_bytes as f64;
                            st.disk_read_speed_bps = disk_usage.read_bytes as f64;
                        }
                    }
                    
                    if last_log_elapsed >= 180 {
                        st.status = "Checking Steam Servers (Stall detected)...".to_string();
                        st.cdn_server = "Checking packet loss...".to_string();
                    }
                    
                    // Save recovery state to DB
                    let _ = self.db.lock().unwrap().save_install_recovery(
                        server_id,
                        st.is_installing,
                        &format!("{:?}", st.stage),
                        st.progress,
                        &st.status,
                        st.bytes_downloaded,
                        st.bytes_total,
                        &st.log,
                    );
                    
                    // Emit tick to UI
                    let _ = app_handle.emit("install-tick", st.clone());
                }
            }
            
            // Check if process finished
            if let Ok(Some(status)) = child.try_wait() {
                if !status.success() {
                    anyhow::bail!("SteamCMD process exited with error status: {:?}", status.code());
                }
                break;
            }
        }

        Ok(())
    }

    fn launch_steamcmd(&self, install_path: String, branch: String, steamcmd_exe: PathBuf) -> Result<tokio::process::Child> {
        // Pre-create install folder
        let _ = std::fs::create_dir_all(&install_path);

        // Clean up any corrupted temporary downloading directories
        let downloading_path = std::path::PathBuf::from(&install_path).join("steamapps").join("downloading");
        if downloading_path.exists() {
            log::info!("[STEAMCMD] Cleaning up existing downloading directory to prevent corruption");
            let _ = std::fs::remove_dir_all(&downloading_path);
        }

        let steamcmd_dir = steamcmd_exe.parent().context("Failed to get steamcmd directory")?;

        let mut args = vec![
            "+force_install_dir".to_string(),
            install_path.to_string(),
            "+login".to_string(),
            "anonymous".to_string(),
            "+@nClientDownloadEnableHTTP2PlatformWindows".to_string(),
            "1".to_string(),
            "+@fDownloadRateImprovementToAddAnotherConnection".to_string(),
            "1.1".to_string(),
            "+@cMaxInitialDownloadSources".to_string(),
            "15".to_string(),
            "+app_update".to_string(),
            "2394010".to_string(),
        ];

        let trimmed = branch.trim();
        if !trimmed.is_empty() && trimmed != "public" {
            args.push("-beta".to_string());
            args.push(trimmed.to_string());
        }

        args.push("validate".to_string());
        args.push("+quit".to_string());

        let mut cmd = tokio::process::Command::new(&steamcmd_exe);
        cmd.args(&args)
            .current_dir(steamcmd_dir)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let child = cmd.spawn().context("Failed to spawn SteamCMD process")?;
        Ok(child)
    }
}
