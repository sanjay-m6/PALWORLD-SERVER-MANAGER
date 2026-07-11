/// Config Tauri Commands — Read/write PalWorldSettings.ini

use crate::AppState;
use crate::models::PalworldConfig;
use crate::services::config_generator::ConfigGenerator;
use tauri::State;

#[tauri::command]
pub async fn get_server_config(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<PalworldConfig, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection()?;

    let config_json: String = conn.query_row(
        "SELECT config_json FROM servers WHERE id = ?1",
        [server_id],
        |row| row.get(0),
    ).map_err(|e| format!("Server not found: {}", e))?;

    serde_json::from_str(&config_json)
        .map_err(|e| format!("Failed to parse config: {}", e))
}

#[tauri::command]
pub async fn save_server_config(
    state: State<'_, AppState>,
    server_id: i64,
    config: PalworldConfig,
) -> Result<(), String> {
    // Check if the ports are already in use by another server in the DB
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        
        // Check game_port (public_port)
        let conflict_game: Option<String> = conn.query_row(
            "SELECT name FROM servers WHERE game_port = ?1 AND id != ?2",
            [config.public_port as i64, server_id],
            |row| row.get(0),
        ).ok();
        if let Some(other_name) = conflict_game {
            return Err(format!("Game Port {} is already configured for server '{}'. Each server must have a unique Game Port.", config.public_port, other_name));
        }

        // Check rcon_port
        let conflict_rcon: Option<String> = conn.query_row(
            "SELECT name FROM servers WHERE rcon_port = ?1 AND id != ?2",
            [config.rcon_port as i64, server_id],
            |row| row.get(0),
        ).ok();
        if let Some(other_name) = conflict_rcon {
            return Err(format!("RCON Port {} is already configured for server '{}'. Each server must have a unique RCON Port.", config.rcon_port, other_name));
        }

        // Check rest_api_port
        let conflict_rest: Option<String> = conn.query_row(
            "SELECT name FROM servers WHERE rest_api_port = ?1 AND id != ?2",
            [config.rest_api_port as i64, server_id],
            |row| row.get(0),
        ).ok();
        if let Some(other_name) = conflict_rest {
            return Err(format!("REST API Port {} is already configured for server '{}'. Each server must have a unique REST API Port.", config.rest_api_port, other_name));
        }
    }

    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    // Save to database and sync columns
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_server_config(server_id, &config_json)?;
        db.update_server_ports_and_settings(
            server_id,
            config.public_port,
            config.rcon_port,
            config.rest_api_port,
            config.server_player_max_num,
            &config.admin_password,
            &config.server_password,
        )?;
    }

    // Write to INI file
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    ConfigGenerator::write_config(&install_path, &config)?;

    #[cfg(debug_assertions)]
    {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        config.admin_password.hash(&mut hasher);
        log::debug!(
            "[DEBUG] Write-time admin password length: {}, hash: {:x}",
            config.admin_password.len(),
            hasher.finish()
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn allocate_ports(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<crate::models::ServerPorts, String> {
    fn is_port_free_tcp_and_udp(port: u16) -> bool {
        let tcp_ok = std::net::TcpListener::bind(("127.0.0.1", port)).is_ok();
        let udp_ok = std::net::UdpSocket::bind(("0.0.0.0", port)).is_ok();
        tcp_ok && udp_ok
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection()?;

    let mut stmt = conn.prepare("SELECT game_port, rcon_port, rest_api_port FROM servers WHERE id != ?1")
        .map_err(|e| e.to_string())?;
    
    let port_rows = stmt.query_map([server_id], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
    }).map_err(|e| e.to_string())?;

    let mut reserved_game_ports = std::collections::HashSet::new();
    let mut reserved_rcon_ports = std::collections::HashSet::new();
    let mut reserved_rest_ports = std::collections::HashSet::new();

    for row in port_rows {
        if let Ok((game, rcon, rest)) = row {
            reserved_game_ports.insert(game as u16);
            reserved_rcon_ports.insert(rcon as u16);
            reserved_rest_ports.insert(rest as u16);
        }
    }

    let current_ports: Option<(u16, u16, u16)> = conn.query_row(
        "SELECT game_port, rcon_port, rest_api_port FROM servers WHERE id = ?1",
        [server_id],
        |row| Ok((row.get::<_, i64>(0)? as u16, row.get::<_, i64>(1)? as u16, row.get::<_, i64>(2)? as u16))
    ).ok();

    let (cur_game, cur_rcon, cur_rest) = current_ports.unwrap_or((0, 0, 0));

    let mut game_port = 8211;
    while reserved_game_ports.contains(&game_port) || (game_port != cur_game && !is_port_free_tcp_and_udp(game_port)) {
        game_port += 1;
    }

    let mut rcon_port = 25575;
    while reserved_rcon_ports.contains(&rcon_port) || (rcon_port != cur_rcon && !is_port_free_tcp_and_udp(rcon_port)) {
        rcon_port += 1;
    }

    let mut rest_api_port = 8212;
    while reserved_rest_ports.contains(&rest_api_port) || rest_api_port == game_port || (rest_api_port != cur_rest && !is_port_free_tcp_and_udp(rest_api_port)) {
        rest_api_port += 1;
    }

    Ok(crate::models::ServerPorts {
        game_port,
        rcon_port,
        rest_api_port,
    })
}

#[tauri::command]
pub async fn open_firewall_ports(
    server_name: String,
    game_port: u16,
    rcon_port: u16,
    rest_api_port: u16,
) -> Result<(), String> {
    let ps1_content = format!(
        "Remove-NetFirewallRule -DisplayName \"Palworld - {0} - Game Port (UDP)\" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName \"Palworld - {0} - Game Port (TCP)\" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName \"Palworld - {0} - RCON Port (UDP)\" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName \"Palworld - {0} - RCON Port (TCP)\" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName \"Palworld - {0} - REST API Port (UDP)\" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName \"Palworld - {0} - REST API Port (TCP)\" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName \"Palworld - {0} - Game Port (UDP)\" -Direction Inbound -Action Allow -Protocol UDP -LocalPort {1}
New-NetFirewallRule -DisplayName \"Palworld - {0} - Game Port (TCP)\" -Direction Inbound -Action Allow -Protocol TCP -LocalPort {1}
New-NetFirewallRule -DisplayName \"Palworld - {0} - RCON Port (UDP)\" -Direction Inbound -Action Allow -Protocol UDP -LocalPort {2}
New-NetFirewallRule -DisplayName \"Palworld - {0} - RCON Port (TCP)\" -Direction Inbound -Action Allow -Protocol TCP -LocalPort {2}
New-NetFirewallRule -DisplayName \"Palworld - {0} - REST API Port (UDP)\" -Direction Inbound -Action Allow -Protocol UDP -LocalPort {3}
New-NetFirewallRule -DisplayName \"Palworld - {0} - REST API Port (TCP)\" -Direction Inbound -Action Allow -Protocol TCP -LocalPort {3}",
        server_name, game_port, rcon_port, rest_api_port
    );

    let mut temp_file = std::env::temp_dir();
    temp_file.push("palworld_firewall.ps1");
    std::fs::write(&temp_file, ps1_content)
        .map_err(|e| format!("Failed to write temporary script: {}", e))?;

    let cmd = format!(
        "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"{}\"' -Verb RunAs -Wait",
        temp_file.to_string_lossy().replace('\\', "/")
    );

    let mut cmd_obj = std::process::Command::new("powershell");
    cmd_obj.args(&["-Command", &cmd]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd_obj.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd_obj.output()
        .map_err(|e| format!("Failed to start PowerShell UAC prompt: {}", e))?;

    let _ = std::fs::remove_file(&temp_file);

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        if err.contains("canceled") || err.contains("cancelled") {
            return Err("Firewall configuration was cancelled or UAC permission was denied.".to_string());
        }
        return Err(format!("Failed to execute UAC command: {}", err));
    }

    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallStatus {
    pub game_port_allowed: bool,
    pub rcon_port_allowed: bool,
    pub rest_api_port_allowed: bool,
}

#[tauri::command]
pub async fn check_firewall_status(server_name: String) -> Result<FirewallStatus, String> {
    let filter = format!("Palworld - {} - *", server_name);
    let mut cmd_obj = std::process::Command::new("powershell");
    cmd_obj.args(&[
        "-NoProfile",
        "-Command",
        &format!("Get-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue | Select-Object DisplayName, Enabled | ConvertTo-Json", filter)
    ]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd_obj.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd_obj.output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    let mut game_tcp = false;
    let mut game_udp = false;
    let mut rcon_tcp = false;
    let mut rcon_udp = false;
    let mut rest_tcp = false;
    let mut rest_udp = false;

    if output.status.success() && !stdout.is_empty() {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
            let items = if val.is_array() {
                val.as_array().unwrap().clone()
            } else {
                vec![val]
            };

            for item in items {
                if let Some(display_name) = item.get("DisplayName").and_then(|d| d.as_str()) {
                    let enabled_val = item.get("Enabled");
                    let enabled = if let Some(b) = enabled_val.and_then(|v| v.as_bool()) {
                        b
                    } else if let Some(s) = enabled_val.and_then(|v| v.as_str()) {
                        s == "True" || s == "1"
                    } else if let Some(i) = enabled_val.and_then(|v| v.as_i64()) {
                        i == 1
                    } else {
                        false
                    };

                    if enabled {
                        if display_name.contains("Game Port") {
                            if display_name.contains("(TCP)") {
                                game_tcp = true;
                            } else if display_name.contains("(UDP)") {
                                game_udp = true;
                            }
                        } else if display_name.contains("RCON Port") {
                            if display_name.contains("(TCP)") {
                                rcon_tcp = true;
                            } else if display_name.contains("(UDP)") {
                                rcon_udp = true;
                            }
                        } else if display_name.contains("REST API Port") {
                            if display_name.contains("(TCP)") {
                                rest_tcp = true;
                            } else if display_name.contains("(UDP)") {
                                rest_udp = true;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(FirewallStatus {
        game_port_allowed: game_tcp && game_udp,
        rcon_port_allowed: rcon_tcp && rcon_udp,
        rest_api_port_allowed: rest_tcp && rest_udp,
    })
}

#[tauri::command]
pub async fn get_raw_config(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<String, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let settings_path = ConfigGenerator::get_settings_path(&install_path);
    std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read config file: {}", e))
}

#[tauri::command]
pub async fn save_raw_config(
    state: State<'_, AppState>,
    server_id: i64,
    content: String,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let settings_path = ConfigGenerator::get_settings_path(&install_path);

    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    std::fs::write(&settings_path, &content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    // Parse raw content
    let settings_map = crate::services::ini_parser::parse_palworld_settings(&content);

    // Get current config from db to preserve any unmapped settings
    let mut config = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        let config_json: Option<String> = conn.query_row(
            "SELECT config_json FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        ).ok();
        
        config_json
            .and_then(|json| serde_json::from_str::<PalworldConfig>(&json).ok())
            .unwrap_or_default()
    };

    // Update config struct with the parsed values
    config.update_from_map(&settings_map);

    // Check if the ports are already in use by another server in the DB
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        
        // Check game_port (public_port)
        let conflict_game: Option<String> = conn.query_row(
            "SELECT name FROM servers WHERE game_port = ?1 AND id != ?2",
            [config.public_port as i64, server_id],
            |row| row.get(0),
        ).ok();
        if let Some(other_name) = conflict_game {
            return Err(format!("Game Port {} is already configured for server '{}'. Each server must have a unique Game Port.", config.public_port, other_name));
        }

        // Check rcon_port
        let conflict_rcon: Option<String> = conn.query_row(
            "SELECT name FROM servers WHERE rcon_port = ?1 AND id != ?2",
            [config.rcon_port as i64, server_id],
            |row| row.get(0),
        ).ok();
        if let Some(other_name) = conflict_rcon {
            return Err(format!("RCON Port {} is already configured for server '{}'. Each server must have a unique RCON Port.", config.rcon_port, other_name));
        }

        // Check rest_api_port
        let conflict_rest: Option<String> = conn.query_row(
            "SELECT name FROM servers WHERE rest_api_port = ?1 AND id != ?2",
            [config.rest_api_port as i64, server_id],
            |row| row.get(0),
        ).ok();
        if let Some(other_name) = conflict_rest {
            return Err(format!("REST API Port {} is already configured for server '{}'. Each server must have a unique REST API Port.", config.rest_api_port, other_name));
        }
    }

    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    // Save back to db and sync columns
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_server_config(server_id, &config_json)?;
        db.update_server_ports_and_settings(
            server_id,
            config.public_port,
            config.rcon_port,
            config.rest_api_port,
            config.server_player_max_num,
            &config.admin_password,
            &config.server_password,
        )?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_config_presets() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![
        serde_json::json!({ "id": "casual", "name": "Casual", "description": "Relaxed gameplay with boosted rates, no death penalty, reduced difficulty", "category": "PvE" }),
        serde_json::json!({ "id": "balanced", "name": "Balanced", "description": "Default Palworld settings — the intended experience", "category": "PvE" }),
        serde_json::json!({ "id": "pvp", "name": "PvP", "description": "Player vs Player enabled with competitive settings", "category": "PvP" }),
        serde_json::json!({ "id": "hardcore", "name": "Hardcore", "description": "Maximum challenge — reduced rates, full death penalty, PvP enabled", "category": "PvP" }),
        serde_json::json!({ "id": "performance", "name": "Performance", "description": "Optimized for low-spec servers — reduced spawn rates and limits", "category": "Utility" }),
    ])
}

#[tauri::command]
pub async fn apply_preset(
    state: State<'_, AppState>,
    server_id: i64,
    preset: String,
) -> Result<PalworldConfig, String> {
    let config = ConfigGenerator::from_preset(&preset);
    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    let (db, install_path) = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        db_lock.update_server_config(server_id, &config_json)?;
        db_lock.update_server_preset(server_id, &preset)?;
        db_lock.update_server_ports_and_settings(
            server_id,
            config.public_port,
            config.rcon_port,
            config.rest_api_port,
            config.server_player_max_num,
            &config.admin_password,
            &config.server_password,
        )?;
        let path = db_lock.get_server_install_path(server_id)?;
        (db_lock, path)
    };
    drop(db);

    ConfigGenerator::write_config(&install_path, &config)?;

    Ok(config)
}
