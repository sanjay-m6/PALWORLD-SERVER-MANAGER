/// Server CRUD + Lifecycle Tauri Commands

use crate::AppState;
use crate::models::{CreateServerRequest, Server, PalworldConfig};
use crate::services::config_generator::ConfigGenerator;
use tauri::{State, Manager};
use std::sync::Mutex;
use crate::services::process_manager::StopReason;

#[tauri::command]
pub async fn get_servers(state: State<'_, AppState>) -> Result<Vec<Server>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_servers()
}

#[tauri::command]
pub async fn create_server(
    state: State<'_, AppState>,
    request: CreateServerRequest,
) -> Result<Server, String> {
    // Check if the ports are already in use by another server in the DB
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        
        // Check game_port
        let conflict_game: Option<String> = conn.query_row(
            "SELECT name FROM servers WHERE game_port = ?1",
            [request.game_port as i64],
            |row| row.get(0),
        ).ok();
        if let Some(other_name) = conflict_game {
            return Err(format!("Game Port {} is already configured for server '{}'. Each server must have a unique Game Port.", request.game_port, other_name));
        }

        // Check rcon_port
        let conflict_rcon: Option<String> = conn.query_row(
            "SELECT name FROM servers WHERE rcon_port = ?1",
            [request.rcon_port as i64],
            |row| row.get(0),
        ).ok();
        if let Some(other_name) = conflict_rcon {
            return Err(format!("RCON Port {} is already configured for server '{}'. Each server must have a unique RCON Port.", request.rcon_port, other_name));
        }

        // Check rest_api_port
        let conflict_rest: Option<String> = conn.query_row(
            "SELECT name FROM servers WHERE rest_api_port = ?1",
            [request.rest_api_port as i64],
            |row| row.get(0),
        ).ok();
        if let Some(other_name) = conflict_rest {
            return Err(format!("REST API Port {} is already configured for server '{}'. Each server must have a unique REST API Port.", request.rest_api_port, other_name));
        }
    }

    // Generate config from preset or existing file if import
    let mut config = if request.is_import.unwrap_or(false) {
        let settings_path = crate::services::config_generator::ConfigGenerator::get_settings_path(&request.install_path);
        if settings_path.exists() {
            crate::services::ini_parser::read_settings_file(&settings_path)
                .ok()
                .map(|_| {
                    // We don't want to parse everything back perfectly here, we just need to preserve it
                    // Actually, a better approach is to NOT write the config file if it's an import,
                    // BUT we still need the JSON for the DB. We can generate a dummy JSON or partial from preset.
                    // Wait, writing config to disk will OVERWRITE it if we call write_config later.
                    // So let's just use the preset for the DB json, and skip write_config if it's an import!
                    crate::services::config_generator::ConfigGenerator::from_preset(&request.preset)
                })
                .unwrap_or_else(|| crate::services::config_generator::ConfigGenerator::from_preset(&request.preset))
        } else {
            crate::services::config_generator::ConfigGenerator::from_preset(&request.preset)
        }
    } else {
        crate::services::config_generator::ConfigGenerator::from_preset(&request.preset)
    };

    // Apply the customized request settings to config
    config.public_port = request.game_port;
    config.rcon_port = request.rcon_port;
    config.rest_api_port = request.rest_api_port;
    config.server_player_max_num = request.max_players;
    config.admin_password = request.admin_password.clone();
    if let Some(ref pass) = request.server_password {
        config.server_password = pass.clone();
    }
    
    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    // Create in database
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let id = db.create_server(&request, &config_json)?;

    // Write PalWorldSettings.ini to disk if not remote and not an import
    drop(db); // Release lock before file I/O
    if !request.is_remote.unwrap_or(false) && !request.is_import.unwrap_or(false) {
        crate::services::config_generator::ConfigGenerator::write_config(&request.install_path, &config, true)?;
    }

    // Fetch the created server
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let servers = db.get_all_servers()?;
    servers
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| "Server created but not found".to_string())
}

