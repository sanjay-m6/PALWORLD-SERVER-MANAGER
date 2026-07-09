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
    pub branch: String,
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

impl PalworldConfig {
    pub fn update_from_map(&mut self, map: &std::collections::HashMap<String, String>) {
        let parse_bool = |s: &str| -> bool {
            let lowered = s.to_lowercase();
            lowered == "true" || lowered == "1"
        };

        // Gameplay
        if let Some(v) = map.get("Difficulty") { self.difficulty = v.clone(); }
        if let Some(v) = map.get("DayTimeSpeedRate") { if let Ok(val) = v.parse() { self.day_time_speed_rate = val; } }
        if let Some(v) = map.get("NightTimeSpeedRate") { if let Ok(val) = v.parse() { self.night_time_speed_rate = val; } }
        if let Some(v) = map.get("ExpRate") { if let Ok(val) = v.parse() { self.exp_rate = val; } }
        if let Some(v) = map.get("PalCaptureRate") { if let Ok(val) = v.parse() { self.pal_capture_rate = val; } }
        if let Some(v) = map.get("PalSpawnNumRate") { if let Ok(val) = v.parse() { self.pal_spawn_num_rate = val; } }
        if let Some(v) = map.get("PalDamageRateAttack") { if let Ok(val) = v.parse() { self.pal_damage_rate_attack = val; } }
        if let Some(v) = map.get("PalDamageRateDefense") { if let Ok(val) = v.parse() { self.pal_damage_rate_defense = val; } }
        if let Some(v) = map.get("PlayerDamageRateAttack") { if let Ok(val) = v.parse() { self.player_damage_rate_attack = val; } }
        if let Some(v) = map.get("PlayerDamageRateDefense") { if let Ok(val) = v.parse() { self.player_damage_rate_defense = val; } }
        if let Some(v) = map.get("PlayerStomachDecreaseRate") { if let Ok(val) = v.parse() { self.player_stomach_decrease_rate = val; } }
        if let Some(v) = map.get("PlayerStaminaDecreaseRate") { if let Ok(val) = v.parse() { self.player_stamina_decrease_rate = val; } }
        if let Some(v) = map.get("PlayerAutoHPRegeneRate") { if let Ok(val) = v.parse() { self.player_auto_hp_regen_rate = val; } }
        if let Some(v) = map.get("PlayerAutoHpRegeneRateInSleep") { if let Ok(val) = v.parse() { self.player_auto_hp_regen_rate_in_sleep = val; } }
        if let Some(v) = map.get("PalStomachDecreaseRate") { if let Ok(val) = v.parse() { self.pal_stomach_decrease_rate = val; } }
        if let Some(v) = map.get("PalStaminaDecreaseRate") { if let Ok(val) = v.parse() { self.pal_stamina_decrease_rate = val; } }
        if let Some(v) = map.get("PalAutoHPRegeneRate") { if let Ok(val) = v.parse() { self.pal_auto_hp_regen_rate = val; } }
        if let Some(v) = map.get("PalAutoHpRegeneRateInSleep") { if let Ok(val) = v.parse() { self.pal_auto_hp_regen_rate_in_sleep = val; } }
        if let Some(v) = map.get("DeathPenalty") { self.death_penalty = v.clone(); }
        if let Some(v) = map.get("BuildObjectDamageRate") { if let Ok(val) = v.parse() { self.build_object_damage_rate = val; } }
        if let Some(v) = map.get("BuildObjectDeteriorationDamageRate") { if let Ok(val) = v.parse() { self.build_object_deterioration_damage_rate = val; } }
        if let Some(v) = map.get("CollectionDropRate") { if let Ok(val) = v.parse() { self.collection_drop_rate = val; } }
        if let Some(v) = map.get("CollectionObjectHpRate") { if let Ok(val) = v.parse() { self.collection_object_hp_rate = val; } }
        if let Some(v) = map.get("CollectionObjectRespawnSpeedRate") { if let Ok(val) = v.parse() { self.collection_object_respawn_speed_rate = val; } }
        if let Some(v) = map.get("EnemyDropItemRate") { if let Ok(val) = v.parse() { self.enemy_drop_item_rate = val; } }
        if let Some(v) = map.get("PalEggDefaultHatchingTime") { if let Ok(val) = v.parse() { self.pal_egg_default_hatching_time = val; } }
        if let Some(v) = map.get("WorkSpeedRate") { if let Ok(val) = v.parse() { self.work_speed_rate = val; } }
        if let Some(v) = map.get("bIsMultiplay") { self.is_multiplay = parse_bool(v); }
        if let Some(v) = map.get("bIsPvP") { self.is_pvp = parse_bool(v); }
        if let Some(v) = map.get("bCanPickupOtherGuildDeathPenaltyDrop") { self.can_pickup_other_guild_death_penalty_drop = parse_bool(v); }
        if let Some(v) = map.get("bEnableNonLoginPenalty") { self.enable_non_login_penalty = parse_bool(v); }
        if let Some(v) = map.get("bEnableFastTravel") { self.enable_fast_travel = parse_bool(v); }
        if let Some(v) = map.get("bEnablePlayerToPlayerDamage") { self.enable_player_to_player_damage = parse_bool(v); }
        if let Some(v) = map.get("bEnableFriendlyFire") { self.enable_friendly_fire = parse_bool(v); }
        if let Some(v) = map.get("bEnableInvaderEnemy") { self.enable_invader_enemy = parse_bool(v); }
        if let Some(v) = map.get("BaseCampMaxNum") { if let Ok(val) = v.parse() { self.base_camp_max_num = val; } }
        if let Some(v) = map.get("BaseCampMaxNumInGuild") { if let Ok(val) = v.parse() { self.base_camp_max_num_in_guild = val; } }
        if let Some(v) = map.get("BaseCampWorkerMaxNum") { if let Ok(val) = v.parse() { self.base_camp_worker_max_num = val; } }
        if let Some(v) = map.get("DropItemMaxNum") { if let Ok(val) = v.parse() { self.drop_item_max_num = val; } }
        if let Some(v) = map.get("DropItemMaxNum_UNKO") { if let Ok(val) = v.parse() { self.drop_item_max_num_unko = val; } }
        if let Some(v) = map.get("DropItemAliveMaxHours") { if let Ok(val) = v.parse() { self.drop_item_alive_max_hours = val; } }
        if let Some(v) = map.get("bAutoResetGuildNoOnlinePlayers") { self.auto_reset_guild_no_online_players = parse_bool(v); }
        if let Some(v) = map.get("AutoResetGuildTimeNoOnlinePlayers") { if let Ok(val) = v.parse() { self.auto_reset_guild_time_no_online_players = val; } }
        if let Some(v) = map.get("ServerPlayerMaxNum") { if let Ok(val) = v.parse() { self.server_player_max_num = val; } }
        if let Some(v) = map.get("ServerName") { self.server_name = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("ServerDescription") { self.server_description = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("AdminPassword") { self.admin_password = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("ServerPassword") { self.server_password = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("PublicPort") { if let Ok(val) = v.parse() { self.public_port = val; } }
        if let Some(v) = map.get("PublicIP") { self.public_ip = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("RCONEnabled") { self.rcon_enabled = parse_bool(v); }
        if let Some(v) = map.get("RCONPort") { if let Ok(val) = v.parse() { self.rcon_port = val; } }
        if let Some(v) = map.get("Region") { self.region = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("bUseAuth") { self.useauth = parse_bool(v); }
        if let Some(v) = map.get("BanListURL") { self.ban_list_url = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("RESTAPIEnabled") { self.rest_api_enabled = parse_bool(v); }
        if let Some(v) = map.get("RESTAPIPort") { if let Ok(val) = v.parse() { self.rest_api_port = val; } }
        if let Some(v) = map.get("CoopPlayerMaxNum") { if let Ok(val) = v.parse() { self.coop_player_max_num = val; } }
        if let Some(v) = map.get("GuildPlayerMaxNum") { if let Ok(val) = v.parse() { self.guild_player_max_num = val; } }
        if let Some(v) = map.get("bEnableAimAssistPad") { self.enable_aim_assist_pad = parse_bool(v); }
        if let Some(v) = map.get("bEnableAimAssistKeyboard") { self.enable_aim_assist_keyboard = parse_bool(v); }
        if let Some(v) = map.get("SupplyDropSpan") { if let Ok(val) = v.parse() { self.supply_drop_span = val; } }
    }
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

// ─── Extended Server Details ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtendedServerDetails {
    pub server_id: i64,
    pub is_installed: bool,
    pub build_id: String,
    pub branch: String,
    pub install_size_bytes: u64,
    pub save_size_bytes: u64,
    pub mod_count: u32,
    pub rcon_status: String,      // "connected" | "disconnected" | "disabled"
    pub rest_api_status: String,  // "active" | "disabled"
    pub disk_free_bytes: u64,
    pub disk_total_bytes: u64,
}
