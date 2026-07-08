use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ─── Server Status ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Stopped,
    Starting,
    Running,
    Online,
    Stopping,
    Crashed,
    Updating,
    Restarting,
}

impl std::fmt::Display for ServerStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ServerStatus::Stopped => write!(f, "stopped"),
            ServerStatus::Starting => write!(f, "starting"),
            ServerStatus::Running => write!(f, "running"),
            ServerStatus::Online => write!(f, "online"),
            ServerStatus::Stopping => write!(f, "stopping"),
            ServerStatus::Crashed => write!(f, "crashed"),
            ServerStatus::Updating => write!(f, "updating"),
            ServerStatus::Restarting => write!(f, "restarting"),
        }
    }
}

// ─── Server Instance ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub install_path: PathBuf,
    pub save_path: String,
    pub status: ServerStatus,
    pub ports: ServerPorts,
    pub rcon_config: RconConfig,
    pub rest_api_config: RestApiConfig,
    pub max_players: u32,
    pub admin_password: String,
    pub server_password: Option<String>,
    pub is_public: bool,
    pub preset: String,
    pub startup_args: Option<String>,
    pub crossplay_platforms: String,
    pub auto_start: bool,
    pub auto_restart_schedule: Option<String>,
    pub created_at: String,
    pub last_started: Option<String>,
    pub config_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPorts {
    pub game_port: u16,
    pub rcon_port: u16,
    pub rest_api_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RconConfig {
    pub enabled: bool,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestApiConfig {
    pub enabled: bool,
    pub port: u16,
}

// ─── Palworld Configuration (PalWorldSettings.ini) ──────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PalworldConfig {
    // Difficulty & Gameplay
    pub difficulty: String,
    pub day_time_speed_rate: f32,
    pub night_time_speed_rate: f32,
    pub exp_rate: f32,
    pub pal_capture_rate: f32,
    pub pal_spawn_num_rate: f32,
    pub pal_damage_rate_attack: f32,
    pub pal_damage_rate_defense: f32,
    pub player_damage_rate_attack: f32,
    pub player_damage_rate_defense: f32,
    pub player_stomach_decrease_rate: f32,
    pub player_stamina_decrease_rate: f32,
    pub player_auto_hp_regen_rate: f32,
    pub player_auto_hp_regen_rate_in_sleep: f32,
    pub pal_stomach_decrease_rate: f32,
    pub pal_stamina_decrease_rate: f32,
    pub pal_auto_hp_regen_rate: f32,
    pub pal_auto_hp_regen_rate_in_sleep: f32,

    // Death Penalty
    pub death_penalty: String, // None, Item, ItemAndEquipment, All

    // Building & Base
    pub build_object_damage_rate: f32,
    pub build_object_deterioration_damage_rate: f32,
    pub collection_drop_rate: f32,
    pub collection_object_hp_rate: f32,
    pub collection_object_respawn_speed_rate: f32,
    pub enemy_drop_item_rate: f32,

    // World
    pub pal_egg_default_hatching_time: f32,
    pub work_speed_rate: f32,
    pub is_multiplay: bool,
    pub is_pvp: bool,
    pub can_pickup_other_guild_death_penalty_drop: bool,
    pub enable_non_login_penalty: bool,
    pub enable_fast_travel: bool,
    pub enable_player_to_player_damage: bool,
    pub enable_friendly_fire: bool,
    pub enable_invader_enemy: bool,

    // Base Camp
    pub base_camp_max_num: u32,
    pub base_camp_max_num_in_guild: u32,
    pub base_camp_worker_max_num: u32,
    pub drop_item_max_num: u32,
    pub drop_item_max_num_unko: u32,
    pub drop_item_alive_max_hours: f32,
    pub auto_reset_guild_no_online_players: bool,
    pub auto_reset_guild_time_no_online_players: f32,

    // Server
    pub server_player_max_num: u32,
    pub server_name: String,
    pub server_description: String,
    pub admin_password: String,
    pub server_password: String,
    pub public_port: u16,
    pub public_ip: String,
    pub rcon_enabled: bool,
    pub rcon_port: u16,
    pub region: String,
    pub useauth: bool,
    pub ban_list_url: String,

    // REST API
    pub rest_api_enabled: bool,
    pub rest_api_port: u16,

    // Performance
    pub coop_player_max_num: u32,
    pub guild_player_max_num: u32,

    // Raid
    pub enable_aim_assist_pad: bool,
    pub enable_aim_assist_keyboard: bool,

    // Supply Drop
    pub supply_drop_span: u32,
}

impl Default for PalworldConfig {
    fn default() -> Self {
        Self {
            difficulty: "None".to_string(),
            day_time_speed_rate: 1.0,
            night_time_speed_rate: 1.0,
            exp_rate: 1.0,
            pal_capture_rate: 1.0,
            pal_spawn_num_rate: 1.0,
            pal_damage_rate_attack: 1.0,
            pal_damage_rate_defense: 1.0,
            player_damage_rate_attack: 1.0,
            player_damage_rate_defense: 1.0,
            player_stomach_decrease_rate: 1.0,
            player_stamina_decrease_rate: 1.0,
            player_auto_hp_regen_rate: 1.0,
            player_auto_hp_regen_rate_in_sleep: 1.0,
            pal_stomach_decrease_rate: 1.0,
            pal_stamina_decrease_rate: 1.0,
            pal_auto_hp_regen_rate: 1.0,
            pal_auto_hp_regen_rate_in_sleep: 1.0,
            death_penalty: "All".to_string(),
            build_object_damage_rate: 1.0,
            build_object_deterioration_damage_rate: 1.0,
            collection_drop_rate: 1.0,
            collection_object_hp_rate: 1.0,
            collection_object_respawn_speed_rate: 1.0,
            enemy_drop_item_rate: 1.0,
            pal_egg_default_hatching_time: 72.0,
            work_speed_rate: 1.0,
            is_multiplay: false,
            is_pvp: false,
            can_pickup_other_guild_death_penalty_drop: false,
            enable_non_login_penalty: true,
            enable_fast_travel: true,
            enable_player_to_player_damage: false,
            enable_friendly_fire: false,
            enable_invader_enemy: true,
            base_camp_max_num: 128,
            base_camp_max_num_in_guild: 4,
            base_camp_worker_max_num: 15,
            drop_item_max_num: 3000,
            drop_item_max_num_unko: 100,
            drop_item_alive_max_hours: 1.0,
            auto_reset_guild_no_online_players: false,
            auto_reset_guild_time_no_online_players: 72.0,
            server_player_max_num: 32,
            server_name: "Palworld Dedicated Server".to_string(),
            server_description: String::new(),
            admin_password: String::new(),
            server_password: String::new(),
            public_port: 8211,
            public_ip: String::new(),
            rcon_enabled: true,
            rcon_port: 25575,
            region: String::new(),
            useauth: true,
            ban_list_url: "https://api.palworldgame.com/api/banlist.txt".to_string(),
            rest_api_enabled: true,
            rest_api_port: 8212,
            coop_player_max_num: 4,
            guild_player_max_num: 20,
            enable_aim_assist_pad: true,
            enable_aim_assist_keyboard: false,
            supply_drop_span: 180,
        }
    }
}

// ─── Player ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub name: String,
    pub player_uid: String,
    pub steam_id: String,
    pub join_time: Option<String>,
    pub ping_ms: Option<u32>,
    pub is_admin: bool,
}