#[tauri::command]
pub async fn delete_server(
    state: State<'_, AppState>,
    server_id: i64,
    backup_first: bool,
    delete_files: bool,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        match db.get_server_install_path(server_id) {
            Ok(path) => path,
            Err(e) => {
                if e.contains("Query returned no rows") || e.contains("Server not found") {
                    // Server already deleted or not in database, return success to clear UI state
                    log::warn!("[SERVER] delete_server called for server_id {} which is not in the database", server_id);
                    return Ok(());
                }
                return Err(e);
            }
        }
    };

    // Stop server if running to release file handles
    if state.process_manager.get_server_pid(server_id).is_some() {
        let _ = state.process_manager.stop_server(server_id, StopReason::UserAction);
        std::thread::sleep(std::time::Duration::from_secs(2));
    }

    // Optionally backup before deletion
    if backup_first {
        let app_dir = state.app_handle.path().app_data_dir()
            .map_err(|e| format!("Failed to get app dir: {}", e))?;
        let backup_dir = app_dir.join("backups").join(server_id.to_string());

        crate::services::backup_service::BackupService::create_backup(
            &install_path,
            backup_dir.to_str().unwrap_or(""),
            Some("pre_delete"),
            true,
            true,
        )?;
    }

    // Delete actual server directory from local machine if requested
    // This is done BEFORE database deletion so that if it fails, the database record
    // is kept and the deletion can be retried.
    if delete_files {
        let path = std::path::Path::new(&install_path);
        if path.exists() && path.is_dir() {
            log::info!("[SERVER] Deleting server directory: {:?}", path);
            std::fs::remove_dir_all(path)
                .map_err(|e| format!("Failed to delete server folder: {}", e))?;
        }
    }

    // Delete from database (cascades to backups, tasks, mods)
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.delete_server(server_id)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn start_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    // Check if remote
    let is_remote = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT is_remote FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, i32>(0),
        ).map(|v| v != 0).unwrap_or(false)
    };
    if is_remote {
        return Err("Cannot start a remote server locally. It is managed externally.".to_string());
    }

    // Get server info
    let (install_path, startup_args, game_port, rcon_port, admin_password) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
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
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    // Check if server is already running in ProcessManager
    if state.process_manager.is_server_running(server_id) {
        return Err("Server is already running.".to_string());
    }

    // Check if another process for this server is already running on the OS from the same install directory
    let install_path_lower = install_path.to_lowercase();
    let is_already_running_on_system = {
        let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        sys.processes().values().any(|p| {
            let exe_path = p.exe().map(|path| path.to_string_lossy().to_lowercase()).unwrap_or_default();
            let name = p.name().to_string_lossy().to_lowercase();
            (name.contains("palserver") || exe_path.contains("palserver")) && exe_path.contains(&install_path_lower)
        })
    };
    if is_already_running_on_system {
        return Err("Another process for this server is already running on the system.".to_string());
    }

    // Check port availability
    if !crate::services::network::NetworkUtils::is_port_available(game_port) {
        return Err(format!("Game Port {} is already in use. Please choose a different port or stop the conflicting process.", game_port));
    }

    if !crate::services::network::NetworkUtils::is_port_available(rcon_port) {
        return Err(format!("RCON Port {} is already in use. Please choose a different RCON port or stop the conflicting process.", rcon_port));
    }

    // Sync config from DB to INI file right before starting
    let (config, optimize_ram): (PalworldConfig, bool) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        let (config_json, opt_ram) = conn.query_row(
            "SELECT config_json, optimize_ram FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1).unwrap_or(1) != 0)),
        ).map_err(|e| format!("Failed to get server config: {}", e))?;
        let parsed = serde_json::from_str(&config_json).map_err(|e| format!("Failed to parse config: {}", e))?;
        (parsed, opt_ram)
    };
    ConfigGenerator::write_config(&install_path, &config, optimize_ram)?;

    // Update status to starting
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_server_status(server_id, "starting")?;
        db.update_server_last_started(server_id)?;
    }

    // Start the process
    match state.process_manager.start_server(
        server_id,
        &install_path,
        &startup_args,
        game_port,
        rcon_port,
        &admin_password,
    ) {
        Ok(_pid) => {
            // Auto allocate firewall rules
            #[cfg(target_os = "windows")]
            {
                let game_rule_name = format!("Palworld Game Server Port {}", game_port);
                
                let mut del_game = std::process::Command::new("netsh");
                del_game.args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", game_rule_name)])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null());
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    del_game.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }
                let _ = del_game.status();

                let mut add_game = std::process::Command::new("netsh");
                add_game.args([
                    "advfirewall", "firewall", "add", "rule",
                    &format!("name={}", game_rule_name),
                    "dir=in",
                    "action=allow",
                    "protocol=UDP",
                    &format!("localport={}", game_port)
                ])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    add_game.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }
                let _ = add_game.status();

                let rcon_rule_name = format!("Palworld Server RCON {}", rcon_port);
                
                let mut del_rcon = std::process::Command::new("netsh");
                del_rcon.args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", rcon_rule_name)])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null());
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    del_rcon.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }
                let _ = del_rcon.status();

                let mut add_rcon = std::process::Command::new("netsh");
                add_rcon.args([
                    "advfirewall", "firewall", "add", "rule",
                    &format!("name={}", rcon_rule_name),
                    "dir=in",
                    "action=allow",
                    "protocol=TCP",
                    &format!("localport={}", rcon_port)
                ])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    add_rcon.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }
                let _ = add_rcon.status();
            }

            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.update_server_status(server_id, "running")?;

            state.log_watcher.start_watching(server_id, &install_path);

            Ok(())
        }
        Err(e) => {
            let db = state.db.lock().map_err(|e2| e2.to_string())?;
            db.update_server_status(server_id, "crashed")?;
            Err(format!("Failed to start server: {}", e))
        }
    }
}

