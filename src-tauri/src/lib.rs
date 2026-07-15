#![allow(dead_code)]

pub mod commands;
mod db;
mod models;
mod services;

use commands::rcon::RconState;
use db::Database;
use services::log_watcher::LogWatcherService;
use services::process_manager::ProcessManager;
use services::rcon::RconService;
use services::scheduler::SchedulerService;
use services::steamcmd::SteamCmdService;
use services::installation_manager::InstallationManager;
use services::update_manager::UpdateManager;
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Database>,
    pub process_manager: ProcessManager,
    pub sys: Mutex<System>,
    pub app_handle: tauri::AppHandle,
    pub log_watcher: LogWatcherService,
    pub scheduler: Arc<SchedulerService>,
    pub steamcmd: SteamCmdService,
    pub installation_manager: Arc<InstallationManager>,
    pub update_manager: Arc<UpdateManager>,
    pub discord_bot: Arc<crate::services::discord_bot::DiscordBotService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(safe_mode: bool) -> tauri::Result<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app_handle = window.app_handle().clone();
                let state = match app_handle.try_state::<AppState>() {
                    Some(s) => s,
                    None => return,
                };

                let minimize_to_tray = {
                    if let Ok(db) = state.db.lock() {
                        db.get_setting("start_minimized_to_tray")
                            .unwrap_or(None)
                            .map(|v| v == "true")
                            .unwrap_or(false)
                    } else {
                        false
                    }
                };

                if minimize_to_tray {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .setup(move |app| {
            // Initialize database
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("failed to get app data dir: {}", e))?;
            std::fs::create_dir_all(&app_dir)
                .map_err(|e| format!("failed to create app data dir: {}", e))?;
            let db_path = app_dir.join("palworld_manager.db");

            let db = match Database::new(db_path.clone()) {
                Ok(db) => db,
                Err(e) => {
                    println!("❌ Database connection failed: {}", e);
                    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
                    let backup_path =
                        app_dir.join(format!("palworld_manager_corrupted_{}.db", timestamp));
                    if let Err(rename_err) = std::fs::rename(&db_path, &backup_path) {
                        eprintln!("Failed to rename corrupted DB: {}", rename_err);
                    } else {
                        println!("✅ Corrupted DB backed up to: {:?}", backup_path);
                    }
                    Database::new(db_path.clone())
                        .map_err(|e| format!("failed to initialize database after reset: {}", e))?
                }
            };

            // Build System Tray
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let app_handle = app.handle().clone();

            let show_i =
                MenuItem::with_id(&app_handle, "show", "Show Manager", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(&app_handle, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(&app_handle, &[&show_i, &quit_i])?;

            let icon = app
                .default_window_icon()
                .cloned()
                .expect("Default window icon is required for tray");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app: &tauri::AppHandle, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Recover orphaned servers
            if let Ok(conn) = db.get_connection() {
                let active_count: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM servers WHERE status IN ('running','starting','online','restarting','updating','stopping')",
                        [],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                if active_count > 0 {
                    if ProcessManager::check_for_running_palservers() {
                        println!("[LIFECYCLE] Found running PalServer processes on startup. Keeping active status.");
                    } else {
                        println!("[LIFECYCLE] No PalServer processes found. Resetting {} servers to stopped.", active_count);
                        let _ = conn.execute(
                            "UPDATE servers SET status = 'stopped' WHERE status IN ('running','starting','online','restarting','updating','stopping')",
                            [],
                        );
                    }
                }
            }

            let mut sys = System::new_all();
            sys.refresh_all();
            let app_handle = app.handle().clone();

            // Initialize services
            let log_watcher = LogWatcherService::new(app_handle.clone());
            let rcon_service = RconService::new();
            let scheduler = Arc::new(SchedulerService::new(app_handle.clone()));
            let steamcmd = SteamCmdService::new(app_dir.clone());
            let db_for_installer = Database::new(db_path.clone()).expect("Failed to open DB for installer");
            let installation_manager = Arc::new(InstallationManager::new(db_for_installer));
            let update_manager = Arc::new(UpdateManager::new(app_handle.clone()));
            let discord_bot = Arc::new(crate::services::discord_bot::DiscordBotService::new(app_handle.clone()));

            // Start bot automatically if enabled
            let bot_enabled = {
                if let Ok(conn) = db.get_connection() {
                    let val: Option<String> = conn.query_row(
                        "SELECT value FROM settings WHERE key = 'discord_bot_enabled'",
                        [],
                        |row| row.get(0),
                    ).ok();
                    val.map(|v| v == "true").unwrap_or(false)
                } else {
                    false
                }
            };
            if bot_enabled && !safe_mode {
                let bot_clone = discord_bot.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = bot_clone.start().await;
                });
            }

            // Manage AppState
            app.manage(AppState {
                db: Mutex::new(db),
                process_manager: ProcessManager::new(app_handle.clone()),
                sys: Mutex::new(sys),
                app_handle: app_handle.clone(),
                log_watcher,
                scheduler: scheduler.clone(),
                steamcmd,
                installation_manager,
                update_manager,
                discord_bot,
            });

            app.manage(RconState(rcon_service));

            // Start watching logs for already running servers
            if let Some(state) = app_handle.try_state::<AppState>() {
                let running_servers: Vec<(i64, String)> = {
                    if let Ok(db) = state.db.lock() {
                        if let Ok(conn) = db.get_connection() {
                            if let Ok(mut stmt) = conn.prepare("SELECT id, install_path FROM servers WHERE status = 'running'") {
                                let rows = stmt.query_map([], |row| {
                                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                                });
                                if let Ok(rows) = rows {
                                    rows.filter_map(|r| r.ok()).collect()
                                } else { Vec::new() }
                            } else { Vec::new() }
                        } else { Vec::new() }
                    } else { Vec::new() }
                };
                for (server_id, install_path) in running_servers {
                    log::info!("[STARTUP] Restoring log watcher for running server ID {}", server_id);
                    state.log_watcher.start_watching(server_id, &install_path);
                }
            }

            // Start background services
            if !safe_mode {
                scheduler.start();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Server commands
            commands::server::get_servers,
            commands::server::run_server_update,
            commands::server::check_for_server_updates,
            commands::server::create_server,
            commands::server::delete_server,
            commands::server::start_server,
            commands::server::stop_server,
            commands::server::restart_server,
            commands::server::clone_server,
            commands::server::get_server_status,
            commands::server::update_server_branch,
            commands::server::update_server_auto_start,
            commands::server::update_server_auto_restart,
            commands::server::update_server_run_as_admin,
            commands::server::update_server_optimize_ram,
            commands::server::clear_server_cache,
            commands::server::wipe_server,
            // Config commands
            commands::config::get_server_config,
            commands::config::save_server_config,
            commands::config::allocate_ports,
            commands::config::open_firewall_ports,
            commands::config::check_firewall_status,
            commands::config::get_raw_config,
            commands::config::save_raw_config,
            commands::config::get_config_presets,
            commands::config::apply_preset,
            // RCON commands
            commands::rcon::rcon_connect,
            commands::rcon::rcon_disconnect,
            commands::rcon::rcon_send_command,
            commands::rcon::get_player_list,
            commands::rcon::kick_player,
            commands::rcon::ban_player,
            commands::rcon::broadcast_message,
            commands::backup::create_backup,
            commands::backup::get_backups,
            commands::backup::restore_backup,
            commands::backup::delete_backup,
            commands::backup::export_backup,
            commands::backup::import_backup,
            commands::backup::export_server_migration,
            commands::backup::import_server_migration,
            // System commands
            commands::system::get_system_info,
            commands::system::get_process_stats,
            commands::system::check_port_available,
            commands::system::get_public_ip,
            commands::system::get_local_ip,
            commands::system::check_steamcmd_installed,
            commands::system::detect_steamcmd,
            commands::system::check_server_installed,
            commands::system::install_steamcmd,
            commands::system::install_palworld_server,
            commands::system::update_palworld_server,
            commands::system::get_setting,
            commands::system::set_setting,
            commands::system::setup_firewall_rules,
            commands::system::list_installed_mods,
            commands::system::get_mod_files,
            commands::system::install_mod,
            commands::system::toggle_mod,
            commands::system::delete_mod,
            commands::system::get_mod_performance_report,
            commands::system::check_mod_conflicts,
            commands::system::create_mod_snapshot,
            commands::system::list_mod_snapshots,
            commands::system::restore_mod_snapshot,
            commands::system::download_and_install_mod_via_url,
            commands::system::search_mods_online,
            commands::system::download_nexus_mod_via_api,
            commands::system::download_curseforge_mod_via_api,
            commands::system::open_popout_window,
            commands::system::get_server_extended_details,
            commands::system::open_folder,
            commands::system::parse_existing_server_config,
            commands::system::read_pal_mod_settings,
            commands::system::save_pal_mod_settings,
            commands::system::read_mod_file_content,
            commands::system::save_mod_file_content,
            // Mod compatibility commands
            commands::compatibility::check_mod_compatibility,
            commands::compatibility::clean_mod_residue,
            // Installation commands
            commands::installation::start_server_installation,
            commands::installation::cancel_server_installation,
            commands::installation::get_active_installation_state,
            commands::installation::get_server_installation_history,
            commands::installation::run_installation_diagnostics,
            // Scheduler commands
            commands::scheduler::get_tasks,
            commands::scheduler::create_task,
            commands::scheduler::delete_task,
            commands::scheduler::toggle_task,
            commands::scheduler::update_task,
            // Access Control commands
            commands::access_control::get_ban_list,
            commands::access_control::remove_ban,
            commands::access_control::add_to_ban_list,
            commands::access_control::get_whitelist,
            commands::access_control::set_whitelist,
            // Discord commands
            commands::discord::test_discord_webhook,
            commands::discord::send_discord_notification,
            // Discord Bot commands
            commands::discord_bot::get_discord_bot_status,
            commands::discord_bot::toggle_discord_bot,
            commands::discord_bot::get_server_discord_config,
            commands::discord_bot::save_server_discord_config,
            commands::discord_bot::force_refresh_discord_dashboard,
            commands::discord_bot::test_discord_bot_connection,
            // Startup commands
            commands::startup::get_startup_enabled,
            commands::startup::set_startup_enabled,
            commands::startup::auto_start_servers,
            // Workshop commands
            commands::workshop::download_workshop_mod,
            commands::workshop::check_ue4ss_installed,
            commands::workshop::install_ue4ss,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
