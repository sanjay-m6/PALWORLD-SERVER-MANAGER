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
    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    // Save to database
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_server_config(server_id, &config_json)?;
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

    std::fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))
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
        let path = db_lock.get_server_install_path(server_id)?;
        (db_lock, path)
    };
    drop(db);

    ConfigGenerator::write_config(&install_path, &config)?;

    Ok(config)
}
