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
