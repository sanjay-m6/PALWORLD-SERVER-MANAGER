use serenity::all::{
    ButtonStyle, ChannelId, Color, CommandOptionType, CreateActionRow, CreateButton, CreateCommand,
    CreateCommandOption, CreateEmbed, CreateEmbedFooter, CreateInteractionResponse,
    CreateInteractionResponseMessage, CreateMessage, EditMessage, MessageId, Timestamp,
};
use serenity::async_trait;
use serenity::model::application::{
    Command, CommandInteraction, ComponentInteraction, Interaction,
};
use serenity::model::channel::Message;
use serenity::model::gateway::{GatewayIntents, Ready};
use serenity::prelude::*;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

#[derive(Clone)]
struct Handler {
    app_handle: AppHandle,
    bot_user_id: Arc<std::sync::Mutex<Option<serenity::all::UserId>>>,
}

#[derive(Clone)]
pub struct DiscordBotService {
    app_handle: AppHandle,
    client: Arc<Mutex<Option<Client>>>,
    pub status: Arc<Mutex<String>>,
    runner_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    log_buffer: Arc<Mutex<HashMap<i64, Vec<String>>>>,
    log_watcher_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    dashboard_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl DiscordBotService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            client: Arc::new(Mutex::new(None)),
            status: Arc::new(Mutex::new("offline".to_string())),
            runner_task: Arc::new(Mutex::new(None)),
            log_buffer: Arc::new(Mutex::new(HashMap::new())),
            log_watcher_task: Arc::new(Mutex::new(None)),
            dashboard_task: Arc::new(Mutex::new(None)),
        }
    }

    /// Check if the Discord Bot client is running
    pub async fn is_running(&self) -> bool {
        let status = self.status.lock().await;
        *status == "online"
    }

    /// Get current bot status as string
    pub async fn get_status(&self) -> String {
        self.status.lock().await.clone()
    }

    /// Set status to offline and cancel/clear connection resources
    pub async fn set_offline(&self) {
        *self.client.lock().await = None;
        *self.runner_task.lock().await = None;
        if let Some(handle) = self.dashboard_task.lock().await.take() {
            handle.abort();
        }
        if let Some(handle) = self.log_watcher_task.lock().await.take() {
            handle.abort();
        }
        {
            let mut status_lock = self.status.lock().await;
            *status_lock = "offline".to_string();
        }
        let _ = self.app_handle.emit("discord-bot-status-changed", "offline");
    }

    /// Queue a log line to be batched and sent to Discord
    pub async fn queue_log(&self, server_id: i64, message: String) {
        let mut buffer = self.log_buffer.lock().await;
        buffer.entry(server_id).or_default().push(message);
    }

    /// Start the Discord bot service in the background
    pub async fn start(&self) -> Result<(), String> {
        let client_lock = self.client.lock().await;
        if client_lock.is_some() {
            return Ok(()); // Already running or starting
        }

        let app_state = self.app_handle.state::<crate::AppState>();
        let token = {
            let db = app_state.db.lock().map_err(|e| e.to_string())?;
            db.get_setting("discord_bot_token")
                .unwrap_or(None)
                .unwrap_or_default()
        };

        if token.trim().is_empty() {
            return Err(
                "Discord Bot Token is not configured. Go to Discord tab in Settings to set it."
                    .to_string(),
            );
        }

        {
            let mut status_lock = self.status.lock().await;
            *status_lock = "connecting".to_string();
        }
        let _ = self.app_handle.emit("discord-bot-status-changed", "connecting");

        let app_handle_clone = self.app_handle.clone();
        let token_clone = token.clone();
        let client_lock_clone = self.client.clone();

        // Spawn gateway runner
        let runner = tokio::spawn(async move {
            let mut intents = GatewayIntents::GUILDS
                | GatewayIntents::GUILD_MESSAGES
                | GatewayIntents::MESSAGE_CONTENT;

            let handler = Handler {
                app_handle: app_handle_clone.clone(),
                bot_user_id: Arc::new(std::sync::Mutex::new(None)),
            };

            log::info!("[DISCORD] Attempting to start Discord bot client...");

            // First attempt with all intents
            let client_build = serenity::Client::builder(&token_clone, intents)
                .event_handler(handler.clone())
                .await;

            match client_build {
                Ok(mut client) => {
                    let shard_manager = client.shard_manager.clone();
                    {
                        let mut lock = client_lock_clone.lock().await;
                        *lock = Some(Client { shard_manager });
                    }

                    if let Err(why) = client.start().await {
                        let err_str = why.to_string();
                        log::error!("[DISCORD] Bot gateway error: {}", err_str);

                        // Check if it's a disallowed intent error
                        if err_str.contains("4014") || err_str.to_lowercase().contains("intent") {
                            log::warn!("[DISCORD] Message Content Intent seems disallowed. Retrying with reduced intents...");

                            // Emit warning to frontend
                            if let Some(state) = app_handle_clone.try_state::<crate::AppState>() {
                                let _ = state.app_handle.emit("in-app-notification", serde_json::json!({
                                    "type": "warning",
                                    "message": "Message Content Intent is disabled in Discord Developer Portal. Chat Bridge is disabled."
                                }));
                            }

                            // Re-build with reduced intents
                            intents = GatewayIntents::GUILDS | GatewayIntents::GUILD_MESSAGES;
                            let retry_build = serenity::Client::builder(&token_clone, intents)
                                .event_handler(handler)
                                .await;

                            match retry_build {
                                Ok(mut retry_client) => {
                                    let shard_manager = retry_client.shard_manager.clone();
                                    {
                                        let mut lock = client_lock_clone.lock().await;
                                        *lock = Some(Client { shard_manager });
                                    }

                                    if let Err(retry_why) = retry_client.start().await {
                                        log::error!("[DISCORD] Bot reduced-intents gateway error: {}", retry_why);
                                        if let Some(state) = app_handle_clone.try_state::<crate::AppState>() {
                                            let _ = state.app_handle.emit("in-app-notification", serde_json::json!({
                                                "type": "error",
                                                "message": format!("Discord bot failed to start: {}", retry_why)
                                            }));
                                            state.discord_bot.set_offline().await;
                                        }
                                    }
                                }
                                Err(build_err) => {
                                    log::error!("[DISCORD] Failed to build client on retry: {}", build_err);
                                    if let Some(state) = app_handle_clone.try_state::<crate::AppState>() {
                                        state.discord_bot.set_offline().await;
                                    }
                                }
                            }
                        } else {
                            // Other connection error
                            if let Some(state) = app_handle_clone.try_state::<crate::AppState>() {
                                let _ = state.app_handle.emit("in-app-notification", serde_json::json!({
                                    "type": "error",
                                    "message": format!("Discord bot failed to start: {}", err_str)
                                }));
                                state.discord_bot.set_offline().await;
                            }
                        }
                    }
                }
                Err(e) => {
                    log::error!("[DISCORD] Failed to build client: {}", e);
                    if let Some(state) = app_handle_clone.try_state::<crate::AppState>() {
                        let _ = state.app_handle.emit("in-app-notification", serde_json::json!({
                            "type": "error",
                            "message": format!("Failed to build Discord bot client: {}", e)
                        }));
                        state.discord_bot.set_offline().await;
                    }
                }
            }
        });

        *self.runner_task.lock().await = Some(runner);

        // Start background tasks for Dashboard updates and Log tailing
        self.start_background_tasks().await;

        Ok(())
    }

    /// Stop the Discord bot service
    pub async fn stop(&self) -> Result<(), String> {
        let mut client_lock = self.client.lock().await;
        if let Some(client) = client_lock.take() {
            client.shard_manager.shutdown_all().await;
        }

        // Cancel background tasks
        if let Some(handle) = self.runner_task.lock().await.take() {
            handle.abort();
        }
        if let Some(handle) = self.dashboard_task.lock().await.take() {
            handle.abort();
        }
        if let Some(handle) = self.log_watcher_task.lock().await.take() {
            handle.abort();
        }

        {
            let mut status_lock = self.status.lock().await;
            *status_lock = "offline".to_string();
        }
        let _ = self.app_handle.emit("discord-bot-status-changed", "offline");
        log::info!("[DISCORD] Bot service cleanly stopped.");
        Ok(())
    }

    /// Helper to spawn recurring dashboard and log streaming tasks
    async fn start_background_tasks(&self) {
        let app_handle_dash = self.app_handle.clone();

        // 1. Dashboard Loop (Every 10 seconds)
        let dashboard_handle = tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                if let Some(state) = app_handle_dash.try_state::<crate::AppState>() {
                    if state.discord_bot.get_status().await != "online" {
                        continue;
                    }
                    let servers = {
                        if let Ok(db) = state.db.lock() {
                            db.get_all_servers().unwrap_or_default()
                        } else {
                            continue;
                        }
                    };

                    for server in servers {
                        let config = {
                            if let Ok(db) = state.db.lock() {
                                db.get_server_discord_config(server.id).ok()
                            } else {
                                None
                            }
                        };
                        if let Some(conf) = config {
                            if conf.enabled && !conf.dashboard_channel_id.is_empty() {
                                let _ = update_server_dashboard(&state, server.id, &conf).await;
                            }
                        }
                    }
                }
            }
        });
        *self.dashboard_task.lock().await = Some(dashboard_handle);

        // 2. Buffered Log Watcher Loop (Every 3 seconds)
        let log_buffer = self.log_buffer.clone();
        let app_handle_logs = self.app_handle.clone();
        let log_handle = tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                let mut buffer = log_buffer.lock().await;
                if buffer.is_empty() {
                    continue;
                }

                if let Some(state) = app_handle_logs.try_state::<crate::AppState>() {
                    if state.discord_bot.get_status().await != "online" {
                        continue;
                    }
                    let http = match get_http_client(&state).await {
                        Ok(h) => Arc::new(h),
                        Err(_) => continue,
                    };

                    for (&server_id, lines) in buffer.iter_mut() {
                        if lines.is_empty() {
                            continue;
                        }

                        let config = {
                            if let Ok(db) = state.db.lock() {
                                db.get_server_discord_config(server_id).ok()
                            } else {
                                None
                            }
                        };

                        if let Some(conf) = config {
                            if conf.enabled && !conf.console_channel_id.is_empty() {
                                if let Ok(channel_id) = conf.console_channel_id.parse::<u64>() {
                                    let chunk: String = lines
                                        .drain(..std::cmp::min(15, lines.len()))
                                        .collect::<Vec<String>>()
                                        .join("\n");

                                    if !chunk.is_empty() {
                                        let message = CreateMessage::new()
                                            .content(format!("```logs\n{}\n```", chunk));
                                        let _ = ChannelId::new(channel_id)
                                            .send_message(&http, message)
                                            .await;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        *self.log_watcher_task.lock().await = Some(log_handle);
    }

    /// Trigger manual update of the dashboard message
    pub async fn force_refresh_dashboard(&self, server_id: i64) -> Result<(), String> {
        let app_state = self.app_handle.state::<crate::AppState>();
        let conf = {
            let db = app_state.db.lock().map_err(|e| e.to_string())?;
            db.get_server_discord_config(server_id)?
        };

        if !conf.enabled || conf.dashboard_channel_id.is_empty() {
            return Err(
                "Discord integration or dashboard channel is not configured for this server."
                    .to_string(),
            );
        }

        update_server_dashboard(&app_state, server_id, &conf).await
    }

    /// Send a custom embed to the notification channel
    pub async fn send_notification(
        &self,
        server_id: i64,
        _event_type: &str,
        title: &str,
        description: &str,
        color_hex: u32,
    ) -> Result<(), String> {
        let app_state = self.app_handle.state::<crate::AppState>();
        let conf = {
            let db = app_state.db.lock().map_err(|e| e.to_string())?;
            db.get_server_discord_config(server_id)?
        };

        if !conf.enabled || conf.notifications_channel_id.is_empty() {
            return Ok(()); // Silently skip if disabled
        }

        let channel_id = conf
            .notifications_channel_id
            .parse::<u64>()
            .map_err(|_| "Invalid notifications channel ID".to_string())?;

        let server_name = {
            let db = app_state.db.lock().map_err(|e| e.to_string())?;
            db.get_all_servers()
                .unwrap_or_default()
                .into_iter()
                .find(|s| s.id == server_id)
                .map(|s| s.name)
                .unwrap_or_else(|| format!("Server #{}", server_id))
        };

        let embed = CreateEmbed::new()
            .title(title)
            .description(description)
            .color(Color::from(color_hex))
            .field("Server", server_name, true)
            .footer(CreateEmbedFooter::new("Palworld Server Manager Alerts"))
            .timestamp(Timestamp::now());

        let http = get_http_client(&app_state).await?;
        let _ = ChannelId::new(channel_id)
            .send_message(&http, CreateMessage::new().embed(embed))
            .await;

        Ok(())
    }
}

/// Helper struct representing Client wrapper to bypass serenity type constraints in Arc
struct Client {
    shard_manager: Arc<serenity::gateway::ShardManager>,
}

async fn get_http_client(state: &crate::AppState) -> Result<serenity::http::Http, String> {
    let token = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_setting("discord_bot_token")
            .unwrap_or(None)
            .unwrap_or_default()
    };
    if token.trim().is_empty() {
        return Err("Bot Token is missing".to_string());
    }
    Ok(serenity::http::Http::new(&token))
}

/// Helper to render the live dashboard embed
async fn update_server_dashboard(
    state: &crate::AppState,
    server_id: i64,
    conf: &crate::models::ServerDiscordConfig,
) -> Result<(), String> {
    let http = get_http_client(state).await?;
    let channel_id = conf
        .dashboard_channel_id
        .parse::<u64>()
        .map_err(|_| "Invalid dashboard channel ID".to_string())?;

    // Load server details
    let server = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_all_servers()
            .unwrap_or_default()
            .into_iter()
            .find(|s| s.id == server_id)
            .ok_or_else(|| "Server not found".to_string())?
    };

    let is_running = state.process_manager.is_server_running(server_id);
    let rcon_state = &state
        .app_handle
        .state::<crate::commands::rcon::RconState>()
        .0;

    let mut player_count = 0;
    let mut players_list = String::from("No players online");

    if is_running {
        // Connect RCON automatically if disconnected
        if !rcon_state.is_connected(server_id).await {
            let _ = rcon_state
                .connect(
                    server_id,
                    &server.host,
                    server.ports.rcon_port,
                    &server.admin_password,
                )
                .await;
        }

        if rcon_state.is_connected(server_id).await {
            if let Ok(players_resp) = rcon_state.send_command(server_id, "ShowPlayers").await {
                let players = crate::services::rcon::RconService::parse_player_list(&players_resp);
                player_count = players.len();
                if !players.is_empty() {
                    players_list = players
                        .iter()
                        .map(|p| format!("• **{}** (UID: {})", p.name, p.player_uid))
                        .collect::<Vec<String>>()
                        .join("\n");
                }
            }
        }
    }

    // Host Metrics
    let (cpu_usage, used_ram, total_ram) = {
        let mut sys = state.sys.lock().unwrap();
        sys.refresh_cpu_all();
        sys.refresh_memory();
        (
            sys.global_cpu_usage(),
            sys.used_memory() / 1024 / 1024,
            sys.total_memory() / 1024 / 1024,
        )
    };

    let status_emoji = match server.status {
        crate::models::ServerStatus::Running | crate::models::ServerStatus::Online => "🟢 Online",
        crate::models::ServerStatus::Starting => "🟡 Starting",
        crate::models::ServerStatus::Stopping => "🔴 Stopping",
        crate::models::ServerStatus::Updating => "🔄 Updating",
        crate::models::ServerStatus::Restarting => "🔁 Restarting",
        _ => "⚪ Offline",
    };

    let embed = CreateEmbed::new()
        .title(format!("🎮 Palworld Server Dashboard — {}", server.name))
        .description(format!("*{}*", server.description))
        .color(if is_running {
            Color::from(0x10b981)
        } else {
            Color::from(0xef4444)
        })
        .field("Status", status_emoji, true)
        .field(
            "Uptime",
            if is_running { "Running" } else { "Offline" },
            true,
        )
        .field(
            "Players",
            format!("{} / {}", player_count, server.max_players),
            true,
        )
        .field(
            "Ports",
            format!(
                "Game: {} | RCON: {}",
                server.ports.game_port, server.ports.rcon_port
            ),
            true,
        )
        .field(
            "Resource Stats (Host)",
            format!(
                "🖥️ CPU: {:.1}% \n💾 RAM: {}GB / {}GB",
                cpu_usage,
                used_ram / 1024,
                total_ram / 1024
            ),
            true,
        )
        .field("Online Players Detail", players_list, false)
        .footer(CreateEmbedFooter::new(
            "Palworld Server Manager — Auto Updates every 10s",
        ))
        .timestamp(Timestamp::now());

    // Generate action rows
    let row1 = CreateActionRow::Buttons(vec![
        CreateButton::new(format!("discord_btn_{}_start", server_id))
            .label("▶ Start")
            .style(ButtonStyle::Success)
            .disabled(is_running),
        CreateButton::new(format!("discord_btn_{}_stop", server_id))
            .label("■ Stop")
            .style(ButtonStyle::Danger)
            .disabled(!is_running),
        CreateButton::new(format!("discord_btn_{}_restart", server_id))
            .label("↻ Restart")
            .style(ButtonStyle::Primary)
            .disabled(!is_running),
    ]);

    let row2 = CreateActionRow::Buttons(vec![
        CreateButton::new(format!("discord_btn_{}_save", server_id))
            .label("💾 Save")
            .style(ButtonStyle::Secondary)
            .disabled(!is_running),
        CreateButton::new(format!("discord_btn_{}_backup", server_id))
            .label("📦 Backup")
            .style(ButtonStyle::Secondary),
        CreateButton::new(format!("discord_btn_{}_refresh", server_id))
            .label("🔄 Refresh")
            .style(ButtonStyle::Secondary),
    ]);

    let components = vec![row1, row2];

    // If dashboard message ID is set, edit message. Otherwise post fresh.
    let mut message_sent = false;
    if !conf.dashboard_message_id.is_empty() {
        if let Ok(message_id) = conf.dashboard_message_id.parse::<u64>() {
            let edit_builder = EditMessage::new()
                .embed(embed.clone())
                .components(components.clone());
            if ChannelId::new(channel_id)
                .edit_message(&http, MessageId::new(message_id), edit_builder)
                .await
                .is_ok()
            {
                message_sent = true;
            }
        }
    }

    if !message_sent {
        let msg_builder = CreateMessage::new().embed(embed).components(components);
        if let Ok(new_msg) = ChannelId::new(channel_id)
            .send_message(&http, msg_builder)
            .await
        {
            // Save dashboard message ID to DB
            let mut updated_conf = conf.clone();
            updated_conf.dashboard_message_id = new_msg.id.to_string();
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let _ = db.save_server_discord_config(&updated_conf);
        }
    }

    Ok(())
}

#[async_trait]
impl EventHandler for Handler {
    async fn ready(&self, ctx: Context, ready: Ready) {
        log::info!("Discord bot connected as {}", ready.user.name);

        {
            let mut id_lock = self.bot_user_id.lock().unwrap();
            *id_lock = Some(ready.user.id);
        }

        if let Some(state) = self.app_handle.try_state::<crate::AppState>() {
            {
                let mut status_lock = state.discord_bot.status.lock().await;
                *status_lock = "online".to_string();
            }
            let _ = state.app_handle.emit("discord-bot-status-changed", "online");
        }

        // Register slash commands
        let commands = vec![
            CreateCommand::new("status").description("Get status of all Palworld servers"),
            CreateCommand::new("players").description("Show players currently online"),
            CreateCommand::new("dashboard")
                .description("Post the live dashboard for a server in the current channel")
                .add_option(
                    CreateCommandOption::new(
                        CommandOptionType::Integer,
                        "id",
                        "Server ID to show the dashboard for",
                    )
                    .required(true),
                ),
            CreateCommand::new("start")
                .description("Start a server instance")
                .add_option(
                    CreateCommandOption::new(
                        CommandOptionType::Integer,
                        "id",
                        "Server ID to start",
                    )
                    .required(true),
                ),
            CreateCommand::new("stop")
                .description("Stop a server instance")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::Integer, "id", "Server ID to stop")
                        .required(true),
                ),
            CreateCommand::new("restart")
                .description("Restart a server instance")
                .add_option(
                    CreateCommandOption::new(
                        CommandOptionType::Integer,
                        "id",
                        "Server ID to restart",
                    )
                    .required(true),
                ),
            CreateCommand::new("save")
                .description("Trigger an in-game save")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::Integer, "id", "Server ID to save")
                        .required(true),
                ),
            CreateCommand::new("backup")
                .description("Create a server backup")
                .add_option(
                    CreateCommandOption::new(
                        CommandOptionType::Integer,
                        "id",
                        "Server ID to backup",
                    )
                    .required(true),
                ),
            CreateCommand::new("broadcast")
                .description("Broadcast a message in-game")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::Integer, "id", "Server ID")
                        .required(true),
                )
                .add_option(
                    CreateCommandOption::new(
                        CommandOptionType::String,
                        "message",
                        "Message to broadcast",
                    )
                    .required(true),
                ),
        ];

        // Register global commands
        let commands_clone = commands.clone();
        let http_clone = ctx.http.clone();
        tokio::spawn(async move {
            if let Err(e) = Command::set_global_commands(&http_clone, commands_clone).await {
                log::error!("Failed to register global slash commands: {}", e);
            }
        });

        // Register guild-specific commands for instant availability
        for guild in &ready.guilds {
            let guild_id = guild.id;
            let commands_clone = commands.clone();
            let http_clone = ctx.http.clone();
            tokio::spawn(async move {
                if let Err(e) = guild_id.set_commands(&http_clone, commands_clone).await {
                    log::error!("Failed to register guild commands for guild {}: {}", guild_id, e);
                } else {
                    log::info!("Successfully registered guild commands for guild {}", guild_id);
                }
            });
        }
    }

    async fn message(&self, ctx: Context, msg: Message) {
        if msg.author.bot {
            return;
        }

        // 1. Text commands fallback handling (e.g. /status, !status, @bot status)
        let current_user_id = {
            let id_lock = self.bot_user_id.lock().unwrap();
            id_lock.clone()
        };

        if let Some(bot_id) = current_user_id {
            let mention_str = format!("<@{}>", bot_id);
            let mention_nick_str = format!("<@!{}>", bot_id);

            let content = msg.content.trim();
            let is_command = content.starts_with('/')
                || content.starts_with('!')
                || content.starts_with(&mention_str)
                || content.starts_with(&mention_nick_str);

            if is_command {
                let cleaned = if content.starts_with('/') || content.starts_with('!') {
                    content[1..].trim().to_string()
                } else if content.starts_with(&mention_str) {
                    content[mention_str.len()..].trim().to_string()
                } else {
                    content[mention_nick_str.len()..].trim().to_string()
                };

                let parts: Vec<&str> = cleaned.split_whitespace().collect();
                if !parts.is_empty() {
                    let cmd_name = parts[0].to_lowercase();
                    let cmd_args: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();

                    let app_handle_clone = self.app_handle.clone();
                    let ctx_clone = ctx.clone();
                    let msg_clone = msg.clone();
                    tokio::spawn(async move {
                        let app_state = match app_handle_clone.try_state::<crate::AppState>() {
                            Some(s) => s,
                            None => return,
                        };
                        if let Err(e) = handle_text_command(&ctx_clone, &msg_clone, &cmd_name, cmd_args, &app_state).await {
                            log::error!("Error handling text command: {}", e);
                        }
                    });
                    return; // Prevent forwarding command prefix/text messages to RCON chat bridge
                }
            }
        }

        // Two-way Chat Bridge: check if channel is a chat_channel_id
        let channel_id_str = msg.channel_id.to_string();
        let app_state = match self.app_handle.try_state::<crate::AppState>() {
            Some(s) => s,
            None => return,
        };

        let servers = {
            if let Ok(db) = app_state.db.lock() {
                db.get_all_servers().unwrap_or_default()
            } else {
                return;
            }
        };

        for s in servers {
            let config = {
                if let Ok(db) = app_state.db.lock() {
                    db.get_server_discord_config(s.id).ok()
                } else {
                    None
                }
            };
            if let Some(conf) = config {
                if conf.enabled && conf.chat_channel_id == channel_id_str {
                    // Forward message to in-game chat via RCON Broadcast
                    let cleaned_author = msg.author.name.replace(" ", "_");
                    let message_content = msg.content.clone();
                    let command_to_run =
                        format!("[Discord] {}: {}", cleaned_author, message_content);
                    let rcon_state = &app_state
                        .app_handle
                        .state::<crate::commands::rcon::RconState>()
                        .0;
                    let _ = rcon_state
                        .send_command(s.id, &format!("Broadcast {}", command_to_run))
                        .await;
                }
            }
        }
    }

    async fn interaction_create(&self, ctx: Context, interaction: Interaction) {
        let app_state = match self.app_handle.try_state::<crate::AppState>() {
            Some(s) => s,
            None => return,
        };

        match interaction {
            Interaction::Command(command) => {
                let _ = handle_slash_command(&ctx, &command, &app_state).await;
            }
            Interaction::Component(component) => {
                let _ = handle_button_interaction(&ctx, &component, &app_state).await;
            }
            _ => {}
        }
    }
}

