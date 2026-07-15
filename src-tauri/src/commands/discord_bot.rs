use crate::AppState;
use crate::models::ServerDiscordConfig;
use tauri::State;

#[tauri::command]
pub async fn get_discord_bot_status(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.discord_bot.get_status().await)
}

#[tauri::command]
pub async fn toggle_discord_bot(state: State<'_, AppState>, active: bool) -> Result<(), String> {
    if active {
        state.discord_bot.start().await?;
        // Persist setting
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.set_setting("discord_bot_enabled", "true")?;
    } else {
        state.discord_bot.stop().await?;
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.set_setting("discord_bot_enabled", "false")?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_server_discord_config(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<ServerDiscordConfig, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_server_discord_config(server_id)
}

#[tauri::command]
pub async fn save_server_discord_config(
    state: State<'_, AppState>,
    config: ServerDiscordConfig,
) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.save_server_discord_config(&config)?;
    }

    // Force refresh dashboard immediately if enabled
    if config.enabled && !config.dashboard_channel_id.is_empty() {
        if state.discord_bot.is_running().await {
            let _ = state.discord_bot.force_refresh_dashboard(config.server_id).await;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn force_refresh_discord_dashboard(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    let status = state.discord_bot.get_status().await;
    if status == "connecting" {
        return Err("Discord bot is currently connecting. Please wait...".to_string());
    }
    if status != "online" {
        return Err("Discord bot is offline. Start it first.".to_string());
    }
    state.discord_bot.force_refresh_dashboard(server_id).await
}

#[tauri::command]
pub async fn test_discord_bot_connection(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<String, String> {
    let status = state.discord_bot.get_status().await;
    if status == "connecting" {
        return Err("Discord bot is currently connecting. Please wait...".to_string());
    }
    if status != "online" {
        return Err("Discord bot is offline. Start the bot first.".to_string());
    }

    let conf = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_discord_config(server_id)?
    };

    if !conf.enabled {
        return Err("Discord integration is disabled for this server. Enable it first.".to_string());
    }

    if conf.notifications_channel_id.is_empty() {
        return Err("Event Alerts Channel ID is not configured. Please configure it to test the bot connection.".to_string());
    }

    state.discord_bot.send_notification(
        server_id,
        "test",
        "✅ Discord Bot Test Connection",
        "Your Discord Bot is successfully connected and integrated with Palworld Server Manager! This is a test notification.",
        0x10b981 // Emerald green
    ).await?;

    Ok("Test notification sent successfully to the Event Alerts channel!".to_string())
}

