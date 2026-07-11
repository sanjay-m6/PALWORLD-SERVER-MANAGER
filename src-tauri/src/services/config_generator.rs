/// Config Generator for Palworld Servers
///
/// Generates PalWorldSettings.ini files from presets and user-specified configurations.
/// Supports Casual, Balanced, PvP, Hardcore, and Performance-Optimized presets.

use crate::models::PalworldConfig;
use std::path::PathBuf;

pub struct ConfigGenerator;

impl ConfigGenerator {
    /// Get the PalWorldSettings.ini path relative to a server install directory
    pub fn get_settings_path(install_path: &str) -> PathBuf {
        PathBuf::from(install_path)
            .join("Pal")
            .join("Saved")
            .join("Config")
            .join("WindowsServer")
            .join("PalWorldSettings.ini")
    }

    /// Generate a config from a named preset
    pub fn from_preset(preset: &str) -> PalworldConfig {
        match preset.to_lowercase().as_str() {
            "casual" => Self::preset_casual(),
            "pvp" => Self::preset_pvp(),
            "hardcore" => Self::preset_hardcore(),
            "performance" => Self::preset_performance(),
            _ => Self::preset_balanced(),
        }
    }

    fn preset_balanced() -> PalworldConfig {
        PalworldConfig::default()
    }

    fn preset_casual() -> PalworldConfig {
        PalworldConfig {
            exp_rate: 2.0,
            pal_capture_rate: 1.5,
            player_damage_rate_attack: 1.5,
            player_damage_rate_defense: 0.5,
            player_stomach_decrease_rate: 0.5,
            player_stamina_decrease_rate: 0.5,
            player_auto_hp_regen_rate: 2.0,
            pal_auto_hp_regen_rate: 2.0,
            death_penalty: "None".to_string(),
            collection_drop_rate: 2.0,
            enemy_drop_item_rate: 2.0,
            pal_egg_default_hatching_time: 10.0,
            work_speed_rate: 2.0,
            enable_fast_travel: true,
            enable_invader_enemy: false,
            base_camp_worker_max_num: 20,
            ..PalworldConfig::default()
        }
    }

    fn preset_pvp() -> PalworldConfig {
        PalworldConfig {
            is_pvp: true,
            enable_player_to_player_damage: true,
            enable_friendly_fire: false,
            can_pickup_other_guild_death_penalty_drop: true,
            death_penalty: "ItemAndEquipment".to_string(),
            player_damage_rate_attack: 1.0,
            player_damage_rate_defense: 1.0,
            enable_invader_enemy: true,
            ..PalworldConfig::default()
        }
    }

    fn preset_hardcore() -> PalworldConfig {
        PalworldConfig {
            exp_rate: 0.5,
            pal_capture_rate: 0.7,
            player_damage_rate_defense: 2.0,
            player_stomach_decrease_rate: 2.0,
            player_stamina_decrease_rate: 1.5,
            player_auto_hp_regen_rate: 0.5,
            death_penalty: "All".to_string(),
            collection_drop_rate: 0.7,
            enemy_drop_item_rate: 0.5,
            pal_egg_default_hatching_time: 120.0,
            work_speed_rate: 0.7,
            enable_non_login_penalty: true,
            enable_invader_enemy: true,
            is_pvp: true,
            enable_player_to_player_damage: true,
            can_pickup_other_guild_death_penalty_drop: true,
            ..PalworldConfig::default()
        }
    }

    fn preset_performance() -> PalworldConfig {
        PalworldConfig {
            pal_spawn_num_rate: 0.7,
            drop_item_max_num: 1500,
            base_camp_max_num: 64,
            base_camp_worker_max_num: 10,
            drop_item_alive_max_hours: 0.5,
            server_player_max_num: 16,
            ..PalworldConfig::default()
        }
    }

    /// Write the complete PalWorldSettings.ini to disk
    pub fn write_config(install_path: &str, config: &PalworldConfig) -> Result<(), String> {
        let settings_path = Self::get_settings_path(install_path);
        let mut settings_map = if settings_path.exists() {
            crate::services::ini_parser::read_settings_file(&settings_path).unwrap_or_default()
        } else {
            std::collections::HashMap::new()
        };

        let new_map = crate::services::ini_parser::config_to_map(config);
        for (k, v) in new_map {
            settings_map.insert(k, v);
        }

        crate::services::ini_parser::write_settings_file(&settings_path, &settings_map)
    }

    /// Read the current config from disk
    pub fn read_config(install_path: &str) -> Result<std::collections::HashMap<String, String>, String> {
        let settings_path = Self::get_settings_path(install_path);
        if !settings_path.exists() {
            return Err(format!("Settings file not found at: {}", settings_path.display()));
        }
        crate::services::ini_parser::read_settings_file(&settings_path)
    }
}