/// Handle incoming slash commands
async fn handle_slash_command(
    ctx: &Context,
    command: &CommandInteraction,
    state: &crate::AppState,
) -> serenity::Result<()> {
    let name_str = command.data.name.clone();
    let name = name_str.as_str();

    let response_text = match name {
        "status" => {
            let servers = {
                if let Ok(db) = state.db.lock() {
                    db.get_all_servers().unwrap_or_default()
                } else {
                    Vec::new()
                }
            };
            if servers.is_empty() {
                "No servers configured in Palworld Server Manager.".to_string()
            } else {
                servers
                    .iter()
                    .map(|s| {
                        format!(
                            "• **{}**: {}",
                            s.name,
                            if state.process_manager.is_server_running(s.id) {
                                "🟢 Running"
                            } else {
                                "🔴 Offline"
                            }
                        )
                    })
                    .collect::<Vec<String>>()
                    .join("\n")
            }
        }
        "players" => {
            let servers = {
                if let Ok(db) = state.db.lock() {
                    db.get_all_servers().unwrap_or_default()
                } else {
                    Vec::new()
                }
            };
            let mut output = Vec::new();
            let rcon_state = &state
                .app_handle
                .state::<crate::commands::rcon::RconState>()
                .0;
            for s in servers {
                if state.process_manager.is_server_running(s.id)
                    && rcon_state.is_connected(s.id).await
                {
                    if let Ok(players_resp) = rcon_state.send_command(s.id, "ShowPlayers").await {
                        let players =
                            crate::services::rcon::RconService::parse_player_list(&players_resp);
                        output.push(format!(
                            "**{}**: {}/{} players online",
                            s.name,
                            players.len(),
                            s.max_players
                        ));
                    }
                } else {
                    output.push(format!(
                        "**{}**: Server is Offline (or RCON disconnected)",
                        s.name
                    ));
                }
            }
            if output.is_empty() {
                "No active servers connected via RCON.".to_string()
            } else {
                output.join("\n")
            }
        }
        "dashboard" => {
            let server_id = match command.data.options.first().and_then(|o| o.value.as_i64()) {
                Some(id) => id,
                None => {
                    let _ = command
                        .create_response(
                            &ctx.http,
                            CreateInteractionResponse::Message(
                                CreateInteractionResponseMessage::new()
                                    .content("❌ Missing Server ID option")
                                    .ephemeral(true),
                            ),
                        )
                        .await;
                    return Ok(());
                }
            };

            // Verification Check
            if !verify_permissions(ctx, command, state, server_id).await {
                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new().content("❌ You do not have permission to execute this administrator action.").ephemeral(true)
                )).await;
                return Ok(());
            }

            let conf_res = if let Ok(db) = state.db.lock() {
                db.get_server_discord_config(server_id)
            } else {
                Err("Database lock error".to_string())
            };

            let mut conf = match conf_res {
                Ok(c) => c,
                Err(e) => {
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(
                        CreateInteractionResponseMessage::new().content(format!("❌ Database error: {}", e)).ephemeral(true)
                    )).await;
                    return Ok(());
                }
            };

            conf.enabled = true;
            let current_channel_id = command.channel_id.to_string();
            conf.dashboard_channel_id = current_channel_id;
            conf.dashboard_message_id = String::new(); // Clear message ID to post fresh

            let save_res = if let Ok(db) = state.db.lock() {
                db.save_server_discord_config(&conf)
            } else {
                Err("Database lock error".to_string())
            };

            if let Err(e) = save_res {
                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new().content(format!("❌ Failed to save config: {}", e)).ephemeral(true)
                )).await;
                return Ok(());
            }

            // Immediately acknowledge interaction
            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new().content("⏳ Posting live dashboard...").ephemeral(true)
            )).await;

            let app_handle_clone = state.app_handle.clone();
            tokio::spawn(async move {
                let app_state = match app_handle_clone.try_state::<crate::AppState>() {
                    Some(s) => s,
                    None => return,
                };
                if let Err(e) = update_server_dashboard(&app_state, server_id, &conf).await {
                    log::error!("Failed to post dashboard: {}", e);
                }
            });
            return Ok(());
        }
        "start" | "stop" | "restart" | "save" | "backup" => {
            let server_id = match command.data.options.first().and_then(|o| o.value.as_i64()) {
                Some(id) => id,
                None => {
                    let _ = command
                        .create_response(
                            &ctx.http,
                            CreateInteractionResponse::Message(
                                CreateInteractionResponseMessage::new()
                                    .content("❌ Missing Server ID option")
                                    .ephemeral(true),
                            ),
                        )
                        .await;
                    return Ok(());
                }
            };

            // Verification Check
            if !verify_permissions(ctx, command, state, server_id).await {
                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new().content("❌ You do not have permission to execute this administrator action.").ephemeral(true)
                )).await;
                return Ok(());
            }

            let ctx_clone = ctx.clone();
            let command_clone = command.clone();
            let app_handle_clone = state.app_handle.clone();
            let name_owned = name_str.clone();
            tokio::spawn(async move {
                let action_res = match name_owned.as_str() {
                    "start" => {
                        let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                        crate::commands::server::start_server(app_state_tauri, server_id)
                            .await
                            .map(|_| "Server started!".to_string())
                    }
                    "stop" => {
                        let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                        crate::commands::server::stop_server(app_state_tauri, server_id, false)
                            .await
                            .map(|_| "Server stopped!".to_string())
                    }
                    "restart" => {
                        let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                        crate::commands::server::restart_server(app_state_tauri, server_id)
                            .await
                            .map(|_| "Server restarting!".to_string())
                    }
                    "save" => {
                        if let Some(rcon_state) =
                            app_handle_clone.try_state::<crate::commands::rcon::RconState>()
                        {
                            rcon_state.0.send_command(server_id, "Save").await
                        } else {
                            Err("RCON service unavailable".to_string())
                        }
                    }
                    "backup" => {
                        let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                        crate::commands::backup::create_backup(
                            app_state_tauri,
                            server_id,
                            Some("Discord Bot Command".to_string()),
                        )
                        .await
                        .map(|_| "Backup created!".to_string())
                    }
                    _ => Err("Unknown action".to_string()),
                };

                let final_msg = match action_res {
                    Ok(msg) => format!("✅ Command executed: {}", msg),
                    Err(e) => format!("❌ Execution failed: {}", e),
                };
                let _ = command_clone
                    .create_response(
                        &ctx_clone.http,
                        CreateInteractionResponse::Message(
                            CreateInteractionResponseMessage::new().content(final_msg),
                        ),
                    )
                    .await;
            });
            return Ok(());
        }
        "broadcast" => {
            let server_id = command
                .data
                .options
                .get(0)
                .and_then(|o| o.value.as_i64())
                .unwrap_or(0);
            let message_str = command
                .data
                .options
                .get(1)
                .and_then(|o| o.value.as_str())
                .unwrap_or("");

            if !verify_permissions(ctx, command, state, server_id).await {
                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new().content("❌ You do not have permission to execute this moderator action.").ephemeral(true)
                )).await;
                return Ok(());
            }

            let rcon_state = &state
                .app_handle
                .state::<crate::commands::rcon::RconState>()
                .0;
            let res = rcon_state
                .send_command(server_id, &format!("Broadcast {}", message_str))
                .await;
            match res {
                Ok(_) => format!("📢 Broadcasted in-game: *{}*", message_str),
                Err(e) => format!("❌ Failed to broadcast: {}", e),
            }
        }
        _ => "Command not implemented yet.".to_string(),
    };

    command
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new().content(response_text),
            ),
        )
        .await
}

