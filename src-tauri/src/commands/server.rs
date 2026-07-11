/// Server CRUD + Lifecycle Tauri Commands

use crate::AppState;
use crate::models::{CreateServerRequest, Server, PalworldConfig};
use crate::services::config_generator::ConfigGenerator;
use tauri::{State, Manager};
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
        crate::services::config_generator::ConfigGenerator::write_config(&request.install_path, &config)?;
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

    // Check port availability
    if !crate::services::network::NetworkUtils::is_port_available(game_port) {
        return Err(format!("Game Port {} is already in use. Please choose a different port or stop the conflicting process.", game_port));
    }

    if !crate::services::network::NetworkUtils::is_port_available(rcon_port) {
        return Err(format!("RCON Port {} is already in use. Please choose a different RCON port or stop the conflicting process.", rcon_port));
    }

    // Sync config from DB to INI file right before starting
    let config: PalworldConfig = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        let config_json: String = conn.query_row(
            "SELECT config_json FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        ).map_err(|e| format!("Failed to get server config: {}", e))?;
        serde_json::from_str(&config_json).map_err(|e| format!("Failed to parse config: {}", e))?
    };
    ConfigGenerator::write_config(&install_path, &config)?;

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
                let mut cmd_game = std::process::Command::new("powershell");
                cmd_game.args([
                    "-Command",
                    &format!(
                        "Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName '{}' -Direction Inbound -Action Allow -Protocol UDP -LocalPort {}",
                        game_rule_name, game_rule_name, game_port
                    )
                ])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    cmd_game.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }

                let _ = cmd_game.status();

                let rcon_rule_name = format!("Palworld Server RCON {}", rcon_port);
                let mut cmd_rcon = std::process::Command::new("powershell");
                cmd_rcon.args([
                    "-Command",
                    &format!(
                        "Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName '{}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort {}",
                        rcon_rule_name, rcon_rule_name, rcon_port
                    )
                ])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    cmd_rcon.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }

                let _ = cmd_rcon.status();
            }

            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.update_server_status(server_id, "running")?;

            Ok(())
        }
        Err(e) => {
            let db = state.db.lock().map_err(|e2| e2.to_string())?;
            db.update_server_status(server_id, "crashed")?;
            Err(format!("Failed to start server: {}", e))
        }
    }
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

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_server_status(server_id, "stopping")?;
    }

    // Stop log watcher
    state.log_watcher.stop_watching(server_id);

    let reason = if force {
        StopReason::UserAction
    } else {
        StopReason::UserAction
    };

    match state.process_manager.stop_server(server_id, reason) {
        Ok(_) => {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.update_server_status(server_id, "stopped")?;
            Ok(())
        }
        Err(e) => {
            let db = state.db.lock().map_err(|e2| e2.to_string())?;
            db.update_server_status(server_id, "stopped")?;
            Err(format!("Error stopping server: {}", e))
        }
    }
}

#[tauri::command]
pub async fn restart_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_server_status(server_id, "restarting")?;
    }

    // Stop
    if state.process_manager.is_server_running(server_id) {
        state.log_watcher.stop_watching(server_id);
        let _ = state.process_manager.stop_server(server_id, StopReason::ScheduledRestart);
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }

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
        let is_running = state.process_manager.is_server_running(server_id);
        let pid = state.process_manager.get_server_pid(server_id);
        let uptime = state.process_manager.get_server_uptime(server_id);

        let stats = pid.and_then(crate::services::system_analyzer::SystemAnalyzer::get_process_stats);

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

#[tauri::command]
pub async fn wipe_server(
    state: State<'_, AppState>,
    server_id: i64,
    wipe_saves: bool,
    wipe_configs: bool,
) -> Result<(), String> {
    // 1. Ensure the server is not running
    if state.process_manager.is_server_running(server_id) {
        return Err("Cannot wipe server data while the server is running. Please stop the server first.".to_string());
    }

    // 2. Get install path
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let install = std::path::PathBuf::from(&install_path);

    // 3. Wipe Saves if requested
    if wipe_saves {
        let save_dir = install.join("Pal").join("Saved").join("SaveGames");
        if save_dir.exists() {
            log::info!("[SERVER] Wiping save games directory: {:?}", save_dir);
            std::fs::remove_dir_all(&save_dir)
                .map_err(|e| format!("Failed to delete SaveGames folder: {}", e))?;
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
        ConfigGenerator::write_config(&install_path, &default_config)?;
    }

    Ok(())
}