fn kill_all_processes_for_install_path(sys_mutex: &Mutex<sysinfo::System>, install_path: &str) {
    let mut sys = match sys_mutex.lock() {
        Ok(s) => s,
        Err(_) => return,
    };
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let install_path_lower = install_path.to_lowercase();
    
    for (pid, p) in sys.processes() {
        let exe_path = p.exe().map(|path| path.to_string_lossy().to_lowercase()).unwrap_or_default();
        let name = p.name().to_string_lossy().to_lowercase();
        
        if (name.contains("palserver") || exe_path.contains("palserver")) && exe_path.contains(&install_path_lower) {
            let pid_str = pid.to_string();
            log::info!("[PROCESS] Force-killing untracked server process with PID {}", pid_str);
            
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/PID", &pid_str])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                if let Ok(pid_val) = pid_str.parse::<i32>() {
                    unsafe {
                        libc::kill(pid_val, libc::SIGKILL);
                    }
                }
            }
        }
    }
}

async fn execute_graceful_shutdown_sequence(
    app_handle: &tauri::AppHandle,
    state: &crate::AppState,
    server_id: i64,
) -> bool {
    let (is_remote, host, rest_api_port, rest_api_enabled, rcon_port, rcon_enabled, admin_password) = {
        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
                conn.query_row(
                    "SELECT is_remote, host, rest_api_port, rest_api_enabled, rcon_port, rcon_enabled, admin_password FROM servers WHERE id = ?1",
                    [server_id],
                    |row| Ok((
                        row.get::<_, i32>(0).unwrap_or(0) != 0,
                        row.get::<_, String>(1).unwrap_or_else(|_| "127.0.0.1".to_string()),
                        row.get::<_, u16>(2).unwrap_or(8212),
                        row.get::<_, i32>(3).unwrap_or(1) != 0,
                        row.get::<_, u16>(4).unwrap_or(25575),
                        row.get::<_, i32>(5).unwrap_or(1) != 0,
                        row.get::<_, String>(6).unwrap_or_default(),
                    )),
                ).unwrap_or((false, "127.0.0.1".to_string(), 8212, true, 25575, true, "".to_string()))
            } else {
                (false, "127.0.0.1".to_string(), 8212, true, 25575, true, "".to_string())
            }
        } else {
            (false, "127.0.0.1".to_string(), 8212, true, 25575, true, "".to_string())
        }
    };

    if is_remote {
        return false;
    }

    // Try REST API first
    if rest_api_enabled {
        let client = crate::services::palworld_rest_api::PalworldRestApiClient::new(&host, rest_api_port, &admin_password);
        let player_count = match client.get_players().await {
            Ok(players) => players.len(),
            Err(_) => 0,
        };

        if player_count > 0 {
            log::info!("[SERVER] Active players detected. Sending countdown via REST API.");
            if let Ok(_) = client.shutdown(30, "Server_stopping_in_30_seconds!").await {
                tokio::time::sleep(std::time::Duration::from_secs(33)).await;
                return true;
            }
        } else {
            if let Ok(_) = client.shutdown(1, "Server_stopping_now!").await {
                tokio::time::sleep(std::time::Duration::from_secs(4)).await;
                return true;
            }
        }
    }

    // Try RCON if REST API failed or was disabled
    if rcon_enabled {
        if let Some(rcon_state) = app_handle.try_state::<crate::commands::rcon::RconState>() {
            if let Ok(_) = rcon_state.0.connect(server_id, &host, rcon_port, &admin_password).await {
                let mut player_count = 0;
                if let Ok(response) = rcon_state.0.send_command(server_id, "ShowPlayers").await {
                    let players = crate::services::rcon::RconService::parse_player_list(&response);
                    player_count = players.len();
                }

                if player_count > 0 {
                    log::info!("[SERVER] Active players detected. Sending countdown via RCON.");
                    let _ = rcon_state.0.send_command(server_id, "Broadcast Server_stopping_in_30_seconds!_Please_log_out.").await;
                    tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                    let _ = rcon_state.0.send_command(server_id, "Broadcast Server_stopping_in_15_seconds!").await;
                    tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                    let _ = rcon_state.0.send_command(server_id, "Save").await;
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    let _ = rcon_state.0.send_command(server_id, "Shutdown 1 Server_stopping_now!").await;
                    tokio::time::sleep(std::time::Duration::from_secs(4)).await;
                    return true;
                } else {
                    let _ = rcon_state.0.send_command(server_id, "Save").await;
                    let _ = rcon_state.0.send_command(server_id, "Shutdown 1 Server_stopping_now!").await;
                    tokio::time::sleep(std::time::Duration::from_secs(4)).await;
                    return true;
                }
            }
        }
    }

    false
}

