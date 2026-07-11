/// RCON Tauri Commands

use crate::AppState;
use crate::models::{Player, RconResponse};
use serde::Serialize;
use tauri::{Emitter, State};

pub struct RconState(pub crate::services::rcon::RconService);

#[derive(Clone, Serialize)]
pub struct RconStatusEvent {
    pub server_id: i64,
    pub connected: bool,
}

async fn ensure_connected(
    state: &crate::services::rcon::RconService,
    app_state: &crate::AppState,
    app_handle: &tauri::AppHandle,
    server_id: i64,
) -> Result<(), String> {
    if state.is_connected(server_id).await {
        return Ok(());
    }

    let (host, rcon_port, admin_password) = {
        let db = app_state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT host, rcon_port, admin_password FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((
                row.get::<_, String>(0).unwrap_or_else(|_| "127.0.0.1".to_string()),
                row.get::<_, u16>(1).unwrap_or(25575),
                row.get::<_, String>(2).unwrap_or_default()
            )),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    // Check if the admin password was changed while the server is running
    if let Some(launched_password) = app_state.process_manager.get_launched_admin_password(server_id) {
        if launched_password != admin_password {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: false });
            return Err("A server restart is required to apply the new admin password. Please restart the server.".to_string());
        }
    }

    match state.connect(server_id, &host, rcon_port, &admin_password).await {
        Ok(_) => {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: true });
            Ok(())
        }
        Err(e) => {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: false });
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn rcon_connect(
    state: State<'_, RconState>,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: i64,
) -> Result<RconResponse, String> {
    let (host, rcon_port, admin_password) = {
        let db = app_state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT host, rcon_port, admin_password FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((
                row.get::<_, String>(0).unwrap_or_else(|_| "127.0.0.1".to_string()),
                row.get::<_, u16>(1).unwrap_or(25575),
                row.get::<_, String>(2).unwrap_or_default()
            )),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    // Check if the admin password was changed while the server is running
    if let Some(launched_password) = app_state.process_manager.get_launched_admin_password(server_id) {
        if launched_password != admin_password {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: false });
            return Ok(RconResponse {
                success: false,
                message: "A server restart is required to apply the new admin password. Please restart the server.".to_string(),
                data: None,
            });
        }
    }

    match state.0.connect(server_id, &host, rcon_port, &admin_password).await {
        Ok(msg) => {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: true });
            Ok(RconResponse { success: true, message: msg, data: None })
        }
        Err(e) => {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: false });
            Ok(RconResponse { success: false, message: e, data: None })
        }
    }
}

#[tauri::command]
pub async fn rcon_disconnect(
    state: State<'_, RconState>,
    app_handle: tauri::AppHandle,
    server_id: i64,
) -> Result<(), String> {
    let res = state.0.disconnect(server_id).await;
    let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: false });
    res
}

#[tauri::command]
pub async fn rcon_send_command(
    state: State<'_, RconState>,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: i64,
    command: String,
) -> Result<RconResponse, String> {
    if let Err(e) = ensure_connected(&state.0, &app_state, &app_handle, server_id).await {
        return Ok(RconResponse { success: false, message: format!("RCON auto-connect failed: {}", e), data: None });
    }

    match state.0.send_command(server_id, &command).await {
        Ok(response) => Ok(RconResponse { success: true, message: response.clone(), data: Some(response) }),
        Err(e) => {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: false });
            Ok(RconResponse { success: false, message: e, data: None })
        }
    }
}

#[tauri::command]
pub async fn get_player_list(
    state: State<'_, RconState>,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: i64,
) -> Result<Vec<Player>, String> {
    ensure_connected(&state.0, &app_state, &app_handle, server_id).await?;
    let response = state.0.send_command(server_id, "ShowPlayers").await?;
    Ok(crate::services::rcon::RconService::parse_player_list(&response))
}

#[tauri::command]
pub async fn kick_player(
    state: State<'_, RconState>,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: i64,
    steam_id: String,
) -> Result<RconResponse, String> {
    ensure_connected(&state.0, &app_state, &app_handle, server_id).await?;
    let cmd = format!("KickPlayer {}", steam_id);
    match state.0.send_command(server_id, &cmd).await {
        Ok(msg) => Ok(RconResponse { success: true, message: msg, data: None }),
        Err(e) => {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: false });
            Ok(RconResponse { success: false, message: e, data: None })
        }
    }
}

#[tauri::command]
pub async fn ban_player(
    state: State<'_, RconState>,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: i64,
    steam_id: String,
) -> Result<RconResponse, String> {
    ensure_connected(&state.0, &app_state, &app_handle, server_id).await?;
    let cmd = format!("BanPlayer {}", steam_id);
    match state.0.send_command(server_id, &cmd).await {
        Ok(msg) => Ok(RconResponse { success: true, message: msg, data: None }),
        Err(e) => {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: false });
            Ok(RconResponse { success: false, message: e, data: None })
        }
    }
}

#[tauri::command]
pub async fn broadcast_message(
    state: State<'_, RconState>,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: i64,
    message: String,
) -> Result<RconResponse, String> {
    ensure_connected(&state.0, &app_state, &app_handle, server_id).await?;
    let cmd = format!("Broadcast {}", message);
    match state.0.send_command(server_id, &cmd).await {
        Ok(msg) => Ok(RconResponse { success: true, message: msg, data: None }),
        Err(e) => {
            let _ = app_handle.emit("rcon-status", RconStatusEvent { server_id, connected: false });
            Ok(RconResponse { success: false, message: e, data: None })
        }
    }
}

