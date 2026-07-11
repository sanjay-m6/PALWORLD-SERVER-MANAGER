use rusqlite::{Connection, Result, params};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        // Enable Write-Ahead Logging (WAL) for concurrency
        let _mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;

        // Set synchronous mode to NORMAL (faster in WAL mode)
        conn.pragma_update(None, "synchronous", "NORMAL")?;

        // Set busy timeout to 5 seconds
        conn.pragma_update(None, "busy_timeout", 5000)?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        // Initialize schema
        let schema = include_str!("schema.sql");
        conn.execute_batch(schema)?;

        // Run migration for branch column if it doesn't exist
        let _ = conn.execute("ALTER TABLE servers ADD COLUMN branch TEXT DEFAULT 'public'", []);
        let _ = conn.execute("ALTER TABLE servers ADD COLUMN host TEXT DEFAULT '127.0.0.1'", []);
        let _ = conn.execute("ALTER TABLE servers ADD COLUMN is_remote INTEGER DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE servers ADD COLUMN auto_restart INTEGER DEFAULT 1", []);
        let _ = conn.execute("ALTER TABLE servers ADD COLUMN run_as_admin INTEGER DEFAULT 0", []);

        // Migration for installation_history table
        let _ = conn.execute(
            "CREATE TABLE IF NOT EXISTS installation_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                version TEXT DEFAULT '',
                branch TEXT DEFAULT 'public',
                status TEXT DEFAULT 'completed',
                downloaded_size INTEGER DEFAULT 0,
                duration_seconds INTEGER DEFAULT 0,
                average_speed_bps REAL DEFAULT 0.0,
                peak_speed_bps REAL DEFAULT 0.0,
                validation_result TEXT DEFAULT 'passed',
                notes TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        );

        // Migration for installation_recovery table
        let _ = conn.execute(
            "CREATE TABLE IF NOT EXISTS installation_recovery (
                server_id INTEGER PRIMARY KEY,
                is_installing INTEGER DEFAULT 0,
                stage TEXT DEFAULT '',
                progress REAL DEFAULT 0.0,
                status TEXT DEFAULT '',
                bytes_downloaded INTEGER DEFAULT 0,
                bytes_total INTEGER DEFAULT 0,
                logs TEXT DEFAULT '',
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )",
            [],
        );

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    pub fn get_connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|e| format!("Database lock error: {}", e))
    }

    // ─── Settings CRUD ──────────────────────────────────────────────────────

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.get_connection()?;
        match conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        ) {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
            params![key, value],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ─── Server CRUD ────────────────────────────────────────────────────────

    pub fn get_all_servers(&self) -> Result<Vec<crate::models::Server>, String> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, description, install_path, save_path, status, game_port, rcon_port, rcon_enabled,
                    rest_api_port, rest_api_enabled, max_players, admin_password, server_password, is_public,
                    preset, startup_args, crossplay_platforms, auto_start, auto_restart_schedule,
                    created_at, last_started, config_json, branch, host, is_remote, auto_restart, run_as_admin
             FROM servers ORDER BY id"
        ).map_err(|e| e.to_string())?;

        let servers = stmt.query_map([], |row| {
            Ok(crate::models::Server {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get::<_, String>(2).unwrap_or_default(),
                install_path: PathBuf::from(row.get::<_, String>(3).unwrap_or_default()),
                save_path: row.get::<_, String>(4).unwrap_or_default(),
                status: match row.get::<_, String>(5).unwrap_or_default().as_str() {
                    "starting" => crate::models::ServerStatus::Starting,
                    "running" => crate::models::ServerStatus::Running,
                    "online" => crate::models::ServerStatus::Online,
                    "stopping" => crate::models::ServerStatus::Stopping,
                    "crashed" => crate::models::ServerStatus::Crashed,
                    "updating" => crate::models::ServerStatus::Updating,
                    "restarting" => crate::models::ServerStatus::Restarting,
                    _ => crate::models::ServerStatus::Stopped,
                },
                ports: crate::models::ServerPorts {
                    game_port: row.get::<_, u16>(6).unwrap_or(8211),
                    rcon_port: row.get::<_, u16>(7).unwrap_or(25575),
                    rest_api_port: row.get::<_, u16>(9).unwrap_or(8212),
                },
                rcon_config: crate::models::RconConfig {
                    enabled: row.get::<_, bool>(8).unwrap_or(true),
                    password: row.get::<_, String>(12).unwrap_or_default(),
                },
                rest_api_config: crate::models::RestApiConfig {
                    enabled: row.get::<_, bool>(10).unwrap_or(true),
                    port: row.get::<_, u16>(9).unwrap_or(8212),
                },
                max_players: row.get::<_, u32>(11).unwrap_or(32),
                admin_password: row.get::<_, String>(12).unwrap_or_default(),
                server_password: row.get::<_, Option<String>>(13).ok().flatten(),
                is_public: row.get::<_, bool>(14).unwrap_or(false),
                preset: row.get::<_, String>(15).unwrap_or_else(|_| "Balanced".to_string()),
                startup_args: row.get::<_, Option<String>>(16).ok().flatten(),
                crossplay_platforms: row.get::<_, String>(17).unwrap_or_else(|_| "[]".to_string()),
                auto_start: row.get::<_, bool>(18).unwrap_or(false),
                auto_restart_schedule: row.get::<_, Option<String>>(19).ok().flatten(),
                created_at: row.get::<_, String>(20).unwrap_or_default(),
                last_started: row.get::<_, Option<String>>(21).ok().flatten(),
                config_json: row.get::<_, String>(22).unwrap_or_else(|_| "{}".to_string()),
                branch: row.get::<_, String>(23).unwrap_or_else(|_| "public".to_string()),
                host: row.get::<_, String>(24).unwrap_or_else(|_| "127.0.0.1".to_string()),
                is_remote: row.get::<_, bool>(25).unwrap_or(false),
                auto_restart: row.get::<_, i32>(26).unwrap_or(1) != 0,
                run_as_admin: row.get::<_, i32>(27).unwrap_or(0) != 0,
            })
        }).map_err(|e| e.to_string())?;

        Ok(servers.filter_map(|r| r.ok()).collect())
    }

    pub fn create_server(&self, req: &crate::models::CreateServerRequest, config_json: &str) -> Result<i64, String> {
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO servers (name, description, install_path, preset, game_port, rcon_port,
                                  rest_api_port, max_players, admin_password, server_password,
                                  is_public, auto_start, config_json, host, is_remote, auto_restart, run_as_admin)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                req.name,
                req.description.as_deref().unwrap_or(""),
                req.install_path,
                req.preset,
                req.game_port,
                req.rcon_port,
                req.rest_api_port,
                req.max_players,
                req.admin_password,
                req.server_password.as_deref().unwrap_or(""),
                req.is_public,
                req.auto_start,
                config_json,
                req.host.as_deref().unwrap_or("127.0.0.1"),
                req.is_remote.unwrap_or(false) as i32,
                req.auto_restart.unwrap_or(true) as i32,
                req.run_as_admin.unwrap_or(false) as i32,
            ],
        ).map_err(|e| e.to_string())?;

        Ok(conn.last_insert_rowid())
    }

    pub fn update_server_status(&self, server_id: i64, status: &str) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE servers SET status = ?1 WHERE id = ?2",
            params![status, server_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_server_last_started(&self, server_id: i64) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE servers SET last_started = datetime('now') WHERE id = ?1",
            params![server_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_server(&self, server_id: i64) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute("DELETE FROM servers WHERE id = ?1", params![server_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_server_config(&self, server_id: i64, config_json: &str) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE servers SET config_json = ?1 WHERE id = ?2",
            params![config_json, server_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_server_ports_and_settings(
        &self,
        server_id: i64,
        game_port: u16,
        rcon_port: u16,
        rest_api_port: u16,
        max_players: u32,
        admin_password: &str,
        server_password: &str,
    ) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE servers SET 
                game_port = ?1,
                rcon_port = ?2,
                rest_api_port = ?3,
                max_players = ?4,
                admin_password = ?5,
                server_password = ?6
             WHERE id = ?7",
            params![
                game_port,
                rcon_port,
                rest_api_port,
                max_players,
                admin_password,
                server_password,
                server_id
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_server_preset(&self, server_id: i64, preset: &str) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE servers SET preset = ?1 WHERE id = ?2",
            params![preset, server_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_server_install_path(&self, server_id: i64) -> Result<String, String> {
        let conn = self.get_connection()?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ).map_err(|e| format!("Server not found: {}", e))
    }

    // ─── Backup CRUD ────────────────────────────────────────────────────────

    pub fn create_backup(&self, server_id: i64, backup_type: &str, file_path: &str, size: i64, label: Option<&str>) -> Result<i64, String> {
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO backups (server_id, backup_type, file_path, size, label, status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'completed')",
            params![server_id, backup_type, file_path, size, label],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_backups(&self, server_id: i64) -> Result<Vec<crate::models::Backup>, String> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, server_id, backup_type, file_path, size, includes_configs, includes_saves,
                    verified, created_at, label, notes, is_protected, status, hash
             FROM backups WHERE server_id = ?1 ORDER BY created_at DESC"
        ).map_err(|e| e.to_string())?;

        let backups = stmt.query_map([server_id], |row| {
            Ok(crate::models::Backup {
                id: row.get(0)?,
                server_id: row.get(1)?,
                backup_type: row.get::<_, String>(2).unwrap_or_default(),
                file_path: PathBuf::from(row.get::<_, String>(3).unwrap_or_default()),
                size: row.get::<_, i64>(4).unwrap_or(0),
                includes_configs: row.get::<_, bool>(5).unwrap_or(true),
                includes_saves: row.get::<_, bool>(6).unwrap_or(true),
                verified: row.get::<_, bool>(7).unwrap_or(false),
                created_at: row.get::<_, String>(8).unwrap_or_default(),
                label: row.get::<_, Option<String>>(9).ok().flatten(),
                notes: row.get::<_, Option<String>>(10).ok().flatten(),
                is_protected: row.get::<_, bool>(11).unwrap_or(false),
                status: row.get::<_, String>(12).unwrap_or_else(|_| "completed".to_string()),
                hash: row.get::<_, Option<String>>(13).ok().flatten(),
            })
        }).map_err(|e| e.to_string())?;

        Ok(backups.filter_map(|r| r.ok()).collect())
    }

    pub fn delete_backup(&self, backup_id: i64) -> Result<String, String> {
        let conn = self.get_connection()?;
        let file_path: String = conn.query_row(
            "SELECT file_path FROM backups WHERE id = ?1",
            [backup_id],
            |row| row.get(0),
        ).map_err(|e| format!("Backup not found: {}", e))?;

        conn.execute("DELETE FROM backups WHERE id = ?1", params![backup_id])
            .map_err(|e| e.to_string())?;

        Ok(file_path)
    }

    // ─── Scheduler Tasks ────────────────────────────────────────────────────

    pub fn get_tasks(&self, server_id: i64) -> Result<Vec<crate::models::SchedulerTask>, String> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, server_id, task_name, task_type, cron_expression, enabled, last_run, next_run, created_at
             FROM scheduler_tasks WHERE server_id = ?1 ORDER BY id"
        ).map_err(|e| e.to_string())?;

        let tasks = stmt.query_map([server_id], |row| {
            Ok(crate::models::SchedulerTask {
                id: row.get(0)?,
                server_id: row.get(1)?,
                task_name: row.get::<_, String>(2).unwrap_or_default(),
                task_type: row.get::<_, String>(3).unwrap_or_default(),
                cron_expression: row.get::<_, String>(4).unwrap_or_default(),
                enabled: row.get::<_, bool>(5).unwrap_or(true),
                last_run: row.get::<_, Option<String>>(6).ok().flatten(),
                next_run: row.get::<_, Option<String>>(7).ok().flatten(),
                created_at: row.get::<_, String>(8).unwrap_or_default(),
            })
        }).map_err(|e| e.to_string())?;

        Ok(tasks.filter_map(|r| r.ok()).collect())
    }

    pub fn get_all_enabled_tasks(&self) -> Result<Vec<crate::models::SchedulerTask>, String> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, server_id, task_name, task_type, cron_expression, enabled, last_run, next_run, created_at
             FROM scheduler_tasks WHERE enabled = 1"
        ).map_err(|e| e.to_string())?;

        let tasks = stmt.query_map([], |row| {
            Ok(crate::models::SchedulerTask {
                id: row.get(0)?,
                server_id: row.get(1)?,
                task_name: row.get::<_, String>(2).unwrap_or_default(),
                task_type: row.get::<_, String>(3).unwrap_or_default(),
                cron_expression: row.get::<_, String>(4).unwrap_or_default(),
                enabled: row.get::<_, bool>(5).unwrap_or(true),
                last_run: row.get::<_, Option<String>>(6).ok().flatten(),
                next_run: row.get::<_, Option<String>>(7).ok().flatten(),
                created_at: row.get::<_, String>(8).unwrap_or_default(),
            })
        }).map_err(|e| e.to_string())?;

        Ok(tasks.filter_map(|r| r.ok()).collect())
    }


    pub fn create_task(&self, server_id: i64, task_name: &str, task_type: &str, cron_expression: &str) -> Result<i64, String> {
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO scheduler_tasks (server_id, task_name, task_type, cron_expression)
             VALUES (?1, ?2, ?3, ?4)",
            params![server_id, task_name, task_type, cron_expression],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_task(&self, task_id: i64, task_name: &str, task_type: &str, cron_expression: &str) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE scheduler_tasks SET task_name = ?1, task_type = ?2, cron_expression = ?3, next_run = NULL WHERE id = ?4",
            params![task_name, task_type, cron_expression, task_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_task(&self, task_id: i64) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute("DELETE FROM scheduler_tasks WHERE id = ?1", params![task_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn toggle_task(&self, task_id: i64, enabled: bool) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE scheduler_tasks SET enabled = ?1 WHERE id = ?2",
            params![enabled, task_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ─── Installation CRUD ──────────────────────────────────────────────────

    pub fn add_install_history(
        &self,
        server_id: i64,
        version: &str,
        branch: &str,
        status: &str,
        downloaded_size: u64,
        duration_seconds: u32,
        average_speed: f64,
        peak_speed: f64,
        validation_result: &str,
        notes: &str,
    ) -> Result<i64, String> {
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO installation_history (
                server_id, version, branch, status, downloaded_size, 
                duration_seconds, average_speed_bps, peak_speed_bps, 
                validation_result, notes, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))",
            params![
                server_id,
                version,
                branch,
                status,
                downloaded_size as i64,
                duration_seconds,
                average_speed,
                peak_speed,
                validation_result,
                notes
            ],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_install_history(&self, server_id: i64) -> Result<Vec<crate::models::InstallationHistoryEntry>, String> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, server_id, version, branch, status, downloaded_size, 
                    duration_seconds, average_speed_bps, peak_speed_bps, 
                    validation_result, notes, created_at
             FROM installation_history WHERE server_id = ?1 ORDER BY created_at DESC"
        ).map_err(|e| e.to_string())?;

        let history = stmt.query_map([server_id], |row| {
            Ok(crate::models::InstallationHistoryEntry {
                id: row.get(0)?,
                server_id: row.get(1)?,
                version: row.get::<_, String>(2).unwrap_or_default(),
                branch: row.get::<_, String>(3).unwrap_or_else(|_| "public".to_string()),
                status: row.get::<_, String>(4).unwrap_or_else(|_| "completed".to_string()),
                downloaded_size: row.get::<_, i64>(5).unwrap_or(0) as u64,
                duration_seconds: row.get::<_, u32>(6).unwrap_or(0),
                average_speed_bps: row.get::<_, f64>(7).unwrap_or(0.0),
                peak_speed_bps: row.get::<_, f64>(8).unwrap_or(0.0),
                validation_result: row.get::<_, String>(9).unwrap_or_else(|_| "passed".to_string()),
                notes: row.get::<_, String>(10).unwrap_or_default(),
                created_at: row.get::<_, String>(11).unwrap_or_default(),
            })
        }).map_err(|e| e.to_string())?;

        Ok(history.filter_map(|r| r.ok()).collect())
    }

    pub fn save_install_recovery(
        &self,
        server_id: i64,
        is_installing: bool,
        stage: &str,
        progress: f32,
        status: &str,
        bytes_downloaded: u64,
        bytes_total: u64,
        logs: &str,
    ) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT OR REPLACE INTO installation_recovery (
                server_id, is_installing, stage, progress, status, 
                bytes_downloaded, bytes_total, logs, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            params![
                server_id,
                is_installing as i32,
                stage,
                progress,
                status,
                bytes_downloaded as i64,
                bytes_total as i64,
                logs
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_install_recovery(&self, server_id: i64) -> Result<Option<crate::models::InstallationRecoveryState>, String> {
        let conn = self.get_connection()?;
        match conn.query_row(
            "SELECT server_id, is_installing, stage, progress, status, 
                    bytes_downloaded, bytes_total, logs, updated_at
             FROM installation_recovery WHERE server_id = ?1",
            [server_id],
            |row| {
                Ok(crate::models::InstallationRecoveryState {
                    server_id: row.get(0)?,
                    is_installing: row.get::<_, i32>(1)? != 0,
                    stage: row.get(2)?,
                    progress: row.get(3)?,
                    status: row.get(4)?,
                    bytes_downloaded: row.get::<_, i64>(5)? as u64,
                    bytes_total: row.get::<_, i64>(6)? as u64,
                    logs: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        ) {
            Ok(state) => Ok(Some(state)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn clear_install_recovery(&self, server_id: i64) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute(
            "DELETE FROM installation_recovery WHERE server_id = ?1",
            params![server_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
}