/// Handle button actions from the server dashboard message
async fn handle_button_interaction(
    ctx: &Context,
    component: &ComponentInteraction,
    state: &crate::AppState,
) -> serenity::Result<()> {
    let custom_id = &component.data.custom_id;
    if !custom_id.starts_with("discord_btn_") {
        return Ok(());
    }

    let parts: Vec<&str> = custom_id.split('_').collect();
    if parts.len() < 4 {
        return Ok(());
    }

    let server_id: i64 = match parts[2].parse() {
        Ok(id) => id,
        Err(_) => return Ok(()),
    };
    let action_str = parts[3].to_string();

    // Verification check for permissions
    if !verify_button_permissions(ctx, component, state, server_id).await {
        let _ = component
            .create_response(
                &ctx.http,
                CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new()
                        .content("❌ You do not have permission to control this server.")
                        .ephemeral(true),
                ),
            )
            .await;
        return Ok(());
    }

    // Immediately acknowledge the interaction
    let _ = component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content(format!("⏳ Acknowledged action: *{}*...", action_str))
                    .ephemeral(true),
            ),
        )
        .await;

    let app_handle_clone = state.app_handle.clone();
    let action_owned = action_str.clone();
    tokio::spawn(async move {
        let action_res = match action_owned.as_str() {
            "start" => {
                let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                crate::commands::server::start_server(app_state_tauri, server_id)
                    .await
                    .map(|_| "Server started!".to_string())
            }
            "stop" => {
                let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                crate::commands::server::stop_server(app_state_tauri, server_id, false)
                    .await
                    .map(|_| "Server stopped!".to_string())
            }
            "restart" => {
                let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                crate::commands::server::restart_server(app_state_tauri, server_id)
                    .await
                    .map(|_| "Server restarting!".to_string())
            }
            "save" => {
                if let Some(rcon_state) =
                    app_handle_clone.try_state::<crate::commands::rcon::RconState>()
                {
                    rcon_state.0.send_command(server_id, "Save").await
                } else {
                    Err("RCON service unavailable".to_string())
                }
            }
            "backup" => {
                let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                crate::commands::backup::create_backup(
                    app_state_tauri,
                    server_id,
                    Some("Discord Bot Dashboard".to_string()),
                )
                .await
                .map(|_| "Backup created!".to_string())
            }
            "refresh" => Ok("Dashboard refreshed".to_string()),
            _ => Err("Unknown action".to_string()),
        };

        // Notify result
        let alert_title = match action_res {
            Ok(_) => format!("✅ Dashboard Action Completed ({})", action_owned),
            Err(_) => format!("❌ Dashboard Action Failed ({})", action_owned),
        };
        let alert_desc = match action_res {
            Ok(msg) => msg,
            Err(e) => e,
        };
        let _ = app_handle_clone
            .state::<crate::AppState>()
            .discord_bot
            .send_notification(
                server_id,
                "admin_action",
                &alert_title,
                &alert_desc,
                if alert_title.contains("✅") {
                    0x10b981
                } else {
                    0xef4444
                },
            )
            .await;

        // Force refresh dashboard
        let _ = app_handle_clone
            .state::<crate::AppState>()
            .discord_bot
            .force_refresh_dashboard(server_id)
            .await;
    });

    Ok(())
}

