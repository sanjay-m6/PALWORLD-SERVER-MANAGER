/// Update Manager Service — Palworld Dedicated Server update orchestration
///
/// Implements graceful update checks, player warnings, backups, SteamCMD updates, and restarts.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::time::Duration;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use chrono::Timelike;
use anyhow::Result;

use crate::AppState;
use crate::commands::rcon::RconState;
use crate::services::rcon::RconService;
use crate::services::backup_service::BackupService;
use crate::services::installation_manager::{InstallState, InstallStage, InstallLogPayload};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDetectedPayload {
    pub server_id: i64,
    pub server_name: String,
    pub current_version: String,
    pub latest_version: String,
    pub release_time: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub update_available: bool,
    pub installed_build: String,
    pub latest_build: String,
    pub game_version: String,
    pub server_version: String,
}

pub struct UpdateManager {
    app_handle: AppHandle,
    updating_servers: Arc<Mutex<HashSet<i64>>>,
}

impl UpdateManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            updating_servers: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Check if a server is currently undergoing an update
    pub fn is_updating(&self, server_id: i64) -> bool {
        let updating = self.updating_servers.lock().unwrap();
        updating.contains(&server_id)
    }

    /// Check if there is an update available on Steam and trigger auto-update if configured
    /// Perform a real update check by querying SteamCMD API and comparing with local manifest.
    pub async fn perform_update_check(&self, server_id: i64) -> Result<UpdateCheckResult> {
        let app_state = self.app_handle.state::<AppState>();

        // Retrieve server details
        let (branch, install_path, name, is_remote) = {
            let db = app_state.db.lock().unwrap();
            let conn = db.get_connection().map_err(|e| anyhow::anyhow!(e))?;
            conn.query_row(
                "SELECT branch, install_path, name, is_remote FROM servers WHERE id = ?1",
                [server_id],
                |row| Ok((
                    row.get::<_, String>(0).unwrap_or_else(|_| "public".to_string()),
                    row.get::<_, String>(1).unwrap_or_default(),
                    row.get::<_, String>(2).unwrap_or_default(),
                    row.get::<_, i32>(3).unwrap_or(0) != 0,
                ))
            ).map_err(|e| anyhow::anyhow!(e))?
        };

        if is_remote {
            anyhow::bail!("Remote servers are not managed locally");
        }

        log::info!("[Update] Checking for updates...");

        // 1. Fetch remote build ID and updated time from SteamCMD API
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();
            
        let url = "https://api.steamcmd.net/v1/info/2394010";
        let resp = client.get(url).send().await.map_err(|e| {
            log::error!("[Update] SteamCMD API connection failed: {}", e);
            anyhow::anyhow!("Failed to connect to SteamCMD API")
        })?;
        
        log::info!("[SteamCMD] Connected");

        let json = resp.json::<serde_json::Value>().await.map_err(|e| {
            log::error!("[Update] Failed to parse SteamCMD API JSON: {}", e);
            anyhow::anyhow!("Failed to parse SteamCMD API response")
        })?;
        
        let branch_to_check = if branch.trim().is_empty() { "public" } else { branch.trim() };
        
        let mut remote_build_id = None;
        if let Some(buildid_val) = json.pointer(&format!("/data/2394010/depots/branches/{}/buildid", branch_to_check)) {
            remote_build_id = buildid_val.as_str().map(|s| s.to_string())
                .or_else(|| buildid_val.as_u64().map(|n| n.to_string()));
        }

        let remote_id = match remote_build_id {
            Some(id) => id,
            None => anyhow::bail!("Failed to locate build ID for branch '{}'", branch_to_check),
        };

        log::info!("[SteamCMD] Latest Build: {}", remote_id);

        // 2. Get local build ID from appmanifest_2394010.acf
        let mut local_id = String::new();
        let manifest_path = PathBuf::from(&install_path).join("steamapps").join("appmanifest_2394010.acf");
        if manifest_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                let re = regex::Regex::new(r#""buildid"\s+"(\d+)""#).unwrap();
                if let Some(caps) = re.captures(&content) {
                    if let Some(m) = caps.get(1) {
                        local_id = m.as_str().to_string();
                    }
                }
            }
        }
        
        if local_id.is_empty() {
            anyhow::bail!("Server manifest not found or unreadable. Please validate server installation.");
        }

        log::info!("[Installed] Build: {}", local_id);

        // 3. Map versions
        let mut server_version = "—".to_string();
        let mut game_version = "—".to_string();

        // Load last known version from DB first (sync)
        if let Ok(db) = app_state.db.lock() {
            if let Ok(Some(last_ver)) = db.get_setting(&format!("last_known_version_{}", server_id)) {
                server_version = last_ver.clone();
                game_version = if last_ver.starts_with('v') {
                    last_ver.clone()
                } else {
                    format!("v{}", last_ver)
                };
            }
        }

        if server_version == "—" {
            if let Some(mapped) = crate::commands::system::map_build_id_to_version(&local_id) {
                server_version = mapped.clone();
                game_version = format!("v{}", mapped);
            } else {
                server_version = format!("Build {}", local_id);
                game_version = format!("Build {}", local_id);
            }
        }

        let update_available = local_id != remote_id;
        if update_available {
            log::info!("[Compare] Update Available");
            let release_date_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let _ = self.app_handle.emit("server-update-available", serde_json::json!({
                "serverId": server_id,
                "serverName": name,
                "currentVersion": local_id,
                "latestVersion": remote_id,
                "releaseTime": release_date_str
            }));
        } else {
            log::info!("[Compare] Server is already up to date");
        }

        Ok(UpdateCheckResult {
            update_available,
            installed_build: local_id,
            latest_build: remote_id,
            game_version,
            server_version,
        })
    }

    /// Check if there is an update available on Steam and trigger auto-update if configured
    pub async fn check_and_run_update(&self, server_id: i64) -> Result<bool> {
        let app_state = self.app_handle.state::<AppState>();

        // 1. Get configurations from DB
        let auto_update_enabled = self.get_bool_setting(&format!("auto_update_enabled_{}", server_id), false);
        
        // Retrieve server details
        let (branch, _install_path, name, is_remote) = {
            let db = app_state.db.lock().unwrap();
            let conn = db.get_connection().map_err(|e| anyhow::anyhow!(e))?;
            conn.query_row(
                "SELECT branch, install_path, name, is_remote FROM servers WHERE id = ?1",
                [server_id],
                |row| Ok((
                    row.get::<_, String>(0).unwrap_or_else(|_| "public".to_string()),
                    row.get::<_, String>(1).unwrap_or_default(),
                    row.get::<_, String>(2).unwrap_or_default(),
                    row.get::<_, i32>(3).unwrap_or(0) != 0,
                ))
            ).map_err(|e| anyhow::anyhow!(e))?
        };

        if is_remote {
            return Ok(false);
        }

        // 2. Perform the update check
        let check_res = match self.perform_update_check(server_id).await {
            Ok(res) => res,
            Err(e) => {
                log::error!("[Update] Scheduled check failed for server ID {}: {}", server_id, e);
                return Err(e);
            }
        };

        if !check_res.update_available {
            return Ok(false);
        }

        let remote_id = check_res.latest_build;
        let local_id = check_res.installed_build;

        // Check if we have already notified/updated for this specific remote build ID to prevent spamming notifications!
        let last_notified = {
            let db = app_state.db.lock().unwrap();
            db.get_setting(&format!("last_notified_build_{}", server_id)).unwrap_or(None)
        };
        
        if last_notified.as_deref() == Some(&remote_id) {
            // We already handled this build ID, skip background update
            return Ok(false);
        }
        
        // Update database that we are notifying/handling this build
        {
            let db = app_state.db.lock().unwrap();
            let _ = db.set_setting(&format!("last_notified_build_{}", server_id), &remote_id);
        }
        
        let release_date_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        let event_msg = format!("New Palworld Dedicated Server update detected on Steam! Current Version (Build ID): {}, Latest Version (Build ID): {}, Release Time: {}", local_id, remote_id, release_date_str);
        log::info!("[UPDATE] Server ID {}: {}", server_id, event_msg);
        
        // Insert into server events database table
        {
            let db = app_state.db.lock().unwrap();
            let _ = db.insert_server_event(
                server_id,
                "update_detected",
                "Steam update detected.",
                &format!("Local Build ID: {}\nLatest Build ID: {}\nRelease Time: {}", local_id, remote_id, release_date_str),
            );
        }
        
        // Send notifications!
        let notify_desktop = self.get_bool_setting(&format!("auto_update_notify_desktop_{}", server_id), true);
        let notify_in_app = self.get_bool_setting(&format!("auto_update_notify_in_app_{}", server_id), true);
        let notify_discord = self.get_bool_setting(&format!("auto_update_notify_discord_{}", server_id), true);
        
        let display_msg = format!("New Palworld update detected for '{}'. Local Build: {}, Latest Build: {}.", name, local_id, remote_id);
        
        if notify_desktop {
            let _ = self.app_handle.emit("desktop-notification", serde_json::json!({
                "title": format!("Palworld Update: {}", name),
                "body": display_msg
            }));
        }
        
        if notify_in_app {
            let _ = self.app_handle.emit("in-app-notification", serde_json::json!({
                "type": "info",
                "message": display_msg
            }));
        }
        
        if notify_discord {
            let _ = crate::commands::discord::send_discord_notification(
                app_state.clone(),
                "update_start".to_string(),
                name.clone(),
                format!("Palworld update detected on Steam.\n- Installed Build: {}\n- Latest Build: {}\n- Release Time: {}\nStopping server to update...", local_id, remote_id, release_date_str)
            ).await;
        }
        
        // Emit interactive popup event for the frontend
        let _ = self.app_handle.emit("server-update-available", serde_json::json!({
            "serverId": server_id,
            "serverName": name,
            "currentVersion": local_id,
            "latestVersion": remote_id,
            "releaseTime": release_date_str
        }));
        
        // Trigger auto update if enabled
        if auto_update_enabled {
            // check maintenance window
            let use_maintenance = self.get_bool_setting(&format!("auto_update_maintenance_{}", server_id), false);
            if use_maintenance {
                let start_hour = self.get_int_setting(&format!("auto_update_maintenance_start_{}", server_id), 2);
                let end_hour = self.get_int_setting(&format!("auto_update_maintenance_end_{}", server_id), 5);
                
                let current_hour = chrono::Local::now().time().hour();
                let in_window = if start_hour <= end_hour {
                    current_hour >= start_hour && current_hour < end_hour
                } else {
                    // Window spans midnight (e.g. 23:00 to 04:00)
                    current_hour >= start_hour || current_hour < end_hour
                };
                
                if !in_window {
                    log::info!("[UPDATE] Skipping update for server {} because it is outside the maintenance window ({}:00 - {}:00, current: {}).", server_id, start_hour, end_hour, current_hour);
                    // Reset notifier setting so we check/notify again next time
                    let db = app_state.db.lock().unwrap();
                    let _ = db.set_setting(&format!("last_notified_build_{}", server_id), "");
                    return Ok(false);
                }
            }
            
            // Run the update process in background tokio task
            let app_handle_clone = self.app_handle.clone();
            tokio::spawn(async move {
                if let Some(state) = app_handle_clone.try_state::<AppState>() {
                    let _ = state.update_manager.run_update(server_id, Some(branch)).await;
                }
            });
        }
        return Ok(true);
    }

    /// Perform a full graceful update process (countdown warnings -> save -> backup -> shutdown -> SteamCMD update -> verify -> restart)
    pub async fn run_update(&self, server_id: i64, branch: Option<String>) -> Result<()> {
        // 1. Concurrency safety guard
        {
            let mut updating = self.updating_servers.lock().unwrap();
            if updating.contains(&server_id) {
                anyhow::bail!("An update process is already running for server {}", server_id);
            }
            updating.insert(server_id);
        }
        
        struct UpdateGuard {
            updating_servers: Arc<Mutex<HashSet<i64>>>,
            server_id: i64,
        }
        impl Drop for UpdateGuard {
            fn drop(&mut self) {
                let mut updating = self.updating_servers.lock().unwrap();
                updating.remove(&self.server_id);
            }
        }
        let _guard = UpdateGuard {
            updating_servers: self.updating_servers.clone(),
            server_id,
        };

        let app_state = self.app_handle.state::<AppState>();
        log::info!("[Update] Starting automatic update...");
        
        // 2. Initialize in-memory and UI state
        let initial_state = InstallState {
            server_id,
            is_installing: true,
            stage: InstallStage::Preparing,
            progress: 0.0,
            status: "Starting automated update sequence...".to_string(),
            bytes_downloaded: 0,
            bytes_total: 0,
            speed_bps: 0.0,
            avg_speed_bps: 0.0,
            peak_speed_bps: 0.0,
            disk_write_speed_bps: 0.0,
            disk_read_speed_bps: 0.0,
            eta_seconds: None,
            cdn_server: "Local Orchestrator".to_string(),
            log: "🔄 Palworld Server Update Manager Initialized\n".to_string(),
            elapsed_seconds: 0,
        };
        let _ = self.app_handle.emit("install-tick", &initial_state);
        let state_arc = Arc::new(Mutex::new(initial_state));

        // Create log callback helper
        let self_app_handle = self.app_handle.clone();
        let state_arc_clone = state_arc.clone();
        let log_to_console = move |msg: &str| {
            log::info!("[UPDATE_{}] {}", server_id, msg);
            let mut st = state_arc_clone.lock().unwrap();
            st.log.push_str(msg);
            st.log.push('\n');
            let _ = self_app_handle.emit("install-log", InstallLogPayload {
                server_id,
                line: format!("{}\n", msg),
            });
            let _ = self_app_handle.emit("install-tick", &*st);
        };

        // Read update settings
        let countdown_mins = self.get_int_setting(&format!("auto_update_countdown_{}", server_id), 10);
        let auto_update_backup = self.get_bool_setting(&format!("auto_update_backup_{}", server_id), true);
        let auto_update_restart = self.get_bool_setting(&format!("auto_update_restart_{}", server_id), true);
        let auto_update_skip_players = self.get_bool_setting(&format!("auto_update_skip_players_{}", server_id), false);

        // Retrieve server details
        let (install_path, active_branch, name, is_running) = {
            let db = app_state.db.lock().unwrap();
            let conn = db.get_connection().map_err(|e| anyhow::anyhow!(e))?;
            let mut stmt = conn.prepare("SELECT install_path, branch, name FROM servers WHERE id = ?1")?;
            let row = stmt.query_row([server_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?;
            let is_running = app_state.process_manager.is_server_running(server_id);
            (row.0, row.1, row.2, is_running)
        };

        let target_branch = branch.unwrap_or(active_branch);

        // Fetch connection parameters
        let (host, rcon_port, admin_password, rcon_enabled) = {
            let db = app_state.db.lock().unwrap();
            let conn = db.get_connection().map_err(|e| anyhow::anyhow!(e))?;
            conn.query_row(
                "SELECT host, rcon_port, admin_password, rcon_enabled FROM servers WHERE id = ?1",
                [server_id],
                |row| Ok((
                    row.get::<_, String>(0).unwrap_or_else(|_| "127.0.0.1".to_string()),
                    row.get::<_, u16>(1).unwrap_or(25575),
                    row.get::<_, String>(2).unwrap_or_default(),
                    row.get::<_, i32>(3).unwrap_or(1) != 0,
                ))
            ).unwrap_or(("127.0.0.1".to_string(), 25575, "".to_string(), false))
        };

        // 3. Check for online players
        let mut players_online = false;
        let mut player_count = 0;
        
        if is_running && rcon_enabled {
            if let Some(rcon_state) = self.app_handle.try_state::<RconState>() {
                let rcon = &rcon_state.0;
                if let Ok(_) = rcon.connect(server_id, &host, rcon_port, &admin_password).await {
                    if let Ok(response) = rcon.send_command(server_id, "ShowPlayers").await {
                        let players = RconService::parse_player_list(&response);
                        player_count = players.len();
                        players_online = player_count > 0;
                    }
                }
            }
        }

        // Skip if players online and configured to do so
        if auto_update_skip_players && players_online {
            log_to_console(&format!("⚠️ Skipping automatic update because {} players are online and skip-on-players option is enabled.", player_count));
            {
                let mut st = state_arc.lock().unwrap();
                st.is_installing = false;
                st.stage = InstallStage::Failed;
                st.status = "Skipped: Players are online".to_string();
                let _ = self.app_handle.emit("install-tick", &*st);
            }
            return Ok(());
        }

        // 4. Perform players countdown warnings
        if is_running && players_online {
            log_to_console(&format!("📢 Active players detected: {}. Starting {} minutes countdown warnings...", player_count, countdown_mins));
            let mut remaining_secs = countdown_mins * 60;
            
            if let Some(rcon_state) = self.app_handle.try_state::<RconState>() {
                let rcon = &rcon_state.0;
                while remaining_secs > 0 {
                    // Check if server was manually stopped during countdown
                    if !app_state.process_manager.is_server_running(server_id) {
                        log_to_console("⚠️ Server was stopped during countdown. Skipping countdown and proceeding to update.");
                        break;
                    }
                    
                    let (should_broadcast, msg) = match remaining_secs {
                        s if s == countdown_mins * 60 => (true, format!("Server update detected. Restarting in {} minutes.", countdown_mins)),
                        300 => (true, "Server update detected. Restarting in 5 minutes.".to_string()),
                        60 => (true, "Server update detected. Restarting in 1 minute.".to_string()),
                        30 => (true, "Server update detected. Restarting in 30 seconds.".to_string()),
                        10 => (true, "Server update detected. Restarting in 10 seconds.".to_string()),
                        _ => (false, String::new()),
                    };
                    
                    if should_broadcast {
                        let _ = rcon.send_command(server_id, &format!("Broadcast {}", msg)).await;
                        log_to_console(&format!("📢 Broadcast: {}", msg));
                    }
                    
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    remaining_secs -= 1;
                }
            }
        } else if is_running {
            log_to_console("📢 No players online. Initiating immediate graceful shutdown...");
            if let Some(rcon_state) = self.app_handle.try_state::<RconState>() {
                let rcon = &rcon_state.0;
                let _ = rcon.send_command(server_id, "Broadcast Server update detected. Restarting now.").await;
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }

        // 5. Automatically Save the World
        if is_running && rcon_enabled {
            log::info!("[Update] Saving world...");
            log_to_console("💾 Saving world progress...");
            if let Some(rcon_state) = self.app_handle.try_state::<RconState>() {
                let rcon = &rcon_state.0;
                match rcon.send_command(server_id, "Save").await {
                    Ok(resp) => {
                        log_to_console(&format!("✓ Save command complete. Response: {}", resp));
                    }
                    Err(e) => {
                        log_to_console(&format!("⚠️ Save command failed: {}. Continuing update anyway...", e));
                    }
                }
            }
            // Wait 5 seconds to ensure disk write operations finish
            tokio::time::sleep(Duration::from_secs(5)).await;
        }

        // 6. Graceful Server Shutdown
        if is_running {
            log_to_console("🔌 Stopping server process gracefully...");
            
            let mut shutdown_sent = false;
            if rcon_enabled {
                if let Some(rcon_state) = self.app_handle.try_state::<RconState>() {
                    let rcon = &rcon_state.0;
                    if let Ok(_) = rcon.send_command(server_id, "Shutdown 1 Server_updating_now").await {
                        log_to_console("✓ RCON Shutdown command sent.");
                        shutdown_sent = true;
                    }
                }
            }
            
            if !shutdown_sent {
                log_to_console("🔌 RCON shutdown unavailable. Force stopping server via process manager...");
                let _ = app_state.process_manager.stop_server(server_id, crate::services::process_manager::StopReason::UpdateRequired);
            }
            
            // Poll process manager to see if process exited
            let mut wait_ticks = 30;
            while wait_ticks > 0 && app_state.process_manager.is_server_running(server_id) {
                tokio::time::sleep(Duration::from_secs(1)).await;
                wait_ticks -= 1;
            }
            
            if app_state.process_manager.is_server_running(server_id) {
                log_to_console("⚠️ Server process did not exit in 30 seconds. Applying force termination.");
                let _ = app_state.process_manager.stop_server(server_id, crate::services::process_manager::StopReason::UpdateRequired);
                
                // Kill any straggler processes matching the install path
                let path_lower = install_path.to_lowercase();
                let mut sys = app_state.sys.lock().unwrap();
                sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                for p in sys.processes().values() {
                    let exe_path = p.exe().map(|path| path.to_string_lossy().to_lowercase()).unwrap_or_default();
                    let name = p.name().to_string_lossy().to_lowercase();
                    if (name.contains("palserver") || exe_path.contains("palserver")) && exe_path.contains(&path_lower) {
                        let _ = p.kill();
                    }
                }
            } else {
                log_to_console("✓ Server process exited successfully.");
            }
            
            // Set status to updating
            {
                let db = app_state.db.lock().unwrap();
                let _ = db.update_server_status(server_id, "updating");
            }
            log::info!("[Update] Server stopped.");
        }

        // 7. Keep automatic backups before updating
        let mut backup_created = None;
        if auto_update_backup {
            log_to_console("💾 Creating pre-update backup of saves and configurations...");
            let app_dir = self.app_handle.path().app_data_dir().unwrap();
            let backup_dir = app_dir.join("backups").join(server_id.to_string());
            
            match BackupService::create_backup(
                &install_path,
                backup_dir.to_str().unwrap_or(""),
                Some("Pre-Update"),
                true,
                true,
            ) {
                Ok((backup_path, size)) => {
                    log_to_console(&format!("✓ Backup created successfully: {:?} ({} bytes)", backup_path, size));
                    
                    if let Ok(db) = app_state.db.lock() {
                        if let Ok(id) = db.create_backup(
                            server_id,
                            "pre_update",
                            backup_path.to_str().unwrap_or(""),
                            size,
                            Some("Pre-Update Backup"),
                        ) {
                            backup_created = Some((id, backup_path));
                            log_to_console("✓ Backup registered in database.");
                        }
                    }
                }
                Err(e) => {
                    log_to_console(&format!("❌ Pre-update backup failed: {}. Proceeding with update anyway...", e));
                }
            }
        }

        // 8. Run SteamCMD update task with retries
        let mut retries = 3;
        let mut update_completed = false;
        
        let (steamcmd_exe, steamcmd_dir) = {
            let db = app_state.db.lock().unwrap();
            if let Ok(Some(path)) = db.get_setting("steamcmd_path") {
                if !path.trim().is_empty() {
                    let exe = std::path::PathBuf::from(path);
                    let dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| app_state.steamcmd.get_steamcmd_dir());
                    (exe, dir)
                } else {
                    (app_state.steamcmd.get_steamcmd_exe(), app_state.steamcmd.get_steamcmd_dir())
                }
            } else {
                (app_state.steamcmd.get_steamcmd_exe(), app_state.steamcmd.get_steamcmd_dir())
            }
        };

        while retries > 0 && !update_completed {
            log_to_console(&format!("🔄 Launching SteamCMD update task (Branch: {}, Try {}/3)...", target_branch, 4 - retries));
            
            match app_state.installation_manager.start_installation(
                self.app_handle.clone(),
                server_id,
                target_branch.clone(),
                steamcmd_dir.clone(),
                steamcmd_exe.clone(),
            ) {
                Ok(_) => {
                    log_to_console("✓ SteamCMD update started. Monitoring progress...");
                    
                    let mut installation_finished = false;
                    let mut is_success = false;
                    let mut last_logged_stage = None;
                    
                    while !installation_finished {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        
                        if let Some(active_state) = app_state.installation_manager.get_active_state(server_id) {
                            let current_stage = active_state.stage;
                            if Some(current_stage) != last_logged_stage {
                                match current_stage {
                                    InstallStage::Downloading => log::info!("[SteamCMD] Downloading..."),
                                    InstallStage::Installing => log::info!("[SteamCMD] Installing..."),
                                    _ => {}
                                }
                                last_logged_stage = Some(current_stage);
                            }

                            // Update our local state to reflect SteamCMD progress
                            let mut st = state_arc.lock().unwrap();
                            st.stage = active_state.stage;
                            st.progress = active_state.progress;
                            st.status = active_state.status.clone();
                            st.bytes_downloaded = active_state.bytes_downloaded;
                            st.bytes_total = active_state.bytes_total;
                            st.speed_bps = active_state.speed_bps;
                            st.avg_speed_bps = active_state.avg_speed_bps;
                            st.peak_speed_bps = active_state.peak_speed_bps;
                            st.disk_write_speed_bps = active_state.disk_write_speed_bps;
                            st.disk_read_speed_bps = active_state.disk_read_speed_bps;
                            st.eta_seconds = active_state.eta_seconds;
                            st.cdn_server = active_state.cdn_server.clone();
                            st.elapsed_seconds = active_state.elapsed_seconds;
                            
                            // Emit tick to UI
                            let _ = self.app_handle.emit("install-tick", &*st);
                        } else {
                            installation_finished = true;
                            
                            // Sleep briefly to ensure the database write in installation_manager finishes
                            tokio::time::sleep(Duration::from_millis(500)).await;

                            // Check DB history to see if it succeeded
                            if let Ok(db) = app_state.db.lock() {
                                if let Ok(history) = db.get_install_history(server_id) {
                                    if let Some(newest) = history.first() {
                                        if newest.status == "completed" {
                                            is_success = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    if is_success {
                        log::info!("[SteamCMD] Validation complete.");
                        log_to_console("✓ SteamCMD update completed successfully.");
                        update_completed = true;
                    } else {
                        retries -= 1;
                        log_to_console(&format!("❌ SteamCMD update failed. Retries remaining: {}", retries));
                        if retries > 0 {
                            tokio::time::sleep(Duration::from_secs(10)).await;
                        }
                    }
                }
                Err(e) => {
                    retries -= 1;
                    log_to_console(&format!("❌ Failed to trigger SteamCMD update task: {}. Retries remaining: {}", e, retries));
                    if retries > 0 {
                        tokio::time::sleep(Duration::from_secs(10)).await;
                    }
                }
            }
        }

        // 9. Rollback if failed
        if !update_completed {
            log_to_console("❌ Update failed. Initiating automatic rollback of server data files...");
            
            if let Some((_backup_id, ref backup_path)) = backup_created {
                match BackupService::restore_backup(backup_path.to_str().unwrap_or(""), &install_path) {
                    Ok(_) => {
                        log_to_console("✓ Rollback successful. Server save games and configurations restored.");
                    }
                    Err(restore_err) => {
                        log_to_console(&format!("❌ Critical: Rollback failed: {}", restore_err));
                    }
                }
            } else {
                log_to_console("⚠️ No pre-update backup found to rollback files.");
            }
            
            if let Ok(db) = app_state.db.lock() {
                let _ = db.update_server_status(server_id, "stopped");
            }
            
            {
                let mut st = state_arc.lock().unwrap();
                st.is_installing = false;
                st.stage = InstallStage::Failed;
                st.status = "Update failed".to_string();
                let _ = self.app_handle.emit("install-tick", &*st);
            }

            // Send Discord Failure Notification
            let notify_discord = self.get_bool_setting(&format!("auto_update_notify_discord_{}", server_id), true);
            if notify_discord {
                let _ = crate::commands::discord::send_discord_notification(
                    app_state.clone(),
                    "update_failed".to_string(),
                    name,
                    "Palworld server auto-update failed!".to_string()
                ).await;
            }

            return Err(anyhow::anyhow!("Update failed"));
        }
            
        // 10. Automatic Restart
        if auto_update_restart && is_running {
            log::info!("[Server] Starting...");
            log_to_console("🚀 Initializing server startup...");
            
            let start_params = {
                if let Ok(db) = app_state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT install_path, startup_args, game_port, rcon_port, admin_password FROM servers WHERE id = ?1",
                            [server_id],
                            |row| Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, String>(1).unwrap_or_default(),
                                row.get::<_, u16>(2).unwrap_or(8211),
                                row.get::<_, u16>(3).unwrap_or(25575),
                                row.get::<_, String>(4).unwrap_or_default(),
                            )),
                        ).ok()
                    } else { None }
                } else { None }
            };
            
            if let Some((install_path, startup_args, game_port, rcon_port, admin_password)) = start_params {
                // Re-write the configuration to preserve all world settings
                let (config, optimize_ram): (crate::models::PalworldConfig, bool) = {
                    let db = app_state.db.lock().unwrap();
                    let conn = db.get_connection().map_err(|e| anyhow::anyhow!(e))?;
                    let (config_json, opt_ram) = conn.query_row(
                        "SELECT config_json, optimize_ram FROM servers WHERE id = ?1",
                        [server_id],
                        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1).unwrap_or(1) != 0)),
                    )?;
                    let parsed = serde_json::from_str(&config_json)?;
                    (parsed, opt_ram)
                };
                crate::services::config_generator::ConfigGenerator::write_config(&install_path, &config, optimize_ram)
                    .map_err(|e| anyhow::anyhow!(e))?;
                
                // Set DB status to starting
                if let Ok(db) = app_state.db.lock() {
                    let _ = db.update_server_status(server_id, "starting");
                    let _ = db.update_server_last_started(server_id);
                }
                
                // Spawn process
                match app_state.process_manager.start_server(
                    server_id,
                    &install_path,
                    &startup_args,
                    game_port,
                    rcon_port,
                    &admin_password,
                ) {
                    Ok(_) => {
                        log_to_console("✓ Server process spawned successfully.");
                        if let Ok(db) = app_state.db.lock() {
                            let _ = db.update_server_status(server_id, "running");
                        }
                        
                        // Restart log watcher
                        app_state.log_watcher.start_watching(server_id, &install_path);
                        
                        // Wait and reconnect RCON
                        log_to_console("🔌 Reconnecting RCON monitor in 10 seconds...");
                        tokio::time::sleep(Duration::from_secs(10)).await;
                        
                        if let Some(rcon_state) = self.app_handle.try_state::<RconState>() {
                            let rcon = &rcon_state.0;
                            match rcon.connect(server_id, &host, rcon_port, &admin_password).await {
                                Ok(_) => {
                                    log::info!("[RCON] Connected.");
                                    log_to_console("✓ RCON monitoring reconnected successfully.");
                                }
                                Err(e) => {
                                    log_to_console(&format!("⚠️ RCON reconnect failed: {}. Reconnection will be retried in the background.", e));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log_to_console(&format!("❌ Failed to restart server: {}", e));
                        if let Ok(db) = app_state.db.lock() {
                            let _ = db.update_server_status(server_id, "crashed");
                        }
                    }
                }
            }
        } else {
            // Reset state to stopped since it was not running before
            if let Ok(db) = app_state.db.lock() {
                let _ = db.update_server_status(server_id, "stopped");
            }
        }
 
        // 11. Finalize
        log::info!("[Update] Completed successfully.");
        log_to_console("🎉 Automated update process completed successfully!");
        {
            let mut st = state_arc.lock().unwrap();
            st.is_installing = false;
            st.stage = InstallStage::Completed;
            st.progress = 100.0;
            st.status = "Update completed successfully!".to_string();
            let _ = self.app_handle.emit("install-tick", &*st);
        }

        // Send Discord Success Notification
        let notify_discord = self.get_bool_setting(&format!("auto_update_notify_discord_{}", server_id), true);
        if notify_discord {
            let _ = crate::commands::discord::send_discord_notification(
                app_state.clone(),
                "update_success".to_string(),
                name,
                "Palworld server auto-update finished successfully!".to_string()
            ).await;
        }

        Ok(())
    }

    fn get_bool_setting(&self, key: &str, default: bool) -> bool {
        let state = self.app_handle.state::<AppState>();
        let val = if let Ok(db) = state.db.lock() {
            db.get_setting(key)
                .unwrap_or(None)
                .map(|v| v == "true")
                .unwrap_or(default)
        } else {
            default
        };
        val
    }

    fn get_int_setting(&self, key: &str, default: u32) -> u32 {
        let state = self.app_handle.state::<AppState>();
        let val = if let Ok(db) = state.db.lock() {
            db.get_setting(key)
                .unwrap_or(None)
                .and_then(|v| v.parse().ok())
                .unwrap_or(default)
        } else {
            default
        };
        val
    }
}
