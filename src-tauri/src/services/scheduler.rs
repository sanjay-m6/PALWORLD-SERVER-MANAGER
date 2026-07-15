/// Scheduler Service — Cron-based task scheduling for auto-restart, auto-backup, auto-update

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
use serde::Serialize;
use cron::Schedule;
use std::str::FromStr;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerUpdateNotification {
    pub server_id: i64,
    pub server_name: String,
    pub event_type: String,
    pub message: String,
}

pub struct SchedulerService {
    app_handle: AppHandle,
    running: Arc<AtomicBool>,
}

fn normalize_cron(expr: &str) -> String {
    let parts: Vec<&str> = expr.split_whitespace().collect();
    if parts.len() == 5 {
        format!("0 {}", expr)
    } else {
        expr.to_string()
    }
}

impl SchedulerService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self) {
        if self.running.load(Ordering::SeqCst) {
            return;
        }
        self.running.store(true, Ordering::SeqCst);

        let app_handle = self.app_handle.clone();
        let running = self.running.clone();

        std::thread::spawn(move || {
            log::info!("[SCHEDULER] Background scheduler started");
            let mut last_update_checks = std::collections::HashMap::<i64, std::time::Instant>::new();
            while running.load(Ordering::SeqCst) {
                // Check every 60 seconds
                std::thread::sleep(std::time::Duration::from_secs(60));

                if let Some(state) = app_handle.try_state::<crate::AppState>() {
                    // Check for automatic backups/updates for all servers
                    let servers = {
                        if let Ok(db) = state.db.lock() {
                            db.get_all_servers().unwrap_or_default()
                        } else {
                            Vec::new()
                        }
                    };

                    for server in &servers {
                        let server_id = server.id;
                        
                        // Auto-update check
                        let auto_update_enabled = {
                            if let Ok(db) = state.db.lock() {
                                db.get_setting(&format!("auto_update_enabled_{}", server_id))
                                    .unwrap_or(None)
                                    .map(|v| v == "true")
                                    .unwrap_or(false)
                            } else {
                                false
                            }
                        };

                        let auto_backup_enabled = {
                            if let Ok(db) = state.db.lock() {
                                db.get_setting(&format!("auto_backup_enabled_{}", server_id))
                                    .unwrap_or(None)
                                    .map(|v| v == "true")
                                    .unwrap_or(false)
                            } else {
                                false
                            }
                        };

                        if auto_update_enabled {
                            let now = std::time::Instant::now();
                            let should_check = match last_update_checks.get(&server_id) {
                                None => true,
                                Some(&last_time) => now.duration_since(last_time).as_secs() >= 600,
                            };

                            if should_check {
                                last_update_checks.insert(server_id, now);
                                log::info!("[SCHEDULER] Checking for official Steam update for server ID {}", server_id);
                                
                                let app_handle_clone = app_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Some(s) = app_handle_clone.try_state::<crate::AppState>() {
                                        let _ = s.update_manager.check_and_run_update(server_id).await;
                                    }
                                });
                            }
                        }

                        if auto_backup_enabled {
                            let auto_backup_interval_str = {
                                if let Ok(db) = state.db.lock() {
                                    db.get_setting(&format!("auto_backup_interval_{}", server_id))
                                        .unwrap_or(None)
                                        .unwrap_or_else(|| "6h".to_string())
                                } else {
                                    "6h".to_string()
                                }
                            };

                            let interval_minutes = match auto_backup_interval_str.as_str() {
                                "1h" => 60,
                                "6h" => 360,
                                "12h" => 720,
                                "24h" => 1440,
                                _ => 360,
                            };

                            let mut last_backup_time = None;
                            if let Ok(db) = state.db.lock() {
                                if let Ok(backups) = db.get_backups(server_id) {
                                    for backup in backups {
                                        if backup.backup_type == "auto" {
                                            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&backup.created_at, "%Y-%m-%d %H:%M:%S") {
                                                last_backup_time = Some(dt);
                                                break; 
                                            }
                                        }
                                    }
                                }
                            }

                            let should_backup = match last_backup_time {
                                None => true, 
                                Some(last_time) => {
                                    let now = chrono::Utc::now().naive_utc();
                                    let diff = now.signed_duration_since(last_time);
                                    diff.num_minutes() >= interval_minutes
                                }
                            };

                            if should_backup {
                                log::info!("[SCHEDULER] Triggering automatic backup for server ID {}", server_id);
                                
                                let install_path = server.install_path.to_string_lossy().to_string();
                                let app_dir = match state.app_handle.path().app_data_dir() {
                                    Ok(d) => d,
                                    Err(_) => continue,
                                };
                                let backup_dir = app_dir.join("backups").join(server_id.to_string());
                                let backup_dir_str = backup_dir.to_string_lossy().to_string();

                                match crate::services::backup_service::BackupService::create_backup(
                                    &install_path,
                                    &backup_dir_str,
                                    Some("auto"),
                                    true,
                                    true,
                                ) {
                                    Ok((path, size)) => {
                                        if let Ok(db) = state.db.lock() {
                                            let path_str = path.to_string_lossy().to_string();
                                            let _ = db.create_backup(server_id, "auto", &path_str, size, Some("Auto Backup"));
                                            
                                            let retention_str = db.get_setting(&format!("auto_backup_retention_{}", server_id))
                                                .unwrap_or(None)
                                                .unwrap_or_else(|| "10".to_string());
                                            let retention_limit = retention_str.parse::<usize>().unwrap_or(10);

                                            if let Ok(backups) = db.get_backups(server_id) {
                                                let mut auto_backups: Vec<_> = backups.into_iter().filter(|b| b.backup_type == "auto").collect();
                                                if auto_backups.len() > retention_limit {
                                                    let num_to_delete = auto_backups.len() - retention_limit;
                                                    for _ in 0..num_to_delete {
                                                        if let Some(old_backup) = auto_backups.pop() {
                                                            let _ = db.delete_backup(old_backup.id);
                                                            let _ = std::fs::remove_file(old_backup.file_path);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        log::error!("[SCHEDULER] Automatic backup failed: {}", e);
                                    }
                                }
                            }
                        }
                    }

                    // Run user-scheduled custom cron tasks
                    let enabled_tasks = {
                        if let Ok(db) = state.db.lock() {
                            db.get_all_enabled_tasks().unwrap_or_default()
                        } else {
                            Vec::new()
                        }
                    };

                    for task in enabled_tasks {
                        let task_id = task.id;
                        let server_id = task.server_id;
                        let cron_expr = task.cron_expression.clone();
                        
                        let normalized = normalize_cron(&cron_expr);
                        if let Ok(schedule) = Schedule::from_str(&normalized) {
                            let now = chrono::Utc::now();
                            
                            let mut should_run = false;
                            
                            if let Some(next_run_str) = &task.next_run {
                                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(next_run_str) {
                                    let dt_utc = dt.with_timezone(&chrono::Utc);
                                    if now >= dt_utc {
                                        should_run = true;
                                    }
                                }
                            } else {
                                if let Some(next) = schedule.upcoming(chrono::Utc).next() {
                                    if let Ok(db) = state.db.lock() {
                                        if let Ok(conn) = db.get_connection() {
                                            let _ = conn.execute(
                                                "UPDATE scheduler_tasks SET next_run = ?1 WHERE id = ?2",
                                                [next.to_rfc3339(), task_id.to_string()],
                                            );
                                        }
                                    }
                                }
                            }

                            if should_run {
                                log::info!("[SCHEDULER] Executing scheduled task '{}' (ID {}) of type '{}'", task.task_name, task_id, task.task_type);
                                
                                let next_run_str = if let Some(next) = schedule.upcoming(chrono::Utc).next() {
                                    next.to_rfc3339()
                                } else {
                                    "".to_string()
                                };

                                if let Ok(db) = state.db.lock() {
                                    if let Ok(conn) = db.get_connection() {
                                        let _ = conn.execute(
                                            "UPDATE scheduler_tasks SET last_run = ?1, next_run = ?2 WHERE id = ?3",
                                            [now.to_rfc3339(), next_run_str, task_id.to_string()],
                                        );
                                    }
                                }

                                let app_handle_clone = app_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    execute_scheduled_task(app_handle_clone, server_id, task_id, task.task_type.clone()).await;
                                });
                            }
                        }
                    }
                }
            }
            log::info!("[SCHEDULER] Background scheduler stopped");
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

async fn execute_scheduled_task(app_handle: AppHandle, server_id: i64, task_id: i64, task_type: String) {
    if let Some(state) = app_handle.try_state::<crate::AppState>() {
        let (player_aware, pre_backup, grace_period_mins) = {
            if let Ok(db) = state.db.lock() {
                let aware = db.get_setting(&format!("task_player_aware_{}", task_id)).unwrap_or(None).map(|v| v == "true").unwrap_or(false);
                let backup = db.get_setting(&format!("task_pre_backup_{}", task_id)).unwrap_or(None).map(|v| v == "true").unwrap_or(false);
                let grace = db.get_setting(&format!("task_grace_period_{}", task_id)).unwrap_or(None).and_then(|v| v.parse::<u64>().ok()).unwrap_or(5);
                (aware, backup, grace)
            } else {
                (false, false, 5)
            }
        };

        let mut players_online = false;
        if player_aware {
            if let Some(rcon_state) = app_handle.try_state::<crate::commands::rcon::RconState>() {
                if let Ok(response) = rcon_state.0.send_command(server_id, "ShowPlayers").await {
                    let players = crate::services::rcon::RconService::parse_player_list(&response);
                    if !players.is_empty() {
                        players_online = true;
                    }
                }
            }
        }

        if players_online {
            log::info!("[SCHEDULER] Player-aware check detected online players. Starting grace period countdown.");
            let msg = format!("Scheduled server task ({}) will execute in {} minutes. Please save progress.", task_type, grace_period_mins);
            if let Some(rcon_state) = app_handle.try_state::<crate::commands::rcon::RconState>() {
                let _ = rcon_state.0.send_command(server_id, &format!("Broadcast {}", msg)).await;
            }

            let steps = if grace_period_mins >= 5 {
                vec![(grace_period_mins - 2, 2), (2, 1), (1, 0)]
            } else if grace_period_mins >= 3 {
                vec![(grace_period_mins - 1, 1), (1, 0)]
            } else {
                vec![(grace_period_mins, 0)]
            };

            for (sleep_mins, next_warn) in steps {
                tokio::time::sleep(tokio::time::Duration::from_secs(sleep_mins * 60)).await;
                if next_warn > 0 {
                    let msg = format!("Scheduled server task ({}) in {} minute(s). Please log out.", task_type, next_warn);
                    if let Some(rcon_state) = app_handle.try_state::<crate::commands::rcon::RconState>() {
                        let _ = rcon_state.0.send_command(server_id, &format!("Broadcast {}", msg)).await;
                    }
                }
            }

            if let Some(rcon_state) = app_handle.try_state::<crate::commands::rcon::RconState>() {
                let _ = rcon_state.0.send_command(server_id, "Broadcast Server_restarting_in_10_seconds!").await;
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
            }
        }

        if pre_backup {
            log::info!("[SCHEDULER] Executing pre-task backup for server ID {}", server_id);
            let server_opt = if let Ok(db) = state.db.lock() {
                db.get_all_servers().unwrap_or_default().into_iter().find(|s| s.id == server_id)
            } else {
                None
            };
            if let Some(server) = server_opt {
                let install_path = server.install_path.to_string_lossy().to_string();
                if let Ok(app_dir) = state.app_handle.path().app_data_dir() {
                    let backup_dir = app_dir.join("backups").join(server_id.to_string());
                    let backup_dir_str = backup_dir.to_string_lossy().to_string();
                    if let Ok((path, size)) = crate::services::backup_service::BackupService::create_backup(
                        &install_path,
                        &backup_dir_str,
                        Some("auto"),
                        true,
                        true,
                    ) {
                        if let Ok(db) = state.db.lock() {
                            let path_str = path.to_string_lossy().to_string();
                            let _ = db.create_backup(server_id, "auto", &path_str, size, Some("Pre-Scheduler Task Backup"));
                        }
                    }
                }
            }
        }

        match task_type.as_str() {
            "restart" => {
                log::info!("[SCHEDULER] Performing scheduled restart for server ID {}", server_id);
                let _ = state.process_manager.stop_server(server_id, crate::services::process_manager::StopReason::ScheduledRestart);
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                if let Some(params) = get_start_params(&state, server_id) {
                    if let Ok(db) = state.db.lock() {
                        let _ = db.update_server_status(server_id, "starting");
                        let _ = db.update_server_last_started(server_id);
                    }
                    match state.process_manager.start_server(
                        server_id,
                        &params.0,
                        &params.1,
                        params.2,
                        params.3,
                        &params.4,
                    ) {
                        Ok(_) => {
                            if let Ok(db) = state.db.lock() {
                                let _ = db.update_server_status(server_id, "running");
                            }
                        }
                        Err(e) => {
                            log::error!("[SCHEDULER] Failed to restart server ID {}: {}", server_id, e);
                            if let Ok(db) = state.db.lock() {
                                let _ = db.update_server_status(server_id, "crashed");
                            }
                        }
                    }
                }
            }
            "backup" => {
                log::info!("[SCHEDULER] Performing scheduled backup for server ID {}", server_id);
                if !pre_backup {
                    let server_opt = if let Ok(db) = state.db.lock() {
                        db.get_all_servers().unwrap_or_default().into_iter().find(|s| s.id == server_id)
                    } else {
                        None
                    };
                    if let Some(server) = server_opt {
                        let install_path = server.install_path.to_string_lossy().to_string();
                        if let Ok(app_dir) = state.app_handle.path().app_data_dir() {
                            let backup_dir = app_dir.join("backups").join(server_id.to_string());
                            let backup_dir_str = backup_dir.to_string_lossy().to_string();
                            if let Ok((path, size)) = crate::services::backup_service::BackupService::create_backup(
                                &install_path,
                                &backup_dir_str,
                                Some("auto"),
                                true,
                                true,
                            ) {
                                if let Ok(db) = state.db.lock() {
                                    let path_str = path.to_string_lossy().to_string();
                                    let _ = db.create_backup(server_id, "auto", &path_str, size, Some("Scheduled Backup"));
                                }
                            }
                        }
                    }
                }
            }
            "update" => {
                log::info!("[SCHEDULER] Performing scheduled update for server ID {}", server_id);
                let server_opt = if let Ok(db) = state.db.lock() {
                    db.get_all_servers().unwrap_or_default().into_iter().find(|s| s.id == server_id)
                } else {
                    None
                };
                if let Some(server) = server_opt {
                    let was_running = state.process_manager.is_server_running(server_id);
                    if was_running {
                        let _ = state.process_manager.stop_server(server_id, crate::services::process_manager::StopReason::UpdateRequired);
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    }
                    
                    let install_path_str = server.install_path.to_string_lossy().to_string();
                    let branch_str = server.branch.clone();
                    
                    let update_res = state.steamcmd.update_server(
                        app_handle.clone(),
                        &install_path_str,
                        Some(&branch_str)
                    ).await;

                    if update_res.is_ok() && was_running {
                        if let Some(params) = get_start_params(&state, server_id) {
                            if let Ok(db) = state.db.lock() {
                                let _ = db.update_server_status(server_id, "starting");
                                let _ = db.update_server_last_started(server_id);
                            }
                            match state.process_manager.start_server(
                                server_id,
                                &params.0,
                                &params.1,
                                params.2,
                                params.3,
                                &params.4,
                            ) {
                                Ok(_) => {
                                    if let Ok(db) = state.db.lock() {
                                        let _ = db.update_server_status(server_id, "running");
                                    }
                                }
                                Err(e) => {
                                    log::error!("[SCHEDULER] Failed to start server ID {} after update: {}", server_id, e);
                                    if let Ok(db) = state.db.lock() {
                                        let _ = db.update_server_status(server_id, "crashed");
                                    }
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

fn get_start_params(state: &crate::AppState, server_id: i64) -> Option<(String, String, u16, u16, String)> {
    if let Ok(db) = state.db.lock() {
        if let Ok(conn) = db.get_connection() {
            conn.query_row(
                "SELECT install_path, startup_args, game_port, rcon_port, admin_password FROM servers WHERE id = ?1",
                [server_id],
                |row| Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1).unwrap_or_default(),
                    row.get::<_, u16>(2).unwrap_or(8211),
                    row.get::<_, u16>(3).unwrap_or(25575),
                    row.get::<_, String>(4).unwrap_or_default(),
                )),
            ).ok()
        } else {
            None
        }
    } else {
        None
    }
}
