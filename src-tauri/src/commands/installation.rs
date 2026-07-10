use crate::AppState;
use crate::services::installation_manager::{InstallState, DiagnosticsResult};
use crate::models::InstallationHistoryEntry;
use tauri::State;

#[tauri::command]
pub async fn start_server_installation(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: i64,
    branch: String,
) -> Result<(), String> {
    // Write optimization config first
    state.steamcmd.write_optimization_config();
    
    let steamcmd_dir = state.steamcmd.get_steamcmd_dir();
    let steamcmd_exe = state.steamcmd.get_steamcmd_exe();
    
    state.installation_manager.start_installation(
        app_handle,
        server_id,
        branch,
        steamcmd_dir,
        steamcmd_exe,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_server_installation(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    state.installation_manager.cancel_installation(server_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_active_installation_state(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Option<InstallState>, String> {
    // Check in-memory first
    if let Some(st) = state.installation_manager.get_active_state(server_id) {
        return Ok(Some(st));
    }
    
    // Fallback: Check recovery state in DB (for crash recovery)
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(recovery) = db.get_install_recovery(server_id)? {
        // Map InstallationRecoveryState to InstallState
        use crate::services::installation_manager::InstallStage;
        let stage = match recovery.stage.as_str() {
            "Preparing" => InstallStage::Preparing,
            "CheckingUpdates" => InstallStage::CheckingUpdates,
            "InitializingRuntime" => InstallStage::InitializingRuntime,
            "Connecting" => InstallStage::Connecting,
            "Authenticating" => InstallStage::Authenticating,
            "FetchingManifest" => InstallStage::FetchingManifest,
            "AllocatingDiskSpace" => InstallStage::AllocatingDiskSpace,
            "Downloading" => InstallStage::Downloading,
            "Verifying" => InstallStage::Verifying,
            "Installing" => InstallStage::Installing,
            "Finalizing" => InstallStage::Finalizing,
            "Completed" => InstallStage::Completed,
            "Failed" => InstallStage::Failed,
            _ => InstallStage::Preparing,
        };
        
        return Ok(Some(InstallState {
            server_id: recovery.server_id,
            is_installing: recovery.is_installing,
            stage,
            progress: recovery.progress,
            status: recovery.status,
            bytes_downloaded: recovery.bytes_downloaded,
            bytes_total: recovery.bytes_total,
            speed_bps: 0.0,
            avg_speed_bps: 0.0,
            peak_speed_bps: 0.0,
            disk_write_speed_bps: 0.0,
            disk_read_speed_bps: 0.0,
            eta_seconds: None,
            cdn_server: "Restored from crash".to_string(),
            log: recovery.logs,
            elapsed_seconds: 0,
        }));
    }
    
    Ok(None)
}

#[tauri::command]
pub async fn get_server_installation_history(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<InstallationHistoryEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_install_history(server_id)
}

#[tauri::command]
pub async fn run_installation_diagnostics(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<DiagnosticsResult, String> {
    state.installation_manager.run_diagnostics(server_id).await.map_err(|e| e.to_string())
}
