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
            drop_item_max_num: 800,
            base_camp_max_num: 64,
            base_camp_worker_max_num: 10,
            drop_item_alive_max_hours: 0.5,
            server_player_max_num: 16,
            enable_invader_enemy: false,
            ..PalworldConfig::default()
        }
    }

    /// Write the complete PalWorldSettings.ini to disk
    pub fn write_config(install_path: &str, config: &PalworldConfig, optimize_ram: bool) -> Result<(), String> {
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

        crate::services::ini_parser::write_settings_file(&settings_path, &settings_map)?;

        // Automatically optimize Engine.ini as well
        let _ = Self::optimize_engine_ini(install_path, optimize_ram);

        Ok(())
    }

    /// Automatically configure garbage collection settings in Engine.ini to reduce memory leaks/usage
    pub fn optimize_engine_ini(install_path: &str, optimize: bool) -> Result<(), String> {
        let engine_ini_path = PathBuf::from(install_path)
            .join("Pal")
            .join("Saved")
            .join("Config")
            .join("WindowsServer")
            .join("Engine.ini");

        // If file doesn't exist and we want to disable optimizations, we don't need to do anything
        if !engine_ini_path.exists() && !optimize {
            return Ok(());
        }

        // Create parent directories if they don't exist
        if let Some(parent) = engine_ini_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let content = if engine_ini_path.exists() {
            std::fs::read_to_string(&engine_ini_path)
                .map_err(|e| format!("Failed to read Engine.ini: {}", e))?
        } else {
            String::new()
        };

        let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        let section_header = "[/Script/Engine.GarbageCollectionSettings]";
        
        let mut section_index = None;
        for (i, line) in lines.iter().enumerate() {
            if line.trim() == section_header {
                section_index = Some(i);
                break;
            }
        }

        if optimize {
            let gc_settings = vec![
                "gc.NumObjectsPerFrame=2000".to_string(),
                "gc.TimeBetweenPurgingPendingKillObjects=30".to_string(),
                "gc.MaxObjectsNotConsideredByGC=1".to_string(),
            ];

            if let Some(idx) = section_index {
                // Find where this section ends (either next section `[` or end of file)
                let mut end_idx = idx + 1;
                while end_idx < lines.len() {
                    let trimmed = lines[end_idx].trim();
                    if trimmed.starts_with('[') {
                        break;
                    }
                    end_idx += 1;
                }
                
                // Remove old settings in this section
                lines.drain(idx + 1..end_idx);
                
                // Insert new settings
                for (offset, setting) in gc_settings.iter().enumerate() {
                    lines.insert(idx + 1 + offset, setting.clone());
                }
            } else {
                // Section not found, append it to the end
                if !lines.is_empty() && !lines.last().unwrap().trim().is_empty() {
                    lines.push(String::new());
                }
                lines.push(section_header.to_string());
                for setting in gc_settings {
                    lines.push(setting);
                }
            }
        } else {
            // Remove section if it exists
            if let Some(idx) = section_index {
                let mut end_idx = idx + 1;
                while end_idx < lines.len() {
                    let trimmed = lines[end_idx].trim();
                    if trimmed.starts_with('[') {
                        break;
                    }
                    end_idx += 1;
                }
                // Drain the section header and settings
                lines.drain(idx..end_idx);
            }
        }

        let new_content = lines.join("\n");
        std::fs::write(&engine_ini_path, new_content)
            .map_err(|e| format!("Failed to write Engine.ini: {}", e))?;

        log::info!("[CONFIG] Updated Engine.ini (optimize: {}) at {}", optimize, engine_ini_path.display());
        Ok(())
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
