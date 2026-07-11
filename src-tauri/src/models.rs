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
    pub host: String,
    pub is_remote: bool,
    pub auto_restart: bool,
    pub run_as_admin: bool,
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

fn default_true() -> bool {
    true
}
fn default_float_one() -> f32 { 1.0 }
fn default_float_thirty() -> f32 { 30.0 }
fn default_float_3600() -> f32 { 3600.0 }
fn default_float_five() -> f32 { 5.0 }
fn default_float_two() -> f32 { 2.0 }
fn default_float_3000() -> f32 { 3000.0 }
fn default_float_15000() -> f32 { 15000.0 }
fn default_physics_drop_max() -> i32 { -1 }
fn default_chat_limit() -> u32 { 30 }
fn default_crossplay() -> String { "(Steam,Xbox,PS5,Mac)".to_string() }
fn default_log_format() -> String { "Text".to_string() }
fn default_randomizer_type() -> String { "None".to_string() }
fn default_auto_transfer_days() -> u32 { 14 }
fn default_max_guilds_frame() -> u32 { 10 }
fn default_additional_drop_item() -> String { "PlayerDropItem".to_string() }
fn default_u32_one() -> u32 { 1 }
fn default_building_cache_ttl() -> u32 { 60 }


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
    #[serde(default = "default_true")]
    pub allow_global_palbox_export: bool,
    #[serde(default = "default_true")]
    pub allow_global_palbox_import: bool,

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

    // New 1.0.0 Settings
    #[serde(default = "default_randomizer_type")]
    pub randomizer_type: String,
    #[serde(default)]
    pub randomizer_seed: String,
    #[serde(default)]
    pub is_randomizer_pal_level_random: bool,
    #[serde(default = "default_float_one")]
    pub build_object_hp_rate: f32,
    #[serde(default)]
    pub active_unko: bool,
    #[serde(default = "default_physics_drop_max")]
    pub physics_active_drop_item_max_num: i32,
    #[serde(default = "default_float_thirty")]
    pub auto_save_span: f32,
    #[serde(default)]
    pub hardcore: bool,
    #[serde(default)]
    pub pal_lost: bool,
    #[serde(default)]
    pub character_recreate_in_hardcore: bool,
    #[serde(default)]
    pub enable_fast_travel_only_base_camp: bool,
    #[serde(default)]
    pub is_start_location_select_by_map: bool,
    #[serde(default)]
    pub exist_player_after_logout: bool,
    #[serde(default)]
    pub enable_defense_other_guild_player: bool,
    #[serde(default)]
    pub invisible_other_guild_base_camp_area_fx: bool,
    #[serde(default)]
    pub build_area_limit: bool,
    #[serde(default = "default_float_one")]
    pub item_weight_rate: f32,
    #[serde(default = "default_true")]
    pub allow_client_mod: bool,
    #[serde(default)]
    pub show_player_list: bool,
    #[serde(default = "default_chat_limit")]
    pub chat_post_limit_per_minute: u32,
    #[serde(default = "default_crossplay")]
    pub crossplay_platforms: String,
    #[serde(default = "default_true")]
    pub is_use_backup_save_data: bool,
    #[serde(default = "default_log_format")]
    pub log_format_type: String,
    #[serde(default = "default_true")]
    pub is_show_join_left_message: bool,
    #[serde(default = "default_true")]
    pub enable_predator_boss_pal: bool,
    #[serde(default)]
    pub max_building_limit_num: u32,
    #[serde(default = "default_float_15000")]
    pub server_replicate_pawn_cull_distance: f32,
    #[serde(default = "default_float_one")]
    pub equipment_durability_damage_rate: f32,
    #[serde(default = "default_float_one")]
    pub item_container_force_mark_dirty_interval: f32,
    #[serde(default = "default_float_one")]
    pub player_data_pal_storage_update_check_tick_interval: f32,
    #[serde(default = "default_float_one")]
    pub item_corruption_multiplier: f32,
    #[serde(default = "default_float_one")]
    pub monster_farm_action_speed_rate: f32,
    #[serde(default)]
    pub deny_technology_list: String,
    #[serde(default)]
    pub guild_rejoin_cooldown_minutes: u32,
    #[serde(default = "default_float_3600")]
    pub auto_transfer_master_check_interval_seconds: f32,
    #[serde(default = "default_auto_transfer_days")]
    pub auto_transfer_master_threshold_days: u32,
    #[serde(default = "default_max_guilds_frame")]
    pub max_guilds_per_frame: u32,
    #[serde(default = "default_float_five")]
    pub block_respawn_time: f32,
    #[serde(default)]
    pub respawn_penalty_duration_threshold: f32,
    #[serde(default = "default_float_two")]
    pub respawn_penalty_time_scale: f32,
    #[serde(default)]
    pub display_pvp_item_num_on_world_map_base_camp: bool,
    #[serde(default)]
    pub display_pvp_item_num_on_world_map_player: bool,
    #[serde(default = "default_additional_drop_item")]
    pub additional_drop_item_when_player_killing_in_pvp_mode: String,
    #[serde(default = "default_u32_one")]
    pub additional_drop_item_num_when_player_killing_in_pvp_mode: u32,
    #[serde(default)]
    pub b_additional_drop_item_when_player_killing_in_pvp_mode: bool,
    #[serde(default)]
    pub enable_voice_chat: bool,
    #[serde(default = "default_float_3000")]
    pub voice_chat_max_volume_distance: f32,
    #[serde(default = "default_float_15000")]
    pub voice_chat_zero_volume_distance: f32,
    #[serde(default = "default_true")]
    pub allow_enhance_stat_health: bool,
    #[serde(default = "default_true")]
    pub allow_enhance_stat_attack: bool,
    #[serde(default = "default_true")]
    pub allow_enhance_stat_stamina: bool,
    #[serde(default = "default_true")]
    pub allow_enhance_stat_weight: bool,
    #[serde(default = "default_true")]
    pub allow_enhance_stat_work_speed: bool,
    #[serde(default)]
    pub enable_building_player_uid_display: bool,
    #[serde(default = "default_building_cache_ttl")]
    pub building_name_display_cache_ttl_seconds: u32,
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
        if let Some(v) = map.get("PlayerStomachDecreaceRate").or_else(|| map.get("PlayerStomachDecreaseRate")) { if let Ok(val) = v.parse() { self.player_stomach_decrease_rate = val; } }
        if let Some(v) = map.get("PlayerStaminaDecreaceRate").or_else(|| map.get("PlayerStaminaDecreaseRate")) { if let Ok(val) = v.parse() { self.player_stamina_decrease_rate = val; } }
        if let Some(v) = map.get("PlayerAutoHPRegeneRate") { if let Ok(val) = v.parse() { self.player_auto_hp_regen_rate = val; } }
        if let Some(v) = map.get("PlayerAutoHpRegeneRateInSleep") { if let Ok(val) = v.parse() { self.player_auto_hp_regen_rate_in_sleep = val; } }
        if let Some(v) = map.get("PalStomachDecreaceRate").or_else(|| map.get("PalStomachDecreaseRate")) { if let Ok(val) = v.parse() { self.pal_stomach_decrease_rate = val; } }
        if let Some(v) = map.get("PalStaminaDecreaceRate").or_else(|| map.get("PalStaminaDecreaseRate")) { if let Ok(val) = v.parse() { self.pal_stamina_decrease_rate = val; } }
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
        if let Some(v) = map.get("bAllowGlobalPalboxExport") { self.allow_global_palbox_export = parse_bool(v); }
        if let Some(v) = map.get("bAllowGlobalPalboxImport") { self.allow_global_palbox_import = parse_bool(v); }
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
        if let Some(v) = map.get("AdminPassword") { self.admin_password = v.trim_matches('"').trim().to_string(); }
        if let Some(v) = map.get("ServerPassword") { self.server_password = v.trim_matches('"').trim().to_string(); }
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
        
        // New 1.0.0 Settings
        if let Some(v) = map.get("RandomizerType") { self.randomizer_type = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("RandomizerSeed") { self.randomizer_seed = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("bIsRandomizerPalLevelRandom") { self.is_randomizer_pal_level_random = parse_bool(v); }
        if let Some(v) = map.get("BuildObjectHpRate") { if let Ok(val) = v.parse() { self.build_object_hp_rate = val; } }
        if let Some(v) = map.get("bActiveUNKO") { self.active_unko = parse_bool(v); }
        if let Some(v) = map.get("PhysicsActiveDropItemMaxNum") { if let Ok(val) = v.parse() { self.physics_active_drop_item_max_num = val; } }
        if let Some(v) = map.get("AutoSaveSpan") { if let Ok(val) = v.parse() { self.auto_save_span = val; } }
        if let Some(v) = map.get("bHardcore") { self.hardcore = parse_bool(v); }
        if let Some(v) = map.get("bPalLost") { self.pal_lost = parse_bool(v); }
        if let Some(v) = map.get("bCharacterRecreateInHardcore") { self.character_recreate_in_hardcore = parse_bool(v); }
        if let Some(v) = map.get("bEnableFastTravelOnlyBaseCamp") { self.enable_fast_travel_only_base_camp = parse_bool(v); }
        if let Some(v) = map.get("bIsStartLocationSelectByMap") { self.is_start_location_select_by_map = parse_bool(v); }
        if let Some(v) = map.get("bExistPlayerAfterLogout") { self.exist_player_after_logout = parse_bool(v); }
        if let Some(v) = map.get("bEnableDefenseOtherGuildPlayer") { self.enable_defense_other_guild_player = parse_bool(v); }
        if let Some(v) = map.get("bInvisibleOtherGuildBaseCampAreaFX") { self.invisible_other_guild_base_camp_area_fx = parse_bool(v); }
        if let Some(v) = map.get("bBuildAreaLimit") { self.build_area_limit = parse_bool(v); }
        if let Some(v) = map.get("ItemWeightRate") { if let Ok(val) = v.parse() { self.item_weight_rate = val; } }
        if let Some(v) = map.get("bAllowClientMod") { self.allow_client_mod = parse_bool(v); }
        if let Some(v) = map.get("bShowPlayerList") { self.show_player_list = parse_bool(v); }
        if let Some(v) = map.get("ChatPostLimitPerMinute") { if let Ok(val) = v.parse() { self.chat_post_limit_per_minute = val; } }
        if let Some(v) = map.get("CrossplayPlatforms") { self.crossplay_platforms = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("bIsUseBackupSaveData") { self.is_use_backup_save_data = parse_bool(v); }
        if let Some(v) = map.get("LogFormatType") { self.log_format_type = v.clone(); }
        if let Some(v) = map.get("bIsShowJoinLeftMessage") { self.is_show_join_left_message = parse_bool(v); }
        if let Some(v) = map.get("EnablePredatorBossPal") { self.enable_predator_boss_pal = parse_bool(v); }
        if let Some(v) = map.get("MaxBuildingLimitNum") { if let Ok(val) = v.parse() { self.max_building_limit_num = val; } }
        if let Some(v) = map.get("ServerReplicatePawnCullDistance") { if let Ok(val) = v.parse() { self.server_replicate_pawn_cull_distance = val; } }
        if let Some(v) = map.get("EquipmentDurabilityDamageRate") { if let Ok(val) = v.parse() { self.equipment_durability_damage_rate = val; } }
        if let Some(v) = map.get("ItemContainerForceMarkDirtyInterval") { if let Ok(val) = v.parse() { self.item_container_force_mark_dirty_interval = val; } }
        if let Some(v) = map.get("PlayerDataPalStorageUpdateCheckTickInterval") { if let Ok(val) = v.parse() { self.player_data_pal_storage_update_check_tick_interval = val; } }
        if let Some(v) = map.get("ItemCorruptionMultiplier") { if let Ok(val) = v.parse() { self.item_corruption_multiplier = val; } }
        if let Some(v) = map.get("MonsterFarmActionSpeedRate") { if let Ok(val) = v.parse() { self.monster_farm_action_speed_rate = val; } }
        if let Some(v) = map.get("DenyTechnologyList") { self.deny_technology_list = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("GuildRejoinCooldownMinutes") { if let Ok(val) = v.parse() { self.guild_rejoin_cooldown_minutes = val; } }
        if let Some(v) = map.get("AutoTransferMasterCheckIntervalSeconds") { if let Ok(val) = v.parse() { self.auto_transfer_master_check_interval_seconds = val; } }
        if let Some(v) = map.get("AutoTransferMasterThresholdDays") { if let Ok(val) = v.parse() { self.auto_transfer_master_threshold_days = val; } }
        if let Some(v) = map.get("MaxGuildsPerFrame") { if let Ok(val) = v.parse() { self.max_guilds_per_frame = val; } }
        if let Some(v) = map.get("BlockRespawnTime") { if let Ok(val) = v.parse() { self.block_respawn_time = val; } }
        if let Some(v) = map.get("RespawnPenaltyDurationThreshold") { if let Ok(val) = v.parse() { self.respawn_penalty_duration_threshold = val; } }
        if let Some(v) = map.get("RespawnPenaltyTimeScale") { if let Ok(val) = v.parse() { self.respawn_penalty_time_scale = val; } }
        if let Some(v) = map.get("bDisplayPvPItemNumOnWorldMap_BaseCamp") { self.display_pvp_item_num_on_world_map_base_camp = parse_bool(v); }
        if let Some(v) = map.get("bDisplayPvPItemNumOnWorldMap_Player") { self.display_pvp_item_num_on_world_map_player = parse_bool(v); }
        if let Some(v) = map.get("AdditionalDropItemWhenPlayerKillingInPvPMode") { self.additional_drop_item_when_player_killing_in_pvp_mode = v.trim_matches('"').to_string(); }
        if let Some(v) = map.get("AdditionalDropItemNumWhenPlayerKillingInPvPMode") { if let Ok(val) = v.parse() { self.additional_drop_item_num_when_player_killing_in_pvp_mode = val; } }
        if let Some(v) = map.get("bAdditionalDropItemWhenPlayerKillingInPvPMode") { self.b_additional_drop_item_when_player_killing_in_pvp_mode = parse_bool(v); }
        if let Some(v) = map.get("bEnableVoiceChat") { self.enable_voice_chat = parse_bool(v); }
        if let Some(v) = map.get("VoiceChatMaxVolumeDistance") { if let Ok(val) = v.parse() { self.voice_chat_max_volume_distance = val; } }
        if let Some(v) = map.get("VoiceChatZeroVolumeDistance") { if let Ok(val) = v.parse() { self.voice_chat_zero_volume_distance = val; } }
        if let Some(v) = map.get("bAllowEnhanceStat_Health") { self.allow_enhance_stat_health = parse_bool(v); }
        if let Some(v) = map.get("bAllowEnhanceStat_Attack") { self.allow_enhance_stat_attack = parse_bool(v); }
        if let Some(v) = map.get("bAllowEnhanceStat_Stamina") { self.allow_enhance_stat_stamina = parse_bool(v); }
        if let Some(v) = map.get("bAllowEnhanceStat_Weight") { self.allow_enhance_stat_weight = parse_bool(v); }
        if let Some(v) = map.get("bAllowEnhanceStat_WorkSpeed") { self.allow_enhance_stat_work_speed = parse_bool(v); }
        if let Some(v) = map.get("bEnableBuildingPlayerUIdDisplay") { self.enable_building_player_uid_display = parse_bool(v); }
        if let Some(v) = map.get("BuildingNameDisplayCacheTTLSeconds") { if let Ok(val) = v.parse() { self.building_name_display_cache_ttl_seconds = val; } }
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
            enable_non_login_penalty: false,
            enable_fast_travel: true,
            enable_player_to_player_damage: false,
            enable_friendly_fire: false,
            enable_invader_enemy: true,
            allow_global_palbox_export: true,
            allow_global_palbox_import: true,
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
            
            // New 1.0.0 Settings
            randomizer_type: "None".to_string(),
            randomizer_seed: String::new(),
            is_randomizer_pal_level_random: false,
            build_object_hp_rate: 1.0,
            active_unko: false,
            physics_active_drop_item_max_num: -1,
            auto_save_span: 30.0,
            hardcore: false,
            pal_lost: false,
            character_recreate_in_hardcore: false,
            enable_fast_travel_only_base_camp: false,
            is_start_location_select_by_map: false,
            exist_player_after_logout: false,
            enable_defense_other_guild_player: false,
            invisible_other_guild_base_camp_area_fx: false,
            build_area_limit: false,
            item_weight_rate: 1.0,
            allow_client_mod: true,
            show_player_list: false,
            chat_post_limit_per_minute: 30,
            crossplay_platforms: "(Steam,Xbox,PS5,Mac)".to_string(),
            is_use_backup_save_data: true,
            log_format_type: "Text".to_string(),
            is_show_join_left_message: true,
            enable_predator_boss_pal: true,
            max_building_limit_num: 0,
            server_replicate_pawn_cull_distance: 15000.0,
            equipment_durability_damage_rate: 1.0,
            item_container_force_mark_dirty_interval: 1.0,
            player_data_pal_storage_update_check_tick_interval: 1.0,
            item_corruption_multiplier: 1.0,
            monster_farm_action_speed_rate: 1.0,
            deny_technology_list: String::new(),
            guild_rejoin_cooldown_minutes: 0,
            auto_transfer_master_check_interval_seconds: 3600.0,
            auto_transfer_master_threshold_days: 14,
            max_guilds_per_frame: 10,
            block_respawn_time: 5.0,
            respawn_penalty_duration_threshold: 0.0,
            respawn_penalty_time_scale: 2.0,
            display_pvp_item_num_on_world_map_base_camp: false,
            display_pvp_item_num_on_world_map_player: false,
            additional_drop_item_when_player_killing_in_pvp_mode: "PlayerDropItem".to_string(),
            additional_drop_item_num_when_player_killing_in_pvp_mode: 1,
            b_additional_drop_item_when_player_killing_in_pvp_mode: false,
            enable_voice_chat: false,
            voice_chat_max_volume_distance: 3000.0,
            voice_chat_zero_volume_distance: 15000.0,
            allow_enhance_stat_health: true,
            allow_enhance_stat_attack: true,
            allow_enhance_stat_stamina: true,
            allow_enhance_stat_weight: true,
            allow_enhance_stat_work_speed: true,
            enable_building_player_uid_display: false,
            building_name_display_cache_ttl_seconds: 60,
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
    pub host: Option<String>,
    pub is_remote: Option<bool>,
    pub is_import: Option<bool>,
    pub auto_restart: Option<bool>,
    pub run_as_admin: Option<bool>,
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

// ─── Installation History ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationHistoryEntry {
    pub id: i64,
    pub server_id: i64,
    pub version: String,
    pub branch: String,
    pub status: String,
    pub downloaded_size: u64,
    pub duration_seconds: u32,
    pub average_speed_bps: f64,
    pub peak_speed_bps: f64,
    pub validation_result: String,
    pub notes: String,
    pub created_at: String,
}

// ─── Installation Recovery ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationRecoveryState {
    pub server_id: i64,
    pub is_installing: bool,
    pub stage: String,
    pub progress: f32,
    pub status: String,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub logs: String,
    pub updated_at: String,
}