#[tauri::command]
pub async fn stop_server(
    state: State<'_, AppState>,
    server_id: i64,
    force: bool,
) -> Result<(), String> {
    // Check if remote
    let is_remote = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT is_remote FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, i32>(0),
        ).map(|v| v != 0).unwrap_or(false)
    };
    if is_remote {
        return Err("Cannot stop a remote server locally. It is managed externally.".to_string());
    }

    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_server_status(server_id, "stopping")?;
    }

    // Stop log watcher
    state.log_watcher.stop_watching(server_id);

    // Try graceful RCON/REST API shutdown first if force is false
    let mut graceful_done = false;
    if !force {
        state.process_manager.set_server_stopping(server_id, true);
        graceful_done = execute_graceful_shutdown_sequence(&state.app_handle, &state, server_id).await;
    }

    if !graceful_done {
        // Fallback to standard process manager stop (taskkill)
        let _ = state.process_manager.stop_server(server_id, StopReason::UserAction);
        kill_all_processes_for_install_path(&state.sys, &install_path);
    } else {
        // Just make sure it is untracked in ProcessManager and database status updated
        state.process_manager.untrack_server(server_id, StopReason::UserAction);
    }

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_server_status(server_id, "stopped")?;
    }

    Ok(())
}

#[tauri::command]
pub async fn restart_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_server_status(server_id, "restarting")?;
    }

    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    // Stop
    state.log_watcher.stop_watching(server_id);
    if state.process_manager.is_server_running(server_id) {
        let _ = stop_server(state.clone(), server_id, false).await;
    }

    // Force-kill any remaining processes for this server path
    kill_all_processes_for_install_path(&state.sys, &install_path);
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // Start
    start_server(state, server_id).await
}


