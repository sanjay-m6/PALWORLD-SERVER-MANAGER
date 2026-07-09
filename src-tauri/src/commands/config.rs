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

    Ok(())
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
