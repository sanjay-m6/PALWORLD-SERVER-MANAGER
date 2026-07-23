/// Backup Tauri Commands

use crate::AppState;
use crate::models::Backup;
use tauri::{State, Manager};

#[tauri::command]
pub async fn create_backup(
    state: State<'_, AppState>,
    server_id: i64,
    label: Option<String>,
) -> Result<Backup, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let app_dir = state.app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    let backup_dir = app_dir.join("backups").join(server_id.to_string());

    let (backup_path, size) = crate::services::backup_service::BackupService::create_backup(
        &install_path,
        backup_dir.to_str().unwrap_or(""),
        label.as_deref(),
        true,
        true,
    )?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let id = db.create_backup(
        server_id,
        "manual",
        backup_path.to_str().unwrap_or(""),
        size,
        label.as_deref(),
    )?;

    let backups = db.get_backups(server_id)?;
    backups.into_iter().find(|b| b.id == id)
        .ok_or_else(|| "Backup created but not found".to_string())
}

#[tauri::command]
pub async fn get_backups(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<Backup>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_backups(server_id)
}

#[tauri::command]
pub async fn restore_backup(
    state: State<'_, AppState>,
    server_id: i64,
    backup_id: i64,
) -> Result<(), String> {
    let (backup_path, install_path) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;

        let backup_path: String = conn.query_row(
            "SELECT file_path FROM backups WHERE id = ?1",
            [backup_id],
            |row| row.get(0),
        ).map_err(|e| format!("Backup not found: {}", e))?;

        let install_path = db.get_server_install_path(server_id)?;
        (backup_path, install_path)
    };

    // Ensure server is stopped
    if state.process_manager.is_server_running(server_id) {
        return Err("Server must be stopped before restoring a backup".to_string());
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
        return Err("Server must be stopped before restoring a backup (another server process is running on the system).".to_string());
    }

    crate::services::backup_service::BackupService::restore_backup(&backup_path, &install_path)
}

#[tauri::command]
pub async fn delete_backup(
    state: State<'_, AppState>,
    backup_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let file_path = db.delete_backup(backup_id)?;

    // Delete the actual file
    if std::path::Path::new(&file_path).exists() {
        let _ = std::fs::remove_file(&file_path);
    }

    Ok(())
}

