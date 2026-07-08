/// Scheduler Service — Cron-based task scheduling for auto-restart, auto-backup, auto-update

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};

pub struct SchedulerService {
    app_handle: AppHandle,
    running: Arc<AtomicBool>,
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
            while running.load(Ordering::SeqCst) {
                // Check every 60 seconds
                std::thread::sleep(std::time::Duration::from_secs(60));

                if let Some(state) = app_handle.try_state::<crate::AppState>() {
                    // Check for automatic backups for all servers
                    let servers = {
                        if let Ok(db) = state.db.lock() {
                            db.get_all_servers().unwrap_or_default()
                        } else {
                            Vec::new()
                        }
                    };

                    for server in servers {
                        let server_id = server.id;
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

                        if !auto_backup_enabled {
                            continue;
                        }

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

                        // Check the last automatic backup created for this server
                        let mut last_backup_time = None;
                        if let Ok(db) = state.db.lock() {
                            if let Ok(backups) = db.get_backups(server_id) {
                                for backup in backups {
                                    if backup.backup_type == "auto" {
                                        // created_at is in format YYYY-MM-DD HH:MM:SS or similar SQLite standard datetime
                                        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&backup.created_at, "%Y-%m-%d %H:%M:%S") {
                                            last_backup_time = Some(dt);
                                            break; // Since we ordered by created_at DESC, the first match is the latest one
                                        }
                                    }
                                }
                            }
                        }

                        let should_backup = match last_backup_time {
                            None => true, // No auto backups exist yet
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

                            // Run backup creation
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
                                        
                                        // Handle retention limit
                                        let retention_str = db.get_setting(&format!("auto_backup_retention_{}", server_id))
                                            .unwrap_or(None)
                                            .unwrap_or_else(|| "10".to_string());
                                        let retention_limit = retention_str.parse::<usize>().unwrap_or(10);

                                        if let Ok(backups) = db.get_backups(server_id) {
                                            let mut auto_backups: Vec<_> = backups.into_iter().filter(|b| b.backup_type == "auto").collect();
                                            if auto_backups.len() > retention_limit {
                                                // Delete oldest ones
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
            }
            log::info!("[SCHEDULER] Background scheduler stopped");
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}