/// Verify slash command permissions against mapped roles
async fn verify_permissions(
    _ctx: &Context,
    command: &CommandInteraction,
    state: &crate::AppState,
    server_id: i64,
) -> bool {
    let conf = match state.db.lock() {
        Ok(db) => db.get_server_discord_config(server_id).unwrap_or_default(),
        Err(_) => return false,
    };

    if !conf.enabled {
        return false;
    }

    // If no roles are set, default to allowing
    if conf.role_owner_id.is_empty()
        && conf.role_admin_id.is_empty()
        && conf.role_moderator_id.is_empty()
    {
        return true;
    }

    let member = match &command.member {
        Some(m) => m,
        None => return false, // Direct message commands rejected if roles are set
    };

    for role in &member.roles {
        let role_str = role.to_string();
        if role_str == conf.role_owner_id
            || role_str == conf.role_admin_id
            || role_str == conf.role_moderator_id
            || role_str == conf.role_developer_id
        {
            return true;
        }
    }

    false
}

/// Verify button click permissions against mapped roles
async fn verify_button_permissions(
    _ctx: &Context,
    component: &ComponentInteraction,
    state: &crate::AppState,
    server_id: i64,
) -> bool {
    let conf = match state.db.lock() {
        Ok(db) => db.get_server_discord_config(server_id).unwrap_or_default(),
        Err(_) => return false,
    };

    if !conf.enabled {
        return false;
    }

    if conf.role_owner_id.is_empty()
        && conf.role_admin_id.is_empty()
        && conf.role_moderator_id.is_empty()
    {
        return true;
    }

    let member = match &component.member {
        Some(m) => m,
        None => return false,
    };

    for role in &member.roles {
        let role_str = role.to_string();
        if role_str == conf.role_owner_id
            || role_str == conf.role_admin_id
            || role_str == conf.role_moderator_id
        {
            return true;
        }
    }

    false
}