#[tauri::command]
pub async fn get_server_status(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<serde_json::Value, String> {
    let (is_remote, host, rcon_port, status) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT is_remote, host, rcon_port, status FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((
                row.get::<_, i32>(0).unwrap_or(0) != 0,
                row.get::<_, String>(1).unwrap_or_else(|_| "127.0.0.1".to_string()),
                row.get::<_, u16>(2).unwrap_or(25575),
                row.get::<_, String>(3).unwrap_or_else(|_| "stopped".to_string()),
            )),
        ).map_err(|e| e.to_string())?
    };

    if is_remote {
        let addr = format!("{}:{}", host, rcon_port);
        let is_running = tokio::time::timeout(
            std::time::Duration::from_millis(200),
            tokio::net::TcpStream::connect(&addr),
        )
        .await
        .map(|res| res.is_ok())
        .unwrap_or(false);

        let new_status = if is_running { "online" } else { "stopped" };
        if new_status != status {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.update_server_status(server_id, new_status)?;
        }

        Ok(serde_json::json!({
            "isRunning": is_running,
            "pid": null,
            "uptimeSeconds": null,
            "cpuUsage": null,
            "memoryMb": null,
        }))
    } else {
        let mut is_running = state.process_manager.is_server_running(server_id);
        
        // If not tracked by ProcessManager, check if it's running on the OS and adopt it
        if !is_running {
            if let Ok((install_path, admin_password)) = (|| -> Result<(String, String), String> {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let conn = db.get_connection()?;
                conn.query_row(
                    "SELECT install_path, admin_password FROM servers WHERE id = ?1",
                    [server_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                ).map_err(|e| e.to_string())
            })() {
                let install_path_lower = install_path.to_lowercase();
                let mut os_pid = None;
                if let Ok(mut sys) = state.sys.lock() {
                    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                    for (pid, p) in sys.processes() {
                        let exe_path = p.exe().map(|path| path.to_string_lossy().to_lowercase()).unwrap_or_default();
                        let name = p.name().to_string_lossy().to_lowercase();
                        if (name.contains("palserver") || exe_path.contains("palserver")) && exe_path.contains(&install_path_lower) {
                            os_pid = Some(pid.as_u32());
                            break;
                        }
                    }
                }
                
                if let Some(pid_val) = os_pid {
                    log::info!("[PROCESS] Recovered orphaned server process on OS for server {} with PID {}. Adopting.", server_id, pid_val);
                    state.process_manager.adopt_server_process(server_id, pid_val, &admin_password);
                    state.log_watcher.start_watching(server_id, &install_path);
                    is_running = true;
                }
            }
        }
        
        // Sync database status if mismatch
        if is_running {
            if status == "starting" || status == "stopped" || status == "crashed" {
                if let Ok(db) = state.db.lock() {
                    let _ = db.update_server_status(server_id, "running");
                }
            }
        } else {
            if status == "running" || status == "online" {
                if let Ok(db) = state.db.lock() {
                    let _ = db.update_server_status(server_id, "stopped");
                }
            }
        }

        let pid = state.process_manager.get_server_pid(server_id);
        let uptime = state.process_manager.get_server_uptime(server_id);

        let stats = if let Some(p) = pid {
            if let Ok(mut sys) = state.sys.lock() {
                crate::services::system_analyzer::SystemAnalyzer::get_process_stats(&mut sys, p)
            } else { None }
        } else { None };

        Ok(serde_json::json!({
            "isRunning": is_running,
            "pid": pid,
            "uptimeSeconds": uptime,
            "cpuUsage": stats.as_ref().map(|s| s.cpu_usage),
            "memoryMb": stats.as_ref().map(|s| s.memory_mb),
        }))
    }
}

