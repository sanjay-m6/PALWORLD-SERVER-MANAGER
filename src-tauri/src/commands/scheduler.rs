/// Scheduler Tauri Commands

use crate::AppState;
use crate::models::SchedulerTask;
use tauri::State;

#[tauri::command]
pub async fn get_tasks(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<SchedulerTask>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_tasks(server_id)
}

#[tauri::command]
pub async fn create_task(
    state: State<'_, AppState>,
    server_id: i64,
    task_name: String,
    task_type: String,
    cron_expression: String,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_task(server_id, &task_name, &task_type, &cron_expression)
}

#[tauri::command]
pub async fn delete_task(
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_task(task_id)
}

#[tauri::command]
pub async fn toggle_task(
    state: State<'_, AppState>,
    task_id: i64,
    enabled: bool,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.toggle_task(task_id, enabled)
}

#[tauri::command]
pub async fn update_task(
    state: State<'_, AppState>,
    task_id: i64,
    task_name: String,
    task_type: String,
    cron_expression: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_task(task_id, &task_name, &task_type, &cron_expression)
}
