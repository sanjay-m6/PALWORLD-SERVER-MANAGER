/// Palworld INI Parser
///
/// Palworld uses a unique INI format where all settings are stored in a single line:
/// ```ini
/// [/Script/Pal.PalGameWorldSettings]
/// OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,...)
/// ```
///
/// This parser handles the comma-separated key=value pairs inside the OptionSettings parentheses.

use std::collections::HashMap;
use std::path::Path;

/// Parse a PalWorldSettings.ini file into a key-value map
pub fn parse_palworld_settings(content: &str) -> HashMap<String, String> {
    let mut settings = HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim();

        // Look for the OptionSettings line
        if let Some(option_content) = trimmed.strip_prefix("OptionSettings=(") {
            // Remove trailing ')'
            let option_content = option_content.trim_end_matches(')');

            // Parse comma-separated Key=Value pairs
            // Handle nested parentheses for complex values
            let mut current_key = String::new();
            let mut current_value = String::new();
            let mut in_value = false;
            let mut paren_depth = 0;

            for ch in option_content.chars() {
                match ch {
                    '(' => {
                        paren_depth += 1;
                        if in_value {
                            current_value.push(ch);
                        }
                    }
                    ')' => {
                        paren_depth -= 1;
                        if in_value {
                            current_value.push(ch);
                        }
                    }
                    '=' if !in_value && paren_depth == 0 => {
                        in_value = true;
                    }
                    ',' if paren_depth == 0 => {
                        // End of a key=value pair
                        if !current_key.is_empty() {
                            settings.insert(current_key.trim().to_string(), current_value.trim().to_string());
                        }
                        current_key.clear();
                        current_value.clear();
                        in_value = false;
                    }
                    _ => {
                        if in_value {
                            current_value.push(ch);
                        } else {
                            current_key.push(ch);
                        }
                    }
                }
            }

            // Don't forget the last pair
            if !current_key.is_empty() {
                settings.insert(current_key.trim().to_string(), current_value.trim().to_string());
            }
        }
    }

    settings
}

/// Serialize a key-value map back to PalWorldSettings.ini format
pub fn serialize_palworld_settings(settings: &HashMap<String, String>) -> String {
    let mut pairs: Vec<String> = settings
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect();
    pairs.sort(); // Deterministic output

    format!(
        "[/Script/Pal.PalGameWorldSettings]\nOptionSettings=({})\n",
        pairs.join(",")
    )
}

/// Read and parse PalWorldSettings.ini from a file path
pub fn read_settings_file(path: &Path) -> Result<HashMap<String, String>, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;
    Ok(parse_palworld_settings(&content))
}

/// Write settings to a PalWorldSettings.ini file
pub fn write_settings_file(path: &Path, settings: &HashMap<String, String>) -> Result<(), String> {
    let content = serialize_palworld_settings(settings);

    // Create parent directories if needed
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    std::fs::write(path, content)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok(())
}