/// Verify text message command permissions against mapped roles
async fn verify_text_permissions(
    _ctx: &Context,
    msg: &Message,
    state: &crate::AppState,
    server_id: i64,
) -> bool {
    let conf = match state.db.lock() {
        Ok(db) => db.get_server_discord_config(server_id).unwrap_or_default(),
        Err(_) => return false,
    };

    if !conf.enabled {
        return false;
    }

    // If no roles are set, default to allowing
    if conf.role_owner_id.is_empty()
        && conf.role_admin_id.is_empty()
        && conf.role_moderator_id.is_empty()
    {
        return true;
    }

    let member = match &msg.member {
        Some(m) => m,
        None => return false, // Direct message commands rejected if roles are set
    };

    for role in &member.roles {
        let role_str = role.to_string();
        if role_str == conf.role_owner_id
            || role_str == conf.role_admin_id
            || role_str == conf.role_moderator_id
            || role_str == conf.role_developer_id
        {
            return true;
        }
    }

    false
}

/// Handle incoming plain text commands (fallback when slash commands are slow or missing)
async fn handle_text_command(
    ctx: &Context,
    msg: &Message,
    cmd_name: &str,
    args: Vec<String>,
    state: &crate::AppState,
) -> serenity::Result<()> {
    let response_text = match cmd_name {
        "status" => {
            let target_id = args.first().and_then(|s| s.parse::<i64>().ok());
            let servers = {
                if let Ok(db) = state.db.lock() {
                    db.get_all_servers().unwrap_or_default()
                } else {
                    Vec::new()
                }
            };
            if servers.is_empty() {
                "No servers configured in Palworld Server Manager.".to_string()
            } else if let Some(id) = target_id {
                if let Some(s) = servers.iter().find(|s| s.id == id) {
                    format!(
                        "• **{}** (ID: {}): {}",
                        s.name,
                        s.id,
                        if state.process_manager.is_server_running(s.id) {
                            "🟢 Running"
                        } else {
                            "🔴 Offline"
                        }
                    )
                } else {
                    format!("❌ Server ID {} not found.", id)
                }
            } else {
                servers
                    .iter()
                    .map(|s| {
                        format!(
                            "• **{}** (ID: {}): {}",
                            s.name,
                            s.id,
                            if state.process_manager.is_server_running(s.id) {
                                "🟢 Running"
                            } else {
                                "🔴 Offline"
                            }
                        )
                    })
                    .collect::<Vec<String>>()
                    .join("\n")
            }
        }
        "players" => {
            let target_id = args.first().and_then(|s| s.parse::<i64>().ok());
            let servers = {
                if let Ok(db) = state.db.lock() {
                    db.get_all_servers().unwrap_or_default()
                } else {
                    Vec::new()
                }
            };
            let mut output = Vec::new();
            let rcon_state = &state
                .app_handle
                .state::<crate::commands::rcon::RconState>()
                .0;
            for s in servers {
                if let Some(id) = target_id {
                    if s.id != id {
                        continue;
                    }
                }
                if state.process_manager.is_server_running(s.id)
                    && rcon_state.is_connected(s.id).await
                {
                    if let Ok(players_resp) = rcon_state.send_command(s.id, "ShowPlayers").await {
                        let players =
                            crate::services::rcon::RconService::parse_player_list(&players_resp);
                        output.push(format!(
                            "**{}** (ID: {}): {}/{} players online",
                            s.name,
                            s.id,
                            players.len(),
                            s.max_players
                        ));
                    }
                } else {
                    output.push(format!(
                        "**{}** (ID: {}): Server is Offline (or RCON disconnected)",
                        s.name,
                        s.id
                    ));
                }
            }
            if output.is_empty() {
                if target_id.is_some() {
                    format!("❌ Server ID {} not found or not active.", target_id.unwrap())
                } else {
                    "No active servers connected via RCON.".to_string()
                }
            } else {
                output.join("\n")
            }
        }
        "dashboard" => {
            let server_id = match args.first().and_then(|s| s.parse::<i64>().ok()) {
                Some(id) => id,
                None => {
                    let _ = msg.reply(&ctx.http, "❌ Missing Server ID option (e.g. `!dashboard 9`)").await;
                    return Ok(());
                }
            };

            // Verification Check
            if !verify_text_permissions(ctx, msg, state, server_id).await {
                let _ = msg.reply(&ctx.http, "❌ You do not have permission to execute this administrator action.").await;
                return Ok(());
            }

            let current_channel_id = msg.channel_id.to_string();
            let conf_res = if let Ok(db) = state.db.lock() {
                db.get_server_discord_config(server_id)
            } else {
                Err("Database lock error".to_string())
            };

            let mut conf = match conf_res {
                Ok(c) => c,
                Err(e) => {
                    let _ = msg.reply(&ctx.http, format!("❌ Database error: {}", e)).await;
                    return Ok(());
                }
            };

            conf.enabled = true;
            conf.dashboard_channel_id = current_channel_id;
            conf.dashboard_message_id = String::new(); // Clear message ID to post fresh

            let save_res = if let Ok(db) = state.db.lock() {
                db.save_server_discord_config(&conf)
            } else {
                Err("Database lock error".to_string())
            };

            if let Err(e) = save_res {
                let _ = msg.reply(&ctx.http, format!("❌ Failed to save config: {}", e)).await;
                return Ok(());
            }

            let _ = msg.reply(&ctx.http, "⏳ Posting live dashboard...").await;

            let app_handle_clone = state.app_handle.clone();
            tokio::spawn(async move {
                let app_state = match app_handle_clone.try_state::<crate::AppState>() {
                    Some(s) => s,
                    None => return,
                };
                if let Err(e) = update_server_dashboard(&app_state, server_id, &conf).await {
                    log::error!("Failed to post dashboard: {}", e);
                }
            });
            return Ok(());
        }
        "start" | "stop" | "restart" | "save" | "backup" => {
            let server_id = match args.first().and_then(|s| s.parse::<i64>().ok()) {
                Some(id) => id,
                None => {
                    let _ = msg.reply(&ctx.http, "❌ Missing Server ID option (e.g. `!start 9`)").await;
                    return Ok(());
                }
            };

            // Verification Check
            if !verify_text_permissions(ctx, msg, state, server_id).await {
                let _ = msg.reply(&ctx.http, "❌ You do not have permission to execute this administrator action.").await;
                return Ok(());
            }

            let ctx_clone = ctx.clone();
            let msg_clone = msg.clone();
            let app_handle_clone = state.app_handle.clone();
            let name_owned = cmd_name.to_string();
            tokio::spawn(async move {
                let action_res = match name_owned.as_str() {
                    "start" => {
                        let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                        crate::commands::server::start_server(app_state_tauri, server_id)
                            .await
                            .map(|_| "Server started!".to_string())
                    }
                    "stop" => {
                        let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                        crate::commands::server::stop_server(app_state_tauri, server_id, false)
                            .await
                            .map(|_| "Server stopped!".to_string())
                    }
                    "restart" => {
                        let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                        crate::commands::server::restart_server(app_state_tauri, server_id)
                            .await
                            .map(|_| "Server restarting!".to_string())
                    }
                    "save" => {
                        if let Some(rcon_state) =
                            app_handle_clone.try_state::<crate::commands::rcon::RconState>()
                        {
                            rcon_state.0.send_command(server_id, "Save").await
                        } else {
                            Err("RCON service unavailable".to_string())
                        }
                    }
                    "backup" => {
                        let app_state_tauri = app_handle_clone.state::<crate::AppState>();
                        crate::commands::backup::create_backup(
                            app_state_tauri,
                            server_id,
                            Some("Discord Bot Command".to_string()),
                        )
                        .await
                        .map(|_| "Backup created!".to_string())
                    }
                    _ => Err("Unknown action".to_string()),
                };

                let final_msg = match action_res {
                    Ok(msg) => format!("✅ Command executed: {}", msg),
                    Err(e) => format!("❌ Execution failed: {}", e),
                };
                let _ = msg_clone.reply(&ctx_clone.http, final_msg).await;
            });
            return Ok(());
        }
        "broadcast" => {
            let server_id = match args.first().and_then(|s| s.parse::<i64>().ok()) {
                Some(id) => id,
                None => {
                    let _ = msg.reply(&ctx.http, "❌ Missing Server ID option (e.g. `!broadcast 9 hello`)").await;
                    return Ok(());
                }
            };
            if args.len() < 2 {
                let _ = msg.reply(&ctx.http, "❌ Missing message to broadcast (e.g. `!broadcast 9 hello`)").await;
                return Ok(());
            }
            let message_str = args[1..].join(" ");

            if !verify_text_permissions(ctx, msg, state, server_id).await {
                let _ = msg.reply(&ctx.http, "❌ You do not have permission to execute this moderator action.").await;
                return Ok(());
            }

            let rcon_state = &state
                .app_handle
                .state::<crate::commands::rcon::RconState>()
                .0;
            let res = rcon_state
                .send_command(server_id, &format!("Broadcast {}", message_str))
                .await;
            match res {
                Ok(_) => format!("📢 Broadcasted in-game: *{}*", message_str),
                Err(e) => format!("❌ Failed to broadcast: {}", e),
            }
        }
        _ => return Ok(()),
    };

    let _ = msg.reply(&ctx.http, response_text).await;
    Ok(())
}
