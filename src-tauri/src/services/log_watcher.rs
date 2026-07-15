/// Log Watcher — Tails PalServer log files and emits events to the frontend
///
/// Uses a position-tracking approach instead of BufReader to reliably tail
/// log files on Windows, where BufReader can cache EOF state and miss new content.
/// Searches multiple log file locations for maximum compatibility.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use serde::Serialize;

#[derive(Clone, Serialize)]
struct LogEvent {
    server_id: i64,
    timestamp: String,
    level: String,
    message: String,
}

pub struct LogWatcherService {
    app_handle: AppHandle,
    watchers: Arc<std::sync::Mutex<std::collections::HashMap<i64, Arc<AtomicBool>>>>,
}

impl LogWatcherService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            watchers: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        }
    }

    /// Start watching a server's log file
    pub fn start_watching(&self, server_id: i64, install_path: &str) {
        let install_path = install_path.to_string();

        let running = Arc::new(AtomicBool::new(true));
        {
            let mut watchers = self.watchers.lock().unwrap();
            // Stop existing watcher for this server
            if let Some(old) = watchers.get(&server_id) {
                old.store(false, Ordering::SeqCst);
            }
            watchers.insert(server_id, running.clone());
        }

        let app_handle = self.app_handle.clone();

        std::thread::spawn(move || {
            // Build list of candidate log file locations
            let base = PathBuf::from(&install_path);
            let candidates = vec![
                base.join("Pal").join("Saved").join("Logs").join("PalServer-console.log"),
                base.join("Pal").join("Saved").join("Logs").join("Pal.log"),
                base.join("Pal").join("Saved").join("Logs").join("PalServer.log"),
                base.join("Saved").join("Logs").join("Pal.log"),
                base.join("Saved").join("Logs").join("PalServer.log"),
                base.join("Pal.log"),
                base.join("PalServer.log"),
                base.join("Pal").join("Saved").join("Logs").join("PalServer-backup.log"),
            ];

            log::info!(
                "[LOG_WATCHER] Starting watcher for server {} — searching {} candidate paths from base {:?}",
                server_id,
                candidates.len(),
                base
            );

            // Emit a status message so the user sees something in the console immediately
            let _ = app_handle.emit("server-log", LogEvent {
                server_id,
                timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                level: "info".to_string(),
                message: format!("[Manager] Server started — scanning for log file..."),
            });

            // Wait for any of the log files to appear (up to 120s)
            let mut log_path: Option<PathBuf> = None;
            let mut retries = 0;
            while retries < 60 && running.load(Ordering::SeqCst) {
                for candidate in &candidates {
                    if candidate.exists() {
                        log_path = Some(candidate.clone());
                        break;
                    }
                }
                if log_path.is_some() {
                    break;
                }
                if retries % 5 == 0 && retries > 0 {
                    log::debug!(
                        "[LOG_WATCHER] Still waiting for log file (attempt {}/60) for server {}",
                        retries,
                        server_id
                    );
                    let _ = app_handle.emit("server-log", LogEvent {
                        server_id,
                        timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                        level: "info".to_string(),
                        message: format!("[Manager] Waiting for server log file... ({}s)", retries * 2),
                    });
                }
                std::thread::sleep(std::time::Duration::from_secs(2));
                retries += 1;
            }

            let log_path = match log_path {
                Some(p) => p,
                None => {
                    log::warn!(
                        "[LOG_WATCHER] No log file found after 120s for server {}. Checked: {:?}",
                        server_id,
                        candidates
                    );
                    let _ = app_handle.emit("server-log", LogEvent {
                        server_id,
                        timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                        level: "warning".to_string(),
                        message: format!(
                            "[Manager] Could not find PalServer.log — check that the install path is correct: {}",
                            install_path
                        ),
                    });
                    return;
                }
            };

            log::info!(
                "[LOG_WATCHER] Found log file for server {}: {:?}",
                server_id,
                log_path
            );

            let _ = app_handle.emit("server-log", LogEvent {
                server_id,
                timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                level: "info".to_string(),
                message: format!("[Manager] Tailing log file: {}", log_path.display()),
            });

            // Read the last N lines of the existing log file for initial display
            let initial_lines = Self::read_last_n_lines(&log_path, 50);
            for line in &initial_lines {
                let level = Self::detect_log_level(line);
                let _ = app_handle.emit(
                    "server-log",
                    LogEvent {
                        server_id,
                        timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                        level,
                        message: line.clone(),
                    },
                );
            }

            // Track our read position — start from the current end of file
            let mut last_pos = match std::fs::metadata(&log_path) {
                Ok(m) => m.len(),
                Err(_) => 0,
            };

            let mut leftover = String::new();

            // Poll for new content
            while running.load(Ordering::SeqCst) {
                std::thread::sleep(std::time::Duration::from_millis(500));

                // Check current file size
                let current_size = match std::fs::metadata(&log_path) {
                    Ok(m) => m.len(),
                    Err(_) => continue,
                };

                // If file was truncated/rotated, reset position
                if current_size < last_pos {
                    log::info!(
                        "[LOG_WATCHER] Log file rotated for server {}, resetting position",
                        server_id
                    );
                    last_pos = 0;
                    leftover.clear();
                }

                // No new data
                if current_size == last_pos {
                    continue;
                }

                // Open the file fresh each time to avoid Windows file handle caching
                let mut file = match std::fs::File::open(&log_path) {
                    Ok(f) => f,
                    Err(e) => {
                        log::error!("[LOG_WATCHER] Failed to open log file: {}", e);
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        continue;
                    }
                };

                // Seek to where we left off
                if let Err(e) = file.seek(SeekFrom::Start(last_pos)) {
                    log::error!("[LOG_WATCHER] Failed to seek in log file: {}", e);
                    continue;
                }

                // Read new bytes (cap at 64KB per poll to avoid memory spikes)
                let bytes_to_read = std::cmp::min(current_size - last_pos, 65536) as usize;
                let mut buf = vec![0u8; bytes_to_read];
                match file.read(&mut buf) {
                    Ok(0) => continue,
                    Ok(n) => {
                        last_pos += n as u64;

                        // Decode as UTF-8 (lossy for safety — UE5 logs may contain non-UTF8 bytes)
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        leftover.push_str(&chunk);

                        // Process complete lines
                        while let Some(newline_pos) = leftover.find('\n') {
                            let line = leftover[..newline_pos].trim_end().to_string();
                            leftover = leftover[newline_pos + 1..].to_string();

                             if !line.is_empty() {
                                 let level = Self::detect_log_level(&line);
                                 let _ = app_handle.emit(
                                     "server-log",
                                     LogEvent {
                                         server_id,
                                         timestamp: chrono::Local::now()
                                             .format("%H:%M:%S")
                                             .to_string(),
                                         level,
                                         message: line.clone(),
                                     },
                                 );

                                 if let Some(state) = app_handle.try_state::<crate::AppState>() {
                                     let bot = state.discord_bot.clone();
                                     let line_clone = line.clone();
                                     tauri::async_runtime::spawn(async move {
                                         bot.queue_log(server_id, line_clone).await;
                                     });
                                 }
                             }
                        }
                    }
                    Err(e) => {
                        log::error!("[LOG_WATCHER] Read error: {}", e);
                        std::thread::sleep(std::time::Duration::from_secs(1));
                    }
                }
            }

            log::info!("[LOG_WATCHER] Watcher stopped for server {}", server_id);
        });
    }

    /// Stop watching a server's log
    pub fn stop_watching(&self, server_id: i64) {
        let mut watchers = self.watchers.lock().unwrap();
        if let Some(running) = watchers.remove(&server_id) {
            running.store(false, Ordering::SeqCst);
        }
    }

    /// Read the last N lines from a file (for initial display)
    fn read_last_n_lines(path: &PathBuf, n: usize) -> Vec<String> {
        let mut file = match std::fs::File::open(path) {
            Ok(f) => f,
            Err(_) => return vec![],
        };

        let file_len = match file.metadata() {
            Ok(m) => m.len(),
            Err(_) => return vec![],
        };

        let chunk_size = 4096;
        let mut pos = file_len;
        let mut buffer = Vec::new();
        let mut newlines_found = 0;

        while pos > 0 && newlines_found <= n {
            let read_size = std::cmp::min(pos, chunk_size);
            pos -= read_size;

            if file.seek(SeekFrom::Start(pos)).is_err() {
                break;
            }

            let mut chunk = vec![0u8; read_size as usize];
            if file.read_exact(&mut chunk).is_err() {
                break;
            }

            // Count newlines in the chunk backwards
            for &byte in chunk.iter().rev() {
                if byte == b'\n' {
                    newlines_found += 1;
                    if newlines_found > n {
                        break;
                    }
                }
            }

            // Prepend chunk to our buffer
            let mut new_buffer = chunk;
            new_buffer.extend_from_slice(&buffer);
            buffer = new_buffer;
        }

        let content = String::from_utf8_lossy(&buffer);
        content
            .lines()
            .rev()
            .take(n)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .filter(|l| !l.trim().is_empty())
            .map(|l| l.to_string())
            .collect()
    }

    fn detect_log_level(line: &str) -> String {
        let lower = line.to_lowercase();
        if lower.contains("error") || lower.contains("fatal") {
            "error".to_string()
        } else if lower.contains("warning") || lower.contains("warn") {
            "warning".to_string()
        } else if lower.contains("chat") {
            "chat".to_string()
        } else {
            "info".to_string()
        }
    }
}