/// Convert a PalworldConfig struct to a HashMap for INI serialization
pub fn config_to_map(config: &crate::models::PalworldConfig) -> HashMap<String, String> {
    let mut map = HashMap::new();

    map.insert("Difficulty".to_string(), config.difficulty.clone());
    map.insert("DayTimeSpeedRate".to_string(), format!("{:.6}", config.day_time_speed_rate));
    map.insert("NightTimeSpeedRate".to_string(), format!("{:.6}", config.night_time_speed_rate));
    map.insert("ExpRate".to_string(), format!("{:.6}", config.exp_rate));
    map.insert("PalCaptureRate".to_string(), format!("{:.6}", config.pal_capture_rate));
    map.insert("PalSpawnNumRate".to_string(), format!("{:.6}", config.pal_spawn_num_rate));
    map.insert("PalDamageRateAttack".to_string(), format!("{:.6}", config.pal_damage_rate_attack));
    map.insert("PalDamageRateDefense".to_string(), format!("{:.6}", config.pal_damage_rate_defense));
    map.insert("PlayerDamageRateAttack".to_string(), format!("{:.6}", config.player_damage_rate_attack));
    map.insert("PlayerDamageRateDefense".to_string(), format!("{:.6}", config.player_damage_rate_defense));
    map.insert("PlayerStomachDecreaseRate".to_string(), format!("{:.6}", config.player_stomach_decrease_rate));
    map.insert("PlayerStaminaDecreaseRate".to_string(), format!("{:.6}", config.player_stamina_decrease_rate));
    map.insert("PlayerAutoHPRegeneRate".to_string(), format!("{:.6}", config.player_auto_hp_regen_rate));
    map.insert("PlayerAutoHpRegeneRateInSleep".to_string(), format!("{:.6}", config.player_auto_hp_regen_rate_in_sleep));
    map.insert("PalStomachDecreaseRate".to_string(), format!("{:.6}", config.pal_stomach_decrease_rate));
    map.insert("PalStaminaDecreaseRate".to_string(), format!("{:.6}", config.pal_stamina_decrease_rate));
    map.insert("PalAutoHPRegeneRate".to_string(), format!("{:.6}", config.pal_auto_hp_regen_rate));
    map.insert("PalAutoHpRegeneRateInSleep".to_string(), format!("{:.6}", config.pal_auto_hp_regen_rate_in_sleep));
    map.insert("DeathPenalty".to_string(), config.death_penalty.clone());
    map.insert("BuildObjectDamageRate".to_string(), format!("{:.6}", config.build_object_damage_rate));
    map.insert("BuildObjectDeteriorationDamageRate".to_string(), format!("{:.6}", config.build_object_deterioration_damage_rate));
    map.insert("CollectionDropRate".to_string(), format!("{:.6}", config.collection_drop_rate));
    map.insert("CollectionObjectHpRate".to_string(), format!("{:.6}", config.collection_object_hp_rate));
    map.insert("CollectionObjectRespawnSpeedRate".to_string(), format!("{:.6}", config.collection_object_respawn_speed_rate));
    map.insert("EnemyDropItemRate".to_string(), format!("{:.6}", config.enemy_drop_item_rate));
    map.insert("PalEggDefaultHatchingTime".to_string(), format!("{:.6}", config.pal_egg_default_hatching_time));
    map.insert("WorkSpeedRate".to_string(), format!("{:.6}", config.work_speed_rate));
    map.insert("bIsMultiplay".to_string(), config.is_multiplay.to_string().capitalize_first());
    map.insert("bIsPvP".to_string(), config.is_pvp.to_string().capitalize_first());
    map.insert("bCanPickupOtherGuildDeathPenaltyDrop".to_string(), config.can_pickup_other_guild_death_penalty_drop.to_string().capitalize_first());
    map.insert("bEnableNonLoginPenalty".to_string(), config.enable_non_login_penalty.to_string().capitalize_first());
    map.insert("bEnableFastTravel".to_string(), config.enable_fast_travel.to_string().capitalize_first());
    map.insert("bEnablePlayerToPlayerDamage".to_string(), config.enable_player_to_player_damage.to_string().capitalize_first());
    map.insert("bEnableFriendlyFire".to_string(), config.enable_friendly_fire.to_string().capitalize_first());
    map.insert("bEnableInvaderEnemy".to_string(), config.enable_invader_enemy.to_string().capitalize_first());
    map.insert("BaseCampMaxNum".to_string(), config.base_camp_max_num.to_string());
    map.insert("BaseCampMaxNumInGuild".to_string(), config.base_camp_max_num_in_guild.to_string());
    map.insert("BaseCampWorkerMaxNum".to_string(), config.base_camp_worker_max_num.to_string());
    map.insert("DropItemMaxNum".to_string(), config.drop_item_max_num.to_string());
    map.insert("DropItemMaxNum_UNKO".to_string(), config.drop_item_max_num_unko.to_string());
    map.insert("DropItemAliveMaxHours".to_string(), format!("{:.6}", config.drop_item_alive_max_hours));
    map.insert("bAutoResetGuildNoOnlinePlayers".to_string(), config.auto_reset_guild_no_online_players.to_string().capitalize_first());
    map.insert("AutoResetGuildTimeNoOnlinePlayers".to_string(), format!("{:.6}", config.auto_reset_guild_time_no_online_players));
    map.insert("ServerPlayerMaxNum".to_string(), config.server_player_max_num.to_string());
    map.insert("ServerName".to_string(), format!("\"{}\"", config.server_name));
    map.insert("ServerDescription".to_string(), format!("\"{}\"", config.server_description));
    map.insert("AdminPassword".to_string(), format!("\"{}\"", config.admin_password));
    map.insert("ServerPassword".to_string(), format!("\"{}\"", config.server_password));
    map.insert("PublicPort".to_string(), config.public_port.to_string());
    map.insert("PublicIP".to_string(), format!("\"{}\"", config.public_ip));
    map.insert("RCONEnabled".to_string(), config.rcon_enabled.to_string().capitalize_first());
    map.insert("RCONPort".to_string(), config.rcon_port.to_string());
    map.insert("Region".to_string(), format!("\"{}\"", config.region));
    map.insert("bUseAuth".to_string(), config.useauth.to_string().capitalize_first());
    map.insert("BanListURL".to_string(), format!("\"{}\"", config.ban_list_url));
    map.insert("RESTAPIEnabled".to_string(), config.rest_api_enabled.to_string().capitalize_first());
    map.insert("RESTAPIPort".to_string(), config.rest_api_port.to_string());
    map.insert("CoopPlayerMaxNum".to_string(), config.coop_player_max_num.to_string());
    map.insert("GuildPlayerMaxNum".to_string(), config.guild_player_max_num.to_string());
    map.insert("bEnableAimAssistPad".to_string(), config.enable_aim_assist_pad.to_string().capitalize_first());
    map.insert("bEnableAimAssistKeyboard".to_string(), config.enable_aim_assist_keyboard.to_string().capitalize_first());
    map.insert("SupplyDropSpan".to_string(), config.supply_drop_span.to_string());

    map
}

/// Helper trait to capitalize first letter of bool strings
trait CapitalizeFirst {
    fn capitalize_first(&self) -> String;
}

impl CapitalizeFirst for String {
    fn capitalize_first(&self) -> String {
        let mut c = self.chars();
        match c.next() {
            None => String::new(),
            Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_settings() {
        let content = r#"[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,NightTimeSpeedRate=1.000000,ExpRate=1.000000)"#;

        let settings = parse_palworld_settings(content);
        assert_eq!(settings.get("Difficulty"), Some(&"None".to_string()));
        assert_eq!(settings.get("DayTimeSpeedRate"), Some(&"1.000000".to_string()));
        assert_eq!(settings.get("ExpRate"), Some(&"1.000000".to_string()));
    }

    #[test]
    fn test_roundtrip() {
        let mut settings = HashMap::new();
        settings.insert("Difficulty".to_string(), "None".to_string());
        settings.insert("ExpRate".to_string(), "2.000000".to_string());

        let serialized = serialize_palworld_settings(&settings);
        let parsed = parse_palworld_settings(&serialized);

        assert_eq!(parsed.get("Difficulty"), Some(&"None".to_string()));
        assert_eq!(parsed.get("ExpRate"), Some(&"2.000000".to_string()));
    }
}
