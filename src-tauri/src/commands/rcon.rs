/// RCON Tauri Commands

use crate::AppState;
use crate::models::{Player, RconResponse};
use tauri::State;

pub struct RconState(pub crate::services::rcon::RconService);

#[tauri::command]
pub async fn rcon_connect(
    state: State<'_, RconState>,
    app_state: State<'_, AppState>,
    server_id: i64,
) -> Result<RconResponse, String> {
    let (rcon_port, admin_password) = {
        let db = app_state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT rcon_port, admin_password FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get::<_, u16>(0).unwrap_or(25575), row.get::<_, String>(1).unwrap_or_default())),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    match state.0.connect(server_id, "127.0.0.1", rcon_port, &admin_password).await {
        Ok(msg) => Ok(RconResponse { success: true, message: msg, data: None }),
        Err(e) => Ok(RconResponse { success: false, message: e, data: None }),
    }
}

#[tauri::command]
pub async fn rcon_disconnect(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<(), String> {
    state.0.disconnect(server_id).await
}

#[tauri::command]
pub async fn rcon_send_command(
    state: State<'_, RconState>,
    server_id: i64,
    command: String,
) -> Result<RconResponse, String> {
    match state.0.send_command(server_id, &command).await {
        Ok(response) => Ok(RconResponse { success: true, message: response.clone(), data: Some(response) }),
        Err(e) => Ok(RconResponse { success: false, message: e, data: None }),
    }
}

#[tauri::command]
pub async fn get_player_list(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<Vec<Player>, String> {
    let response = state.0.send_command(server_id, "ShowPlayers").await?;
    Ok(crate::services::rcon::RconService::parse_player_list(&response))
}

#[tauri::command]
pub async fn kick_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
) -> Result<RconResponse, String> {
    let cmd = format!("KickPlayer {}", steam_id);
    match state.0.send_command(server_id, &cmd).await {
        Ok(msg) => Ok(RconResponse { success: true, message: msg, data: None }),
        Err(e) => Ok(RconResponse { success: false, message: e, data: None }),
    }
}

#[tauri::command]
pub async fn ban_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
) -> Result<RconResponse, String> {
    let cmd = format!("BanPlayer {}", steam_id);
    match state.0.send_command(server_id, &cmd).await {
        Ok(msg) => Ok(RconResponse { success: true, message: msg, data: None }),
        Err(e) => Ok(RconResponse { success: false, message: e, data: None }),
    }
}

#[tauri::command]
pub async fn broadcast_message(
    state: State<'_, RconState>,
    server_id: i64,
    message: String,
) -> Result<RconResponse, String> {
    let cmd = format!("Broadcast {}", message);
    match state.0.send_command(server_id, &cmd).await {
        Ok(msg) => Ok(RconResponse { success: true, message: msg, data: None }),
        Err(e) => Ok(RconResponse { success: false, message: e, data: None }),
    }
}
