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
    map.insert("PlayerStomachDecreaceRate".to_string(), format!("{:.6}", config.player_stomach_decrease_rate));
    map.insert("PlayerStaminaDecreaceRate".to_string(), format!("{:.6}", config.player_stamina_decrease_rate));
    map.insert("PlayerAutoHPRegeneRate".to_string(), format!("{:.6}", config.player_auto_hp_regen_rate));
    map.insert("PlayerAutoHpRegeneRateInSleep".to_string(), format!("{:.6}", config.player_auto_hp_regen_rate_in_sleep));
    map.insert("PalStomachDecreaceRate".to_string(), format!("{:.6}", config.pal_stomach_decrease_rate));
    map.insert("PalStaminaDecreaceRate".to_string(), format!("{:.6}", config.pal_stamina_decrease_rate));
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
    map.insert("bAllowGlobalPalboxExport".to_string(), config.allow_global_palbox_export.to_string().capitalize_first());
    map.insert("bAllowGlobalPalboxImport".to_string(), config.allow_global_palbox_import.to_string().capitalize_first());
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
    map.insert("AdminPassword".to_string(), config.admin_password.trim().to_string());
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

    // New 1.0.0 Settings
    map.insert("RandomizerType".to_string(), config.randomizer_type.clone());
    map.insert("RandomizerSeed".to_string(), format!("\"{}\"", config.randomizer_seed));
    map.insert("bIsRandomizerPalLevelRandom".to_string(), config.is_randomizer_pal_level_random.to_string().capitalize_first());
    map.insert("BuildObjectHpRate".to_string(), format!("{:.6}", config.build_object_hp_rate));
    map.insert("bActiveUNKO".to_string(), config.active_unko.to_string().capitalize_first());
    map.insert("PhysicsActiveDropItemMaxNum".to_string(), config.physics_active_drop_item_max_num.to_string());
    map.insert("AutoSaveSpan".to_string(), format!("{:.6}", config.auto_save_span));
    map.insert("bHardcore".to_string(), config.hardcore.to_string().capitalize_first());
    map.insert("bPalLost".to_string(), config.pal_lost.to_string().capitalize_first());
    map.insert("bCharacterRecreateInHardcore".to_string(), config.character_recreate_in_hardcore.to_string().capitalize_first());
    map.insert("bEnableFastTravelOnlyBaseCamp".to_string(), config.enable_fast_travel_only_base_camp.to_string().capitalize_first());
    map.insert("bIsStartLocationSelectByMap".to_string(), config.is_start_location_select_by_map.to_string().capitalize_first());
    map.insert("bExistPlayerAfterLogout".to_string(), config.exist_player_after_logout.to_string().capitalize_first());
    map.insert("bEnableDefenseOtherGuildPlayer".to_string(), config.enable_defense_other_guild_player.to_string().capitalize_first());
    map.insert("bInvisibleOtherGuildBaseCampAreaFX".to_string(), config.invisible_other_guild_base_camp_area_fx.to_string().capitalize_first());
    map.insert("bBuildAreaLimit".to_string(), config.build_area_limit.to_string().capitalize_first());
    map.insert("ItemWeightRate".to_string(), format!("{:.6}", config.item_weight_rate));
    map.insert("bAllowClientMod".to_string(), config.allow_client_mod.to_string().capitalize_first());
    map.insert("bShowPlayerList".to_string(), config.show_player_list.to_string().capitalize_first());
    map.insert("ChatPostLimitPerMinute".to_string(), config.chat_post_limit_per_minute.to_string());
    map.insert("CrossplayPlatforms".to_string(), config.crossplay_platforms.clone());
    map.insert("bIsUseBackupSaveData".to_string(), config.is_use_backup_save_data.to_string().capitalize_first());
    map.insert("LogFormatType".to_string(), config.log_format_type.clone());
    map.insert("bIsShowJoinLeftMessage".to_string(), config.is_show_join_left_message.to_string().capitalize_first());
    map.insert("EnablePredatorBossPal".to_string(), config.enable_predator_boss_pal.to_string().capitalize_first());
    map.insert("MaxBuildingLimitNum".to_string(), config.max_building_limit_num.to_string());
    map.insert("ServerReplicatePawnCullDistance".to_string(), format!("{:.6}", config.server_replicate_pawn_cull_distance));
    map.insert("EquipmentDurabilityDamageRate".to_string(), format!("{:.6}", config.equipment_durability_damage_rate));
    map.insert("ItemContainerForceMarkDirtyInterval".to_string(), format!("{:.6}", config.item_container_force_mark_dirty_interval));
    map.insert("PlayerDataPalStorageUpdateCheckTickInterval".to_string(), format!("{:.6}", config.player_data_pal_storage_update_check_tick_interval));
    map.insert("ItemCorruptionMultiplier".to_string(), format!("{:.6}", config.item_corruption_multiplier));
    map.insert("MonsterFarmActionSpeedRate".to_string(), format!("{:.6}", config.monster_farm_action_speed_rate));
    map.insert("DenyTechnologyList".to_string(), format!("\"{}\"", config.deny_technology_list));
    map.insert("GuildRejoinCooldownMinutes".to_string(), config.guild_rejoin_cooldown_minutes.to_string());
    map.insert("AutoTransferMasterCheckIntervalSeconds".to_string(), format!("{:.6}", config.auto_transfer_master_check_interval_seconds));
    map.insert("AutoTransferMasterThresholdDays".to_string(), config.auto_transfer_master_threshold_days.to_string());
    map.insert("MaxGuildsPerFrame".to_string(), config.max_guilds_per_frame.to_string());
    map.insert("BlockRespawnTime".to_string(), format!("{:.6}", config.block_respawn_time));
    map.insert("RespawnPenaltyDurationThreshold".to_string(), format!("{:.6}", config.respawn_penalty_duration_threshold));
    map.insert("RespawnPenaltyTimeScale".to_string(), format!("{:.6}", config.respawn_penalty_time_scale));
    map.insert("bDisplayPvPItemNumOnWorldMap_BaseCamp".to_string(), config.display_pvp_item_num_on_world_map_base_camp.to_string().capitalize_first());
    map.insert("bDisplayPvPItemNumOnWorldMap_Player".to_string(), config.display_pvp_item_num_on_world_map_player.to_string().capitalize_first());
    map.insert("AdditionalDropItemWhenPlayerKillingInPvPMode".to_string(), format!("\"{}\"", config.additional_drop_item_when_player_killing_in_pvp_mode));
    map.insert("AdditionalDropItemNumWhenPlayerKillingInPvPMode".to_string(), config.additional_drop_item_num_when_player_killing_in_pvp_mode.to_string());
    map.insert("bAdditionalDropItemWhenPlayerKillingInPvPMode".to_string(), config.b_additional_drop_item_when_player_killing_in_pvp_mode.to_string().capitalize_first());
    map.insert("bEnableVoiceChat".to_string(), config.enable_voice_chat.to_string().capitalize_first());
    map.insert("VoiceChatMaxVolumeDistance".to_string(), format!("{:.6}", config.voice_chat_max_volume_distance));
    map.insert("VoiceChatZeroVolumeDistance".to_string(), format!("{:.6}", config.voice_chat_zero_volume_distance));
    map.insert("bAllowEnhanceStat_Health".to_string(), config.allow_enhance_stat_health.to_string().capitalize_first());
    map.insert("bAllowEnhanceStat_Attack".to_string(), config.allow_enhance_stat_attack.to_string().capitalize_first());
    map.insert("bAllowEnhanceStat_Stamina".to_string(), config.allow_enhance_stat_stamina.to_string().capitalize_first());
    map.insert("bAllowEnhanceStat_Weight".to_string(), config.allow_enhance_stat_weight.to_string().capitalize_first());
    map.insert("bAllowEnhanceStat_WorkSpeed".to_string(), config.allow_enhance_stat_work_speed.to_string().capitalize_first());
    map.insert("bEnableBuildingPlayerUIdDisplay".to_string(), config.enable_building_player_uid_display.to_string().capitalize_first());
    map.insert("BuildingNameDisplayCacheTTLSeconds".to_string(), config.building_name_display_cache_ttl_seconds.to_string());

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
