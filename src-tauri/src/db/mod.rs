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
                    created_at, last_started, config_json, branch
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
            })
        }).map_err(|e| e.to_string())?;

        Ok(servers.filter_map(|r| r.ok()).collect())
    }

    pub fn create_server(&self, req: &crate::models::CreateServerRequest, config_json: &str) -> Result<i64, String> {
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO servers (name, description, install_path, preset, game_port, rcon_port,
                                  rest_api_port, max_players, admin_password, server_password,
                                  is_public, auto_start, config_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
}