#[tauri::command]
pub async fn export_backup(
    state: State<'_, AppState>,
    backup_id: i64,
    dest_path: String,
) -> Result<(), String> {
    let file_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT file_path FROM backups WHERE id = ?1",
            [backup_id],
            |row| row.get(0),
        ).map_err(|e| format!("Backup not found: {}", e))?
    };

    let src = std::path::Path::new(&file_path);
    let dst = std::path::Path::new(&dest_path);

    if !src.exists() {
        return Err("Source backup file does not exist".to_string());
    }

    std::fs::copy(src, dst)
        .map_err(|e| format!("Failed to copy backup file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn import_backup(
    state: State<'_, AppState>,
    server_id: i64,
    source_path: String,
    label: Option<String>,
) -> Result<Backup, String> {
    let src = std::path::Path::new(&source_path);
    if !src.exists() {
        return Err("Source file does not exist".to_string());
    }

    let app_dir = state.app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    let backup_dir = app_dir.join("backups").join(server_id.to_string());
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = if let Some(ref l) = label {
        format!("backup_imported_{}_{}.zip", l.replace(' ', "_"), timestamp)
    } else {
        format!("backup_imported_{}.zip", timestamp)
    };
    let dest_path = backup_dir.join(filename);

    std::fs::copy(src, &dest_path)
        .map_err(|e| format!("Failed to copy file to backup directory: {}", e))?;

    let size = std::fs::metadata(&dest_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let id = db.create_backup(
        server_id,
        "imported",
        dest_path.to_str().unwrap_or(""),
        size,
        label.as_deref().or(Some("Imported Migration Save")),
    )?;

    let backups = db.get_backups(server_id)?;
    backups.into_iter().find(|b| b.id == id)
        .ok_or_else(|| "Imported backup created but not found".to_string())
}

fn add_dir_to_zip_helper(
    zip: &mut zip::ZipWriter<std::fs::File>,
    source_dir: &std::path::Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    for entry in walkdir::WalkDir::new(source_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let relative = path.strip_prefix(source_dir).unwrap_or(path);
        let archive_path = format!("{}/{}", prefix, relative.to_string_lossy().replace('\\', "/"));

        if path.is_dir() {
            let _ = zip.add_directory(&archive_path, options);
        } else {
            let _ = zip.start_file(&archive_path, options);
            if let Ok(mut file) = std::fs::File::open(path) {
                let _ = std::io::copy(&mut file, zip);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn export_server_migration(
    state: State<'_, AppState>,
    server_id: i64,
    dest_path: String,
) -> Result<(), String> {
    let server_data = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        
        let mut stmt = conn.prepare("SELECT name, description, game_port, rcon_port, rcon_enabled, rest_api_port, rest_api_enabled, max_players, admin_password, server_password, is_public, preset, startup_args, crossplay_platforms, auto_start, auto_restart_schedule, config_json, branch, auto_restart, run_as_admin, optimize_ram FROM servers WHERE id = ?1")
            .map_err(|e| e.to_string())?;
            
        stmt.query_row([server_id], |row| {
            Ok(serde_json::json!({
                "name": row.get::<_, String>(0)?,
                "description": row.get::<_, String>(1)?,
                "game_port": row.get::<_, i64>(2)?,
                "rcon_port": row.get::<_, i64>(3)?,
                "rcon_enabled": row.get::<_, i64>(4)?,
                "rest_api_port": row.get::<_, i64>(5)?,
                "rest_api_enabled": row.get::<_, i64>(6)?,
                "max_players": row.get::<_, i64>(7)?,
                "admin_password": row.get::<_, String>(8)?,
                "server_password": row.get::<_, String>(9)?,
                "is_public": row.get::<_, i64>(10)?,
                "preset": row.get::<_, String>(11)?,
                "startup_args": row.get::<_, String>(12)?,
                "crossplay_platforms": row.get::<_, String>(13)?,
                "auto_start": row.get::<_, i64>(14)?,
                "auto_restart_schedule": row.get::<_, String>(15)?,
                "config_json": row.get::<_, String>(16)?,
                "branch": row.get::<_, String>(17)?,
                "auto_restart": row.get::<_, i64>(18)?,
                "run_as_admin": row.get::<_, i64>(19)?,
                "optimize_ram": row.get::<_, i64>(20)?,
            }))
        }).map_err(|e| format!("Server not found: {}", e))?
    };

    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let install_dir = std::path::Path::new(&install_path);
    if !install_dir.exists() {
        return Err("Server installation directory does not exist".to_string());
    }

    let file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create destination zip file: {}", e))?;
        
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(6));

    zip.start_file("server_metadata.json", options)
        .map_err(|e| format!("Failed to start server_metadata.json in zip: {}", e))?;
    let metadata_str = serde_json::to_string_pretty(&server_data)
        .map_err(|e| format!("Failed to serialize server metadata: {}", e))?;
    use std::io::Write;
    zip.write_all(metadata_str.as_bytes())
        .map_err(|e| format!("Failed to write metadata to zip: {}", e))?;

    let saved_dir = install_dir.join("Pal").join("Saved");
    if saved_dir.exists() {
        add_dir_to_zip_helper(&mut zip, &saved_dir, "Saved", options)?;
    }

    let mods_dir = install_dir.join("Mods");
    if mods_dir.exists() {
        add_dir_to_zip_helper(&mut zip, &mods_dir, "Mods", options)?;
    }

    zip.finish().map_err(|e| format!("Failed to finalize migration package: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn import_server_migration(
    state: State<'_, AppState>,
    zip_path: String,
    new_install_path: String,
) -> Result<(), String> {
    let zip_file = std::fs::File::open(&zip_path)
        .map_err(|e| format!("Failed to open migration zip: {}", e))?;

    let mut archive = zip::ZipArchive::new(zip_file)
        .map_err(|e| format!("Invalid migration zip archive: {}", e))?;

    let metadata: serde_json::Value = {
        let mut metadata_entry = archive.by_name("server_metadata.json")
            .map_err(|e| format!("Migration zip is missing server_metadata.json: {}", e))?;
            
        let mut metadata_content = String::new();
        use std::io::Read;
        metadata_entry.read_to_string(&mut metadata_content)
            .map_err(|e| format!("Failed to read server_metadata.json: {}", e))?;
            
        serde_json::from_str(&metadata_content)
            .map_err(|e| format!("Invalid server_metadata.json: {}", e))?
    };

    let name = metadata["name"].as_str().unwrap_or("Migrated Server");
    let description = metadata["description"].as_str().unwrap_or("");
    let game_port = metadata["game_port"].as_i64().unwrap_or(8211);
    let rcon_port = metadata["rcon_port"].as_i64().unwrap_or(25575);
    let rcon_enabled = metadata["rcon_enabled"].as_i64().unwrap_or(1);
    let rest_api_port = metadata["rest_api_port"].as_i64().unwrap_or(8212);
    let rest_api_enabled = metadata["rest_api_enabled"].as_i64().unwrap_or(1);
    let max_players = metadata["max_players"].as_i64().unwrap_or(32);
    let admin_password = metadata["admin_password"].as_str().unwrap_or("");
    let server_password = metadata["server_password"].as_str().unwrap_or("");
    let is_public = metadata["is_public"].as_i64().unwrap_or(0);
    let preset = metadata["preset"].as_str().unwrap_or("Balanced");
    let startup_args = metadata["startup_args"].as_str().unwrap_or("");
    let crossplay_platforms = metadata["crossplay_platforms"].as_str().unwrap_or("[]");
    let auto_start = metadata["auto_start"].as_i64().unwrap_or(0);
    let auto_restart_schedule = metadata["auto_restart_schedule"].as_str().unwrap_or("");
    let config_json = metadata["config_json"].as_str().unwrap_or("{}");
    let branch = metadata["branch"].as_str().unwrap_or("public");
    let auto_restart = metadata["auto_restart"].as_i64().unwrap_or(1);
    let run_as_admin = metadata["run_as_admin"].as_i64().unwrap_or(1);
    let optimize_ram = metadata["optimize_ram"].as_i64().unwrap_or(1);

    let dest_dir = std::path::Path::new(&new_install_path);
    std::fs::create_dir_all(dest_dir)
        .map_err(|e| format!("Failed to create destination directory: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("Failed to read archive entry: {}", e))?;
        let entry_name = entry.name().replace('\\', "/");
        
        if entry_name == "server_metadata.json" {
            continue;
        }

        let out_path = dest_dir.join(&entry_name);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory in destination: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection()?;
    conn.execute(
        "INSERT INTO servers (
            name, description, install_path, game_port, rcon_port, rcon_enabled,
            rest_api_port, rest_api_enabled, max_players, admin_password, server_password,
            is_public, preset, startup_args, crossplay_platforms, auto_start,
            auto_restart_schedule, config_json, branch, auto_restart, run_as_admin, optimize_ram
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        rusqlite::params![
            name, description, new_install_path, game_port, rcon_port, rcon_enabled,
            rest_api_port, rest_api_enabled, max_players, admin_password, server_password,
            is_public, preset, startup_args, crossplay_platforms, auto_start,
            auto_restart_schedule, config_json, branch, auto_restart, run_as_admin, optimize_ram
        ]
    ).map_err(|e| format!("Failed to insert server node into database: {}", e))?;

    Ok(())
}


