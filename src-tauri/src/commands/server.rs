/// Server CRUD + Lifecycle Tauri Commands

use crate::AppState;
use crate::models::{CreateServerRequest, Server};
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
    // Generate config from preset
    let config = ConfigGenerator::from_preset(&request.preset);
    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    // Create in database
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let id = db.create_server(&request, &config_json)?;

    // Write PalWorldSettings.ini to disk
    drop(db); // Release lock before file I/O
    ConfigGenerator::write_config(&request.install_path, &config)?;

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
) -> Result<(), String> {
    // Optionally backup before deletion
    if backup_first {
        let install_path = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.get_server_install_path(server_id)?
        };

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

    // Delete from database (cascades to backups, tasks, mods)
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_server(server_id)
}

#[tauri::command]
pub async fn start_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
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
        return Err(format!("Port {} is already in use. Please choose a different port or stop the conflicting process.", game_port));
    }

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
                let _ = std::process::Command::new("powershell")
                    .args([
                        "-Command",
                        &format!(
                            "Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName '{}' -Direction Inbound -Action Allow -Protocol UDP -LocalPort {}",
                            game_rule_name, game_rule_name, game_port
                        )
                    ])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status();

                let rcon_rule_name = format!("Palworld Server RCON {}", rcon_port);
                let _ = std::process::Command::new("powershell")
                    .args([
                        "-Command",
                        &format!(
                            "Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName '{}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort {}",
                            rcon_rule_name, rcon_rule_name, rcon_port
                        )
                    ])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status();
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
