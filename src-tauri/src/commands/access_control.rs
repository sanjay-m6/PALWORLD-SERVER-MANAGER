/// Access Control Commands — Ban List & Whitelist Management

use crate::AppState;
use tauri::State;
use std::io::{BufRead, Write};

/// Read the ban list from the server's banlist.txt
#[tauri::command]
pub async fn get_ban_list(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<String>, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let ban_file = std::path::Path::new(&install_path)
        .join("Pal")
        .join("Saved")
        .join("SaveGames")
        .join("banlist.txt");

    if !ban_file.exists() {
        return Ok(Vec::new());
    }

    let file = std::fs::File::open(&ban_file)
        .map_err(|e| format!("Failed to read banlist.txt: {}", e))?;
    
    let reader = std::io::BufReader::new(file);
    let mut ids = Vec::new();
    for line in reader.lines() {
        if let Ok(line) = line {
            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() {
                ids.push(trimmed);
            }
        }
    }
    Ok(ids)
}

/// Remove a SteamID from banlist.txt
#[tauri::command]
pub async fn remove_ban(
    state: State<'_, AppState>,
    server_id: i64,
    steam_id: String,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let ban_file = std::path::Path::new(&install_path)
        .join("Pal")
        .join("Saved")
        .join("SaveGames")
        .join("banlist.txt");

    if !ban_file.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&ban_file)
        .map_err(|e| format!("Failed to read banlist.txt: {}", e))?;
    
    let filtered: Vec<&str> = content
        .lines()
        .filter(|line| line.trim() != steam_id.trim())
        .collect();
    
    let mut file = std::fs::File::create(&ban_file)
        .map_err(|e| format!("Failed to write banlist.txt: {}", e))?;
    
    for id in filtered {
        writeln!(file, "{}", id).map_err(|e| format!("Write error: {}", e))?;
    }

    Ok(())
}

/// Add a SteamID to banlist.txt
#[tauri::command]
pub async fn add_to_ban_list(
    state: State<'_, AppState>,
    server_id: i64,
    steam_id: String,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let ban_dir = std::path::Path::new(&install_path)
        .join("Pal")
        .join("Saved")
        .join("SaveGames");

    std::fs::create_dir_all(&ban_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let ban_file = ban_dir.join("banlist.txt");

    // Check if already banned
    if ban_file.exists() {
        let content = std::fs::read_to_string(&ban_file).unwrap_or_default();
        if content.lines().any(|line| line.trim() == steam_id.trim()) {
            return Ok(()); // Already banned
        }
    }

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&ban_file)
        .map_err(|e| format!("Failed to open banlist.txt: {}", e))?;
    
    writeln!(file, "{}", steam_id.trim()).map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

/// Read the whitelist
#[tauri::command]
pub async fn get_whitelist(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<String>, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let whitelist_file = std::path::Path::new(&install_path)
        .join("Pal")
        .join("Saved")
        .join("SaveGames")
        .join("whitelist.txt");

    if !whitelist_file.exists() {
        return Ok(Vec::new());
    }

    let file = std::fs::File::open(&whitelist_file)
        .map_err(|e| format!("Failed to read whitelist.txt: {}", e))?;
    
    let reader = std::io::BufReader::new(file);
    let mut ids = Vec::new();
    for line in reader.lines() {
        if let Ok(line) = line {
            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() {
                ids.push(trimmed);
            }
        }
    }
    Ok(ids)
}

/// Overwrite the whitelist with the provided SteamIDs
#[tauri::command]
pub async fn set_whitelist(
    state: State<'_, AppState>,
    server_id: i64,
    steam_ids: Vec<String>,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let save_dir = std::path::Path::new(&install_path)
        .join("Pal")
        .join("Saved")
        .join("SaveGames");

    std::fs::create_dir_all(&save_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let whitelist_file = save_dir.join("whitelist.txt");

    let mut file = std::fs::File::create(&whitelist_file)
        .map_err(|e| format!("Failed to write whitelist.txt: {}", e))?;
    
    for id in steam_ids {
        let trimmed = id.trim().to_string();
        if !trimmed.is_empty() {
            writeln!(file, "{}", trimmed).map_err(|e| format!("Write error: {}", e))?;
        }
    }
    Ok(())
}