#[tauri::command]
pub async fn update_server_branch(
    state: State<'_, AppState>,
    server_id: i64,
    branch: String,
) -> Result<(), String> {
    use rusqlite::params;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection()?;
    conn.execute(
        "UPDATE servers SET branch = ?1 WHERE id = ?2",
        params![branch, server_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_server_auto_start(
    state: State<'_, AppState>,
    server_id: i64,
    auto_start: bool,
) -> Result<(), String> {
    use rusqlite::params;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection()?;
    conn.execute(
        "UPDATE servers SET auto_start = ?1 WHERE id = ?2",
        params![if auto_start { 1 } else { 0 }, server_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_dir_all_force(path: &std::path::Path) -> std::io::Result<()> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_file() {
        let mut perms = std::fs::metadata(path)?.permissions();
        if perms.readonly() {
            perms.set_readonly(false);
            std::fs::set_permissions(path, perms)?;
        }
        std::fs::remove_file(path)?;
        return Ok(());
    }
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();
        remove_dir_all_force(&entry_path)?;
    }
    let mut perms = std::fs::metadata(path)?.permissions();
    if perms.readonly() {
        perms.set_readonly(false);
        std::fs::set_permissions(path, perms)?;
    }
    std::fs::remove_dir(path)?;
    Ok(())
}

#[tauri::command]
pub async fn wipe_server(
    state: State<'_, AppState>,
    server_id: i64,
    wipe_saves: bool,
    wipe_configs: bool,
    wipe_players_only: bool,
    wipe_map_only: bool,
) -> Result<(), String> {
    // 1. Ensure the server is not running
    if state.process_manager.is_server_running(server_id) {
        return Err("Cannot wipe server data while the server is running. Please stop the server first.".to_string());
    }

    // 2. Get install path & optimize_ram setting
    let (install_path, optimize_ram) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT install_path, optimize_ram FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1).unwrap_or(1) != 0)),
        ).map_err(|e| e.to_string())?
    };

    let install = std::path::PathBuf::from(&install_path);

    // Helper function to find the world save folder
    let get_world_save_dir = |install_path: &std::path::Path| -> Option<std::path::PathBuf> {
        let save_games_0 = install_path.join("Pal").join("Saved").join("SaveGames").join("0");
        if !save_games_0.exists() {
            return None;
        }
        if let Ok(entries) = std::fs::read_dir(save_games_0) {
            for entry in entries.filter_map(|e| e.ok()) {
                if entry.path().is_dir() {
                    return Some(entry.path());
                }
            }
        }
        None
    };

    // 3. Wipe Saves if requested
    if wipe_saves {
        let save_dir = install.join("Pal").join("Saved").join("SaveGames");
        if save_dir.exists() {
            log::info!("[SERVER] Wiping save games directory: {:?}", save_dir);
            remove_dir_all_force(&save_dir)
                .map_err(|e| format!("Failed to delete SaveGames folder: {}", e))?;
        }
    } else {
        if wipe_players_only {
            if let Some(world_dir) = get_world_save_dir(&install) {
                let players_dir = world_dir.join("Players");
                if players_dir.exists() {
                    log::info!("[SERVER] Wiping player saves only: {:?}", players_dir);
                    remove_dir_all_force(&players_dir)
                        .map_err(|e| format!("Failed to delete Players folder: {}", e))?;
                    std::fs::create_dir_all(&players_dir)
                        .map_err(|e| format!("Failed to recreate Players folder: {}", e))?;
                }
            }
        }
        if wipe_map_only {
            if let Some(world_dir) = get_world_save_dir(&install) {
                let level_sav = world_dir.join("Level.sav");
                let level_meta_sav = world_dir.join("LevelMeta.sav");
                log::info!("[SERVER] Wiping map/world data only from {:?}", world_dir);
                if level_sav.exists() {
                    let _ = std::fs::remove_file(&level_sav);
                }
                if level_meta_sav.exists() {
                    let _ = std::fs::remove_file(&level_meta_sav);
                }
            }
        }
    }

    // 4. Wipe/Reset Configs if requested
    if wipe_configs {
        // Load current config from DB
        let current_config: PalworldConfig = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection()?;
            let config_json: String = conn.query_row(
                "SELECT config_json FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            ).map_err(|e| format!("Server config not found: {}", e))?;
            serde_json::from_str(&config_json).map_err(|e| e.to_string())?
        };

        // Create default config
        let mut default_config = PalworldConfig::default();

        // Preserve ports, passwords, names, and api enables
        default_config.server_name = current_config.server_name;
        default_config.server_description = current_config.server_description;
        default_config.public_port = current_config.public_port;
        default_config.rcon_port = current_config.rcon_port;
        default_config.rest_api_port = current_config.rest_api_port;
        default_config.admin_password = current_config.admin_password;
        default_config.server_password = current_config.server_password;
        default_config.public_ip = current_config.public_ip;
        default_config.region = current_config.region;
        default_config.ban_list_url = current_config.ban_list_url;
        default_config.rcon_enabled = current_config.rcon_enabled;
        default_config.rest_api_enabled = current_config.rest_api_enabled;
        default_config.useauth = current_config.useauth;
        default_config.crossplay_platforms = current_config.crossplay_platforms;

        let config_json = serde_json::to_string(&default_config).map_err(|e| e.to_string())?;

        // Update DB
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.update_server_config(server_id, &config_json)?;
            db.update_server_ports_and_settings(
                server_id,
                default_config.public_port,
                default_config.rcon_port,
                default_config.rest_api_port,
                default_config.server_player_max_num,
                &default_config.admin_password,
                &default_config.server_password,
            )?;
        }

        // Write to INI file
        ConfigGenerator::write_config(&install_path, &default_config, optimize_ram)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn update_server_auto_restart(
    state: State<'_, AppState>,
    server_id: i64,
    auto_restart: bool,
) -> Result<(), String> {
    use rusqlite::params;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection()?;
    conn.execute(
        "UPDATE servers SET auto_restart = ?1 WHERE id = ?2",
        params![if auto_restart { 1 } else { 0 }, server_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_server_run_as_admin(
    state: State<'_, AppState>,
    server_id: i64,
    run_as_admin: bool,
) -> Result<(), String> {
    use rusqlite::params;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection()?;
    conn.execute(
        "UPDATE servers SET run_as_admin = ?1 WHERE id = ?2",
        params![if run_as_admin { 1 } else { 0 }, server_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_server_optimize_ram(
    state: State<'_, AppState>,
    server_id: i64,
    optimize_ram: bool,
) -> Result<(), String> {
    use rusqlite::params;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection()?;
    conn.execute(
        "UPDATE servers SET optimize_ram = ?1 WHERE id = ?2",
        params![if optimize_ram { 1 } else { 0 }, server_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn clear_server_cache(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    // 1. Get install path
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    // Check if the server is running on the OS
    let install_path_lower = install_path.to_lowercase();
    let is_running_on_system = {
        let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        sys.processes().values().any(|p| {
            let exe_path = p.exe().map(|path| path.to_string_lossy().to_lowercase()).unwrap_or_default();
            let name = p.name().to_string_lossy().to_lowercase();
            (name.contains("palserver") || exe_path.contains("palserver")) && exe_path.contains(&install_path_lower)
        })
    };
    if is_running_on_system {
        return Err("Cannot clear cache while the server is running. Please stop the server first.".to_string());
    }

    let base = std::path::PathBuf::from(&install_path);


    // 2. Clear Crashes folder
    let crashes_dir = base.join("Pal").join("Saved").join("Crashes");
    if crashes_dir.exists() {
        log::info!("[CACHE] Clearing Crashes directory: {:?}", crashes_dir);
        remove_dir_all_force(&crashes_dir)
            .map_err(|e| format!("Failed to delete Crashes directory: {}", e))?;
        std::fs::create_dir_all(&crashes_dir)
            .map_err(|e| format!("Failed to recreate Crashes directory: {}", e))?;
    }

    // 3. Clear Logs folder
    let logs_dir = base.join("Pal").join("Saved").join("Logs");
    if logs_dir.exists() {
        log::info!("[CACHE] Clearing Logs directory: {:?}", logs_dir);
        remove_dir_all_force(&logs_dir)
            .map_err(|e| format!("Failed to delete Logs directory: {}", e))?;
        std::fs::create_dir_all(&logs_dir)
            .map_err(|e| format!("Failed to recreate Logs directory: {}", e))?;
    }

    // 4. Clear SteamCMD appcache
    let steamcmd_appcache = state.steamcmd.get_steamcmd_dir().join("appcache");
    if steamcmd_appcache.exists() {
        log::info!("[CACHE] Clearing SteamCMD appcache: {:?}", steamcmd_appcache);
        remove_dir_all_force(&steamcmd_appcache)
            .map_err(|e| format!("Failed to delete SteamCMD appcache: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn clone_server(
    state: State<'_, AppState>,
    server_id: i64,
    new_name: String,
    new_install_path: String,
) -> Result<Server, String> {
    // 1. Fetch source server from database
    let source_server = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let servers = db.get_all_servers()?;
        servers
            .into_iter()
            .find(|s| s.id == server_id)
            .ok_or_else(|| "Source server not found".to_string())?
    };

    // 2. Automatically find next available ports starting from source server's ports
    let ports = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        
        let mut stmt = conn.prepare("SELECT game_port, rcon_port, rest_api_port FROM servers")
            .map_err(|e| e.to_string())?;
        
        let port_rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
        }).map_err(|e| e.to_string())?;

        let mut reserved_game = std::collections::HashSet::new();
        let mut reserved_rcon = std::collections::HashSet::new();
        let mut reserved_rest = std::collections::HashSet::new();

        for row in port_rows {
            if let Ok((game, rcon, rest)) = row {
                reserved_game.insert(game as u16);
                reserved_rcon.insert(rcon as u16);
                reserved_rest.insert(rest as u16);
            }
        }

        fn is_port_free(port: u16) -> bool {
            let tcp_ok = std::net::TcpListener::bind(("127.0.0.1", port)).is_ok();
            let udp_ok = std::net::UdpSocket::bind(("0.0.0.0", port)).is_ok();
            tcp_ok && udp_ok
        }

        let mut game_port = source_server.ports.game_port;
        while reserved_game.contains(&game_port) || !is_port_free(game_port) {
            game_port += 1;
        }

        let mut rcon_port = source_server.ports.rcon_port;
        while reserved_rcon.contains(&rcon_port) || !is_port_free(rcon_port) {
            rcon_port += 1;
        }

        let mut rest_api_port = source_server.ports.rest_api_port;
        while reserved_rest.contains(&rest_api_port) || rest_api_port == game_port || !is_port_free(rest_api_port) {
            rest_api_port += 1;
        }

        crate::models::ServerPorts {
            game_port,
            rcon_port,
            rest_api_port,
        }
    };

    // 3. Copy save files and config files from source to target install path if not remote
    if !source_server.is_remote {
        let src_saved_dir = source_server.install_path.join("Pal").join("Saved");
        let dest_saved_dir = std::path::PathBuf::from(&new_install_path).join("Pal").join("Saved");

        if src_saved_dir.exists() {
            fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
                std::fs::create_dir_all(dst)?;
                for entry in std::fs::read_dir(src)? {
                    let entry = entry?;
                    let ty = entry.file_type()?;
                    if ty.is_dir() {
                        copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
                    } else {
                        std::fs::copy(entry.path(), dst.join(entry.file_name()))?;
                    }
                }
                Ok(())
            }

            let _ = copy_dir_all(&src_saved_dir, &dest_saved_dir);
        }
    }

    // 4. Create server request to insert in DB
    let request = CreateServerRequest {
        name: new_name,
        description: Some(source_server.description.clone()),
        install_path: new_install_path,
        preset: source_server.preset.clone(),
        game_port: ports.game_port,
        rcon_port: ports.rcon_port,
        rest_api_port: ports.rest_api_port,
        max_players: source_server.max_players,
        admin_password: source_server.admin_password.clone(),
        server_password: source_server.server_password.clone(),
        is_public: source_server.is_public,
        auto_start: source_server.auto_start,
        host: Some(source_server.host.clone()),
        is_remote: Some(source_server.is_remote),
        is_import: Some(true),
        auto_restart: Some(source_server.auto_restart),
        run_as_admin: Some(source_server.run_as_admin),
    };

    // Parse config_json or update the ports in config_json
    let mut config: PalworldConfig = serde_json::from_str(&source_server.config_json)
        .unwrap_or_else(|_| crate::services::config_generator::ConfigGenerator::from_preset(&request.preset));
    
    // Update ports in the config
    config.public_port = request.game_port;
    config.rcon_port = request.rcon_port;
    config.rest_api_port = request.rest_api_port;
    config.server_name = request.name.clone();

    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    // Create in database
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let id = db.create_server(&request, &config_json)?;

    // Write updated config file to the new destination to reflect the new ports
    if !request.is_remote.unwrap_or(false) {
        let _ = crate::services::config_generator::ConfigGenerator::write_config(&request.install_path, &config, true);
    }

    drop(db);

    // Fetch the created server
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let servers = db.get_all_servers()?;
    servers
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| "Server cloned but not found".to_string())
}