// ─── RCON Response ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RconResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<String>,
}

// ─── Backup ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub id: i64,
    pub server_id: i64,
    pub backup_type: String,
    pub file_path: PathBuf,
    pub size: i64,
    pub includes_configs: bool,
    pub includes_saves: bool,
    pub verified: bool,
    pub created_at: String,
    pub label: Option<String>,
    pub notes: Option<String>,
    pub is_protected: bool,
    pub status: String,
    pub hash: Option<String>,
}

// ─── Log Line ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub source: Option<String>,
}

// ─── Scheduler Task ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerTask {
    pub id: i64,
    pub server_id: i64,
    pub task_name: String,
    pub task_type: String,
    pub cron_expression: String,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub created_at: String,
}

// ─── System Info ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub cpu_name: String,
    pub cpu_cores: u32,
    pub cpu_usage: f32,
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub available_memory_mb: u64,
    pub os_name: String,
    pub os_version: String,
}

// ─── Server Process Stats ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStats {
    pub pid: u32,
    pub cpu_usage: f32,
    pub memory_mb: u64,
    pub uptime_seconds: u64,
    pub thread_count: u32,
}

// ─── Mod Info ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModInfo {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub downloads: Option<i64>,
    pub source_url: Option<String>,
    pub enabled: bool,
    pub load_order: i32,
    pub last_updated: Option<String>,
}

// ─── Config Preset ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub config: PalworldConfig,
}

// ─── Create Server Request ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateServerRequest {
    pub name: String,
    pub description: Option<String>,
    pub install_path: String,
    pub preset: String,
    pub game_port: u16,
    pub rcon_port: u16,
    pub rest_api_port: u16,
    pub max_players: u32,
    pub admin_password: String,
    pub server_password: Option<String>,
    pub is_public: bool,
    pub auto_start: bool,
}
