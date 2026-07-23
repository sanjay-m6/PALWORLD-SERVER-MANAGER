-- Palworld Server Manager - Database Schema
-- SQLite database for managing server instances, configs, backups, and settings

-- ─── Servers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    install_path TEXT NOT NULL,
    save_path TEXT DEFAULT '',
    status TEXT DEFAULT 'stopped' CHECK(status IN ('stopped','starting','running','online','stopping','crashed','updating','restarting')),
    game_port INTEGER DEFAULT 8211,
    rcon_port INTEGER DEFAULT 25575,
    rcon_enabled INTEGER DEFAULT 1,
    rest_api_port INTEGER DEFAULT 8212,
    rest_api_enabled INTEGER DEFAULT 1,
    max_players INTEGER DEFAULT 32,
    admin_password TEXT DEFAULT '',
    server_password TEXT DEFAULT '',
    is_public INTEGER DEFAULT 0,
    preset TEXT DEFAULT 'Balanced',
    startup_args TEXT DEFAULT '',
    crossplay_platforms TEXT DEFAULT '[]',
    auto_start INTEGER DEFAULT 0,
    auto_restart_schedule TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    last_started TEXT,
    config_json TEXT DEFAULT '{}',
    branch TEXT DEFAULT 'public',
    host TEXT DEFAULT '127.0.0.1',
    is_remote INTEGER DEFAULT 0,
    auto_restart INTEGER DEFAULT 1,
    run_as_admin INTEGER DEFAULT 1,
    optimize_ram INTEGER DEFAULT 1,
    query_port INTEGER DEFAULT 27015
);

-- ─── Backups ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    backup_type TEXT DEFAULT 'manual' CHECK(backup_type IN ('manual','auto','pre_update','pre_delete')),
    file_path TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    includes_configs INTEGER DEFAULT 1,
    includes_saves INTEGER DEFAULT 1,
    verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    label TEXT,
    notes TEXT,
    is_protected INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed' CHECK(status IN ('completed','failed','in_progress')),
    hash TEXT,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- ─── Settings ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ─── Scheduler Tasks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduler_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    task_name TEXT DEFAULT '',
    task_type TEXT NOT NULL CHECK(task_type IN ('restart','backup','update','custom')),
    cron_expression TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_run TEXT,
    next_run TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- ─── Installed Mods ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installed_mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    mod_id TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT DEFAULT '',
    author TEXT DEFAULT '',
    description TEXT DEFAULT '',
    thumbnail_url TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1,
    load_order INTEGER DEFAULT 0,
    installed_at TEXT DEFAULT (datetime('now')),
    last_updated TEXT,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- ─── Ban List ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ban_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    steam_id TEXT NOT NULL,
    player_name TEXT DEFAULT '',
    reason TEXT DEFAULT '',
    banned_at TEXT DEFAULT (datetime('now')),
    banned_by TEXT DEFAULT 'admin',
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- ─── Server Logs (metadata only, actual logs on filesystem) ─────────────────
CREATE TABLE IF NOT EXISTS server_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    message TEXT DEFAULT '',
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- ─── Backup Schedules ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    cron_expression TEXT NOT NULL DEFAULT '0 */6 * * *',
    retention_count INTEGER DEFAULT 10,
    retention_days INTEGER DEFAULT 30,
    include_configs INTEGER DEFAULT 1,
    include_saves INTEGER DEFAULT 1,
    enabled INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- ─── Default Settings ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark');
INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'en');
INSERT OR IGNORE INTO settings (key, value) VALUES ('start_minimized_to_tray', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_check_updates', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('steamcmd_path', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_install_dir', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('notification_sound', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('nexus_api_key', '');

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_backups_server_id ON backups(server_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_tasks_server_id ON scheduler_tasks(server_id);
CREATE INDEX IF NOT EXISTS idx_installed_mods_server_id ON installed_mods(server_id);
CREATE INDEX IF NOT EXISTS idx_ban_list_server_id ON ban_list(server_id);
CREATE INDEX IF NOT EXISTS idx_server_events_server_id ON server_events(server_id);
CREATE INDEX IF NOT EXISTS idx_backup_schedules_server_id ON backup_schedules(server_id);

-- ─── Discord Remote Admin Config ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS server_discord_configs (
    server_id INTEGER PRIMARY KEY,
    enabled INTEGER DEFAULT 0,
    dashboard_channel_id TEXT DEFAULT '',
    dashboard_message_id TEXT DEFAULT '',
    console_channel_id TEXT DEFAULT '',
    chat_channel_id TEXT DEFAULT '',
    notifications_channel_id TEXT DEFAULT '',
    role_owner_id TEXT DEFAULT '',
    role_admin_id TEXT DEFAULT '',
    role_moderator_id TEXT DEFAULT '',
    role_developer_id TEXT DEFAULT '',
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_discord_configs_server_id ON server_discord_configs(server_id);

