/// Discord Webhook Commands

use crate::AppState;
use tauri::State;
use serde::Serialize;

#[derive(Serialize)]
struct DiscordEmbed {
    title: String,
    description: String,
    color: u32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    fields: Vec<DiscordEmbedField>,
    footer: DiscordEmbedFooter,
    timestamp: String,
}

#[derive(Serialize)]
struct DiscordEmbedField {
    name: String,
    value: String,
    inline: bool,
}

#[derive(Serialize)]
struct DiscordEmbedFooter {
    text: String,
}

#[derive(Serialize)]
struct DiscordWebhookPayload {
    username: String,
    avatar_url: String,
    embeds: Vec<DiscordEmbed>,
}

/// Send a test Discord webhook embed
#[tauri::command]
pub async fn test_discord_webhook(
    webhook_url: String,
) -> Result<String, String> {
    if webhook_url.trim().is_empty() {
        return Err("Webhook URL cannot be empty".to_string());
    }

    if !webhook_url.starts_with("https://discord.com/api/webhooks/") 
       && !webhook_url.starts_with("https://discordapp.com/api/webhooks/") {
        return Err("Invalid Discord webhook URL format".to_string());
    }

    let payload = DiscordWebhookPayload {
        username: "Palworld Server Manager".to_string(),
        avatar_url: "https://cdn-icons-png.flaticon.com/512/5968/5968520.png".to_string(),
        embeds: vec![DiscordEmbed {
            title: "✅ Webhook Test Successful".to_string(),
            description: "Your Discord webhook is configured correctly! Server notifications will appear here.".to_string(),
            color: 0x10b981, // success green
            fields: vec![
                DiscordEmbedField {
                    name: "Status".to_string(),
                    value: "Connected".to_string(),
                    inline: true,
                },
                DiscordEmbedField {
                    name: "Source".to_string(),
                    value: "Palworld Server Manager".to_string(),
                    inline: true,
                },
            ],
            footer: DiscordEmbedFooter {
                text: "Palworld Server Manager — Test Notification".to_string(),
            },
            timestamp: chrono::Utc::now().to_rfc3339(),
        }],
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(&webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to send webhook: {}", e))?;

    if resp.status().is_success() || resp.status().as_u16() == 204 {
        Ok("Test notification sent successfully!".to_string())
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        Err(format!("Discord returned {} — {}", status, body))
    }
}

/// Send a server event notification to Discord
#[tauri::command]
pub async fn send_discord_notification(
    state: State<'_, AppState>,
    event_type: String,
    server_name: String,
    message: String,
) -> Result<(), String> {
    let webhook_url = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_setting("discord_webhook_url")
            .unwrap_or(None)
            .unwrap_or_default()
    };

    if webhook_url.is_empty() {
        return Ok(()); // No webhook configured, silently skip
    }

    // Check if this event type is enabled
    let setting_key = format!("discord_notify_{}", event_type);
    let is_enabled = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_setting(&setting_key)
            .unwrap_or(None)
            .map(|v| v == "true")
            .unwrap_or(true) // Default enabled for all events
    };

    if !is_enabled {
        return Ok(());
    }

    let (title, color) = match event_type.as_str() {
        "start" => ("🟢 Server Started", 0x10b981u32),
        "stop" => ("🔴 Server Stopped", 0xef4444),
        "crash" => ("💥 Server Crashed", 0xdc2626),
        "update_start" => ("🔄 Update Started", 0x06b6d4),
        "update_success" => ("✅ Update Complete", 0x10b981),
        "update_failed" => ("❌ Update Failed", 0xef4444),
        "restart" => ("🔁 Server Restarting", 0xf59e0b),
        "player_join" => ("👤 Player Joined", 0x8b5cf6),
        "player_leave" => ("👋 Player Left", 0x6b7280),
        _ => ("📢 Server Event", 0x6b7280),
    };

    let payload = DiscordWebhookPayload {
        username: "Palworld Server Manager".to_string(),
        avatar_url: "https://cdn-icons-png.flaticon.com/512/5968/5968520.png".to_string(),
        embeds: vec![DiscordEmbed {
            title: title.to_string(),
            description: message,
            color,
            fields: vec![
                DiscordEmbedField {
                    name: "Server".to_string(),
                    value: server_name,
                    inline: true,
                },
            ],
            footer: DiscordEmbedFooter {
                text: "Palworld Server Manager".to_string(),
            },
            timestamp: chrono::Utc::now().to_rfc3339(),
        }],
    };

    let client = reqwest::Client::new();
    let _ = client
        .post(&webhook_url)
        .json(&payload)
        .send()
        .await;

    Ok(())
}
