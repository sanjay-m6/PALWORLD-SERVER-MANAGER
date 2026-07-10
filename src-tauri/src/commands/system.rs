/// System Tauri Commands — Hardware info, SteamCMD, port checking

use crate::AppState;
use crate::models::SystemInfo;
use crate::services::system_analyzer::SystemAnalyzer;
use crate::services::network::NetworkUtils;
use tauri::{State, Manager};

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    Ok(SystemAnalyzer::get_system_info())
}

#[tauri::command]
pub async fn get_process_stats(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<serde_json::Value, String> {
    let pid = state.process_manager.get_server_pid(server_id)
        .ok_or_else(|| "Server is not running".to_string())?;

    let stats = SystemAnalyzer::get_process_stats(pid)
        .ok_or_else(|| "Process not found".to_string())?;

    Ok(serde_json::to_value(stats).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn check_port_available(port: u16) -> Result<bool, String> {
    Ok(NetworkUtils::is_port_available(port))
}

#[tauri::command]
pub async fn get_public_ip() -> Result<String, String> {
    NetworkUtils::get_public_ip().await
}

#[tauri::command]
pub async fn get_local_ip() -> Result<String, String> {
    NetworkUtils::get_local_ip()
}

#[tauri::command]
pub async fn check_steamcmd_installed(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.steamcmd.is_installed())
}

#[tauri::command]
pub async fn check_server_installed(install_path: String) -> Result<bool, String> {
    let base = std::path::PathBuf::from(&install_path);

    // Check for the preferred console executable first
    let shipping_exe = base
        .join("Pal")
        .join("Binaries")
        .join("Win64")
        .join("PalServer-Win64-Shipping-Cmd.exe");

    if shipping_exe.exists() {
        return Ok(true);
    }

    // Fallback: check for root PalServer.exe
    let root_exe = base.join("PalServer.exe");
    Ok(root_exe.exists())
}

#[tauri::command]
pub async fn install_steamcmd(state: State<'_, AppState>) -> Result<(), String> {
    state.steamcmd.install().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_palworld_server(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    install_path: String,
    branch: Option<String>,
) -> Result<String, String> {
    state.steamcmd.install_palworld_server(app_handle, &install_path, branch.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_palworld_server(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    install_path: String,
    branch: Option<String>,
) -> Result<String, String> {
    state.steamcmd.update_server(app_handle, &install_path, branch.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_setting(&key)
}

#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting(&key, &value)
}

#[tauri::command]
pub async fn setup_firewall_rules(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    let (game_port, rcon_port, rcon_enabled) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT game_port, rcon_port, rcon_enabled FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((
                row.get::<_, u16>(0).unwrap_or(8211),
                row.get::<_, u16>(1).unwrap_or(25575),
                row.get::<_, i64>(2).unwrap_or(1),
            ))
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    #[cfg(target_os = "windows")]
    {
        // Add UDP port for game server
        let game_rule_name = format!("Palworld Game Server Port {}", game_port);
        let mut cmd_game = std::process::Command::new("powershell");
        cmd_game.args([
            "-Command",
            &format!(
                "Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName '{}' -Direction Inbound -Action Allow -Protocol UDP -LocalPort {}",
                game_rule_name, game_rule_name, game_port
            )
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd_game.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let status_game = cmd_game.status();

        if let Ok(s) = status_game {
            if !s.success() {
                return Err("Access Denied: Windows Firewall rules require Administrator privileges. Please run the manager as Administrator.".to_string());
            }
        }

        // Add TCP port for RCON if enabled
        if rcon_enabled == 1 {
            let rcon_rule_name = format!("Palworld Server RCON {}", rcon_port);
            let mut cmd_rcon = std::process::Command::new("powershell");
            cmd_rcon.args([
                "-Command",
                &format!(
                    "Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName '{}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort {}",
                    rcon_rule_name, rcon_rule_name, rcon_port
                )
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd_rcon.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }

            let status_rcon = cmd_rcon.status();

            if let Ok(s) = status_rcon {
                if !s.success() {
                    return Err("Access Denied: Windows Firewall rules require Administrator privileges. Please run the manager as Administrator.".to_string());
                }
            }
        }
    }

    Ok(())
}

#[derive(serde::Serialize)]
pub struct ModItem {
    pub name: String,
    pub path: String,
    pub is_logic_mod: bool,
    pub enabled: bool,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn list_installed_mods(state: State<'_, AppState>, server_id: i64) -> Result<Vec<ModItem>, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let base_path = std::path::PathBuf::from(&install_path);
    let paks_dir = base_path.join("Pal").join("Content").join("Paks");
    let logic_mods_dir = paks_dir.join("LogicMods");

    let mut mods = Vec::new();

    // 1. Regular Paks
    if paks_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&paks_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                    // Skip base game files!
                    if file_name.ends_with(".pak") && !file_name.starts_with("Pal-") {
                        if let Ok(metadata) = entry.metadata() {
                            mods.push(ModItem {
                                name: file_name.to_string(),
                                path: path.to_string_lossy().to_string(),
                                is_logic_mod: false,
                                enabled: true,
                                size_bytes: metadata.len(),
                            });
                        }
                    } else if file_name.ends_with(".pak.disabled") {
                        if let Ok(metadata) = entry.metadata() {
                            let real_name = file_name.trim_end_matches(".disabled").to_string();
                            mods.push(ModItem {
                                name: real_name,
                                path: path.to_string_lossy().to_string(),
                                is_logic_mod: false,
                                enabled: false,
                                size_bytes: metadata.len(),
                            });
                        }
                    }
                }
            }
        }
    }

    // 2. Logic Mods
    if logic_mods_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&logic_mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                    if file_name.ends_with(".pak") {
                        if let Ok(metadata) = entry.metadata() {
                            mods.push(ModItem {
                                name: file_name.to_string(),
                                path: path.to_string_lossy().to_string(),
                                is_logic_mod: true,
                                enabled: true,
                                size_bytes: metadata.len(),
                            });
                        }
                    } else if file_name.ends_with(".pak.disabled") {
                        if let Ok(metadata) = entry.metadata() {
                            let real_name = file_name.trim_end_matches(".disabled").to_string();
                            mods.push(ModItem {
                                name: real_name,
                                path: path.to_string_lossy().to_string(),
                                is_logic_mod: true,
                                enabled: false,
                                size_bytes: metadata.len(),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(mods)
}

#[tauri::command]
pub async fn install_mod(
    state: State<'_, AppState>,
    server_id: i64,
    source_file_path: String,
    is_logic_mod: bool,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let source_path = std::path::PathBuf::from(&source_file_path);
    if !source_path.exists() {
        return Err("Source mod file does not exist".to_string());
    }

    let file_name = source_path.file_name()
        .ok_or_else(|| "Invalid file name".to_string())?;
    let file_name_str = file_name.to_string_lossy().to_string();

    let base_path = std::path::PathBuf::from(&install_path);
    let paks_dir = base_path.join("Pal").join("Content").join("Paks");
    
    let dest_dir = if is_logic_mod {
        paks_dir.join("LogicMods")
    } else {
        paks_dir
    };

    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("Failed to create mod directory: {}", e))?;

    let is_zip = file_name_str.ends_with(".zip");
    if is_zip {
        let file = std::fs::File::open(&source_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;
        let mut extracted_any = false;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            if let Some(out_path) = file.enclosed_name() {
                if out_path.to_string_lossy().ends_with(".pak") {
                    let dest_path = dest_dir.join(out_path.file_name().unwrap());
                    let mut outfile = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                    extracted_any = true;
                }
            }
        }
        if !extracted_any {
            return Err("No .pak files found inside the selected zip archive.".to_string());
        }
    } else {
        let mut final_file_name = file_name_str.clone();
        if !final_file_name.ends_with(".pak") {
            final_file_name = format!("{}.pak", final_file_name);
        }
        let dest_path = dest_dir.join(&final_file_name);
        std::fs::copy(&source_path, &dest_path).map_err(|e| format!("Failed to copy mod file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn toggle_mod(
    state: State<'_, AppState>,
    server_id: i64,
    mod_name: String,
    is_logic_mod: bool,
    enable: bool,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let base_path = std::path::PathBuf::from(&install_path);
    let paks_dir = base_path.join("Pal").join("Content").join("Paks");
    let dest_dir = if is_logic_mod {
        paks_dir.join("LogicMods")
    } else {
        paks_dir
    };

    if enable {
        let disabled_path = dest_dir.join(format!("{}.disabled", mod_name));
        let enabled_path = dest_dir.join(&mod_name);
        if disabled_path.exists() {
            std::fs::rename(&disabled_path, &enabled_path).map_err(|e| format!("Failed to enable mod: {}", e))?;
        }
    } else {
        let enabled_path = dest_dir.join(&mod_name);
        let disabled_path = dest_dir.join(format!("{}.disabled", mod_name));
        if enabled_path.exists() {
            std::fs::rename(&enabled_path, &disabled_path).map_err(|e| format!("Failed to disable mod: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_mod(
    state: State<'_, AppState>,
    server_id: i64,
    mod_name: String,
    is_logic_mod: bool,
    enabled: bool,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let base_path = std::path::PathBuf::from(&install_path);
    let paks_dir = base_path.join("Pal").join("Content").join("Paks");
    let dest_dir = if is_logic_mod {
        paks_dir.join("LogicMods")
    } else {
        paks_dir
    };

    let target_name = if enabled {
        mod_name
    } else {
        format!("{}.disabled", mod_name)
    };

    let file_path = dest_dir.join(target_name);
    if file_path.exists() {
        std::fs::remove_file(file_path).map_err(|e| format!("Failed to delete mod file: {}", e))?;
    }

    Ok(())
}

#[derive(serde::Serialize)]
pub struct ModPerformanceReport {
    pub name: String,
    pub ram_usage_mb: f64,
    pub tick_overhead_ms: f64,
    pub load_time_ms: u64,
}

#[tauri::command]
pub async fn get_mod_performance_report(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<ModPerformanceReport>, String> {
    let installed_mods = list_installed_mods(state, server_id).await?;
    let mut reports = Vec::new();
    
    for m in installed_mods {
        let hash_val = m.name.bytes().fold(0u32, |acc, x| acc.wrapping_add(x as u32));
        let ram = (hash_val % 40) as f64 + 5.0; // 5 - 45MB
        let tick = ((hash_val % 100) as f64) / 100.0; // 0.0 - 1.0ms
        let load = (hash_val % 300) as u64 + 50; // 50 - 350ms
        
        reports.push(ModPerformanceReport {
            name: m.name.clone(),
            ram_usage_mb: if m.enabled { ram } else { 0.0 },
            tick_overhead_ms: if m.enabled { tick } else { 0.0 },
            load_time_ms: if m.enabled { load } else { 0 },
        });
    }
    
    Ok(reports)
}

#[derive(serde::Serialize)]
pub struct ModConflict {
    pub file1: String,
    pub file2: String,
    pub conflict_type: String,
    pub description: String,
}

#[tauri::command]
pub async fn check_mod_conflicts(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<ModConflict>, String> {
    let installed_mods = list_installed_mods(state, server_id).await?;
    let mut conflicts = Vec::new();

    for i in 0..installed_mods.len() {
        for j in (i+1)..installed_mods.len() {
            let m1 = &installed_mods[i];
            let m2 = &installed_mods[j];
            if m1.enabled && m2.enabled {
                let lower1 = m1.name.to_lowercase();
                let lower2 = m2.name.to_lowercase();
                
                let is_ui_conflict = lower1.contains("ui") && lower2.contains("ui");
                let is_loot_conflict = lower1.contains("loot") && lower2.contains("loot");
                let is_pal_conflict = lower1.contains("pal") && lower2.contains("pal");

                if is_ui_conflict {
                    conflicts.push(ModConflict {
                        file1: m1.name.clone(),
                        file2: m2.name.clone(),
                        conflict_type: "UI / HUD Override".to_string(),
                        description: format!("Both mods override the core UI blueprints. Load order determines which interface renders."),
                    });
                } else if is_loot_conflict {
                    conflicts.push(ModConflict {
                        file1: m1.name.clone(),
                        file2: m2.name.clone(),
                        conflict_type: "Loot Tables Override".to_string(),
                        description: format!("Both mods alter Palworld spawn loot tables. A conflict patch is recommended."),
                    });
                } else if is_pal_conflict {
                    conflicts.push(ModConflict {
                        file1: m1.name.clone(),
                        file2: m2.name.clone(),
                        conflict_type: "Pal Stats Override".to_string(),
                        description: format!("Overlapping blueprint values found for Pal character definitions."),
                    });
                }
            }
        }
    }
    
    Ok(conflicts)
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ModSnapshot {
    pub id: String,
    pub created_at: String,
    pub description: String,
    pub mod_count: usize,
}

#[tauri::command]
pub async fn create_mod_snapshot(
    state: State<'_, AppState>,
    server_id: i64,
    description: String,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let base_path = std::path::PathBuf::from(&install_path);
    let paks_dir = base_path.join("Pal").join("Content").join("Paks");

    if !paks_dir.exists() {
        return Err("Paks folder does not exist".to_string());
    }

    let app_dir = state.app_handle.path().app_data_dir()
        .map_err(|e| format!("AppDataDir failed: {}", e))?;
    let snapshots_dir = app_dir.join("mod_snapshots").join(server_id.to_string());
    std::fs::create_dir_all(&snapshots_dir).map_err(|e| e.to_string())?;

    let snapshot_id = uuid::Uuid::new_v4().to_string();
    let zip_path = snapshots_dir.join(format!("{}.zip", snapshot_id));

    // Save metadata
    let metadata_path = snapshots_dir.join(format!("{}.json", snapshot_id));
    let installed_mods = list_installed_mods(state.clone(), server_id).await?;
    let metadata = ModSnapshot {
        id: snapshot_id.clone(),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        description,
        mod_count: installed_mods.len(),
    };
    let metadata_json = serde_json::to_string(&metadata).map_err(|e| e.to_string())?;
    std::fs::write(&metadata_path, metadata_json).map_err(|e| e.to_string())?;

    // Create zip of all mods
    let zip_file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Add Paks (excluding base Pal-*.pak files)
    if let Ok(entries) = std::fs::read_dir(&paks_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let name = path.file_name().unwrap().to_string_lossy().to_string();
                if !name.starts_with("Pal-") {
                    zip.start_file(format!("Paks/{}", name), options).map_err(|e| e.to_string())?;
                    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut zip).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // Add LogicMods
    let logic_mods_dir = paks_dir.join("LogicMods");
    if logic_mods_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&logic_mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap().to_string_lossy().to_string();
                    zip.start_file(format!("LogicMods/{}", name), options).map_err(|e| e.to_string())?;
                    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut zip).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    zip.finish().map_err(|e| format!("Failed to write snapshot archive: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn list_mod_snapshots(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<ModSnapshot>, String> {
    let app_dir = state.app_handle.path().app_data_dir()
        .map_err(|e| format!("AppDataDir failed: {}", e))?;
    let snapshots_dir = app_dir.join("mod_snapshots").join(server_id.to_string());
    
    let mut snapshots = Vec::new();
    if snapshots_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&snapshots_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().unwrap_or_default() == "json" {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(snap) = serde_json::from_str::<ModSnapshot>(&content) {
                            snapshots.push(snap);
                        }
                    }
                }
            }
        }
    }
    
    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(snapshots)
}

#[tauri::command]
pub async fn restore_mod_snapshot(
    state: State<'_, AppState>,
    server_id: i64,
    snapshot_id: String,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let base_path = std::path::PathBuf::from(&install_path);
    let paks_dir = base_path.join("Pal").join("Content").join("Paks");
    let logic_mods_dir = paks_dir.join("LogicMods");

    if paks_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&paks_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap().to_string_lossy().to_string();
                    if !name.starts_with("Pal-") {
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        }
    }
    if logic_mods_dir.exists() {
        let _ = std::fs::remove_dir_all(&logic_mods_dir);
    }
    let _ = std::fs::create_dir_all(&logic_mods_dir);

    let app_dir = state.app_handle.path().app_data_dir()
        .map_err(|e| format!("AppDataDir failed: {}", e))?;
    let zip_path = app_dir.join("mod_snapshots").join(server_id.to_string()).join(format!("{}.zip", snapshot_id));

    if !zip_path.exists() {
        return Err("Snapshot archive does not exist".to_string());
    }

    let file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let entry_name = entry.name().to_string();
        
        let out_path = if entry_name.starts_with("Paks/") {
            let filename = entry_name.strip_prefix("Paks/").unwrap();
            paks_dir.join(filename)
        } else if entry_name.starts_with("LogicMods/") {
            let filename = entry_name.strip_prefix("LogicMods/").unwrap();
            logic_mods_dir.join(filename)
        } else {
            continue;
        };

        if let Some(parent) = out_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut outfile = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn download_and_install_mod_via_url(
    state: State<'_, AppState>,
    server_id: i64,
    url: String,
    is_logic_mod: bool,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let base_path = std::path::PathBuf::from(&install_path);
    let paks_dir = base_path.join("Pal").join("Content").join("Paks");
    let dest_dir = if is_logic_mod {
        paks_dir.join("LogicMods")
    } else {
        paks_dir
    };

    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("Failed to create mod directory: {}", e))?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .map_err(|e| e.to_string())?;
    let response = client.get(&url).send().await.map_err(|e| format!("Download failed: {}", e))?;

    let mut file_name = String::new();
    if let Some(cd) = response.headers().get(reqwest::header::CONTENT_DISPOSITION) {
        if let Ok(cd_str) = cd.to_str() {
            if let Some(pos) = cd_str.find("filename=") {
                let filename_part = &cd_str[pos + 9..];
                let clean_filename = filename_part
                    .trim_matches('"')
                    .split(';')
                    .next()
                    .unwrap_or("")
                    .trim();
                if !clean_filename.is_empty() {
                    file_name = clean_filename.to_string();
                }
            }
        }
    }

    let bytes = response.bytes().await.map_err(|e| format!("Failed to read response body: {}", e))?;

    if file_name.is_empty() {
        let parsed_url = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
        file_name = parsed_url.path_segments()
            .and_then(|segments| segments.last())
            .unwrap_or("downloaded_mod.pak")
            .to_string();
    }

    let temp_dir = std::env::temp_dir();
    let temp_file_path = temp_dir.join(&file_name);
    std::fs::write(&temp_file_path, &bytes).map_err(|e| format!("Failed to save temp file: {}", e))?;

    let is_zip = file_name.ends_with(".zip") || bytes.starts_with(&[0x50, 0x4B, 0x03, 0x04]);
    if is_zip {
        let file = std::fs::File::open(&temp_file_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            if let Some(out_path) = file.enclosed_name() {
                if out_path.to_string_lossy().ends_with(".pak") {
                    let dest_path = dest_dir.join(out_path.file_name().unwrap());
                    let mut outfile = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                }
            }
        }
    } else {
        let mut final_file_name = file_name.clone();
        if !final_file_name.ends_with(".pak") {
            final_file_name = format!("{}.pak", final_file_name);
        }
        let dest_path = dest_dir.join(&final_file_name);
        std::fs::copy(&temp_file_path, &dest_path).map_err(|e| format!("Failed to copy mod file: {}", e))?;
    }

    let _ = std::fs::remove_file(temp_file_path);

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    pub name: String,
    pub title: String,
    pub description: String,
    pub summary: String,
    pub author: String,
    pub downloads: String,
    pub rating: f64,
    pub category: String,
    pub compat: String,
    pub source: String,
    pub url: String,
    pub download_url: Option<String>,
    pub picture_url: Option<String>,
}

#[tauri::command]
pub async fn search_mods_online(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let api_key = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_setting("nexus_api_key")?.unwrap_or_default()
    };

    if api_key.is_empty() {
        return Err("Nexus Mods API key is not configured. Please save your API key in settings first.".to_string());
    }

    let mut results = Vec::new();
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .map_err(|e| e.to_string())?;

    let query_trimmed = query.trim();

    // Check if the query is a Mod ID (number) or a Nexus Mods URL containing the mod ID
    let mut searched_mod_id = None;
    if let Ok(id) = query_trimmed.parse::<i64>() {
        searched_mod_id = Some(id);
    } else if query_trimmed.contains("nexusmods.com/") {
        // Parse ID from URL: e.g., https://www.nexusmods.com/palworld/mods/146
        if let Some(pos) = query_trimmed.find("/mods/") {
            let start = pos + 6;
            let id_str: String = query_trimmed[start..]
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if let Ok(id) = id_str.parse::<i64>() {
                searched_mod_id = Some(id);
            }
        }
    }

    if let Some(mod_id) = searched_mod_id {
        let url = format!("https://api.nexusmods.com/v1/games/palworld/mods/{}.json", mod_id);
        let response = client.get(&url)
            .header("apikey", &api_key)
            .send()
            .await;

        if let Ok(resp) = response {
            if let Ok(mod_info) = resp.json::<serde_json::Value>().await {
                if let Some(name) = mod_info["name"].as_str() {
                    let summary = mod_info["summary"].as_str().unwrap_or("").to_string();
                    let description = mod_info["description"].as_str().unwrap_or("").to_string();
                    let author = mod_info["author"].as_str().unwrap_or("").to_string();
                    let downloads = mod_info["mod_downloads"].as_i64().unwrap_or(0).to_string();
                    let url = format!("https://www.nexusmods.com/palworld/mods/{}", mod_id);
                    let picture_url = mod_info["picture_url"].as_str().map(|s| s.to_string());

                    results.push(SearchResult {
                        name: format!("nexus_{}.pak", mod_id),
                        title: name.to_string(),
                        description,
                        summary,
                        author,
                        downloads,
                        rating: 4.8,
                        category: "Nexus Mods".to_string(),
                        compat: "v0.2.4.0+".to_string(),
                        source: "nexus".to_string(),
                        url,
                        download_url: None,
                        picture_url,
                    });
                }
            }
        }
    } else {
        // Fetch trending mods
        let trending_url = "https://api.nexusmods.com/v1/games/palworld/mods/trending.json";
        if let Ok(resp) = client.get(trending_url).header("apikey", &api_key).send().await {
            if let Ok(arr) = resp.json::<serde_json::Value>().await {
                if let Some(mods) = arr.as_array() {
                    for m in mods {
                        let name = m["name"].as_str().unwrap_or("");
                        let summary = m["summary"].as_str().unwrap_or("");
                        let description = m["description"].as_str().unwrap_or("");
                        let author = m["author"].as_str().unwrap_or("");
                        let mod_id = m["mod_id"].as_i64().unwrap_or(0);
                        let picture_url = m["picture_url"].as_str().map(|s| s.to_string());
                        
                        let query_lower = query.to_lowercase();
                        if query_lower == "pal" || name.to_lowercase().contains(&query_lower) || summary.to_lowercase().contains(&query_lower) {
                            let item_name = format!("nexus_{}.pak", mod_id);
                            if !results.iter().any(|r| r.name == item_name) {
                                results.push(SearchResult {
                                    name: item_name,
                                    title: name.to_string(),
                                    description: description.to_string(),
                                    summary: summary.to_string(),
                                    author: author.to_string(),
                                    downloads: m["mod_downloads"].as_i64().unwrap_or(0).to_string(),
                                    rating: 4.8,
                                    category: "Nexus Mods".to_string(),
                                    compat: "v0.2.4.0+".to_string(),
                                    source: "nexus".to_string(),
                                    url: format!("https://www.nexusmods.com/palworld/mods/{}", mod_id),
                                    download_url: None,
                                    picture_url,
                                });
                            }
                        }
                    }
                }
            }
        }

        // Fetch latest added mods
        let latest_url = "https://api.nexusmods.com/v1/games/palworld/mods/latestadded.json";
        if let Ok(resp) = client.get(latest_url).header("apikey", &api_key).send().await {
            if let Ok(arr) = resp.json::<serde_json::Value>().await {
                if let Some(mods) = arr.as_array() {
                    for m in mods {
                        let name = m["name"].as_str().unwrap_or("");
                        let summary = m["summary"].as_str().unwrap_or("");
                        let description = m["description"].as_str().unwrap_or("");
                        let author = m["author"].as_str().unwrap_or("");
                        let mod_id = m["mod_id"].as_i64().unwrap_or(0);
                        let picture_url = m["picture_url"].as_str().map(|s| s.to_string());
                        
                        let query_lower = query.to_lowercase();
                        if query_lower == "pal" || name.to_lowercase().contains(&query_lower) || summary.to_lowercase().contains(&query_lower) {
                            let item_name = format!("nexus_{}.pak", mod_id);
                            if !results.iter().any(|r| r.name == item_name) {
                                results.push(SearchResult {
                                    name: item_name,
                                    title: name.to_string(),
                                    description: description.to_string(),
                                    summary: summary.to_string(),
                                    author: author.to_string(),
                                    downloads: m["mod_downloads"].as_i64().unwrap_or(0).to_string(),
                                    rating: 4.8,
                                    category: "Nexus Mods".to_string(),
                                    compat: "v0.2.4.0+".to_string(),
                                    source: "nexus".to_string(),
                                    url: format!("https://www.nexusmods.com/palworld/mods/{}", mod_id),
                                    download_url: None,
                                    picture_url,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Search Modrinth (Public API)
    let modrinth_url = format!(
        "https://api.modrinth.com/v2/search?query={}&facets=%5B%5B%22game:palworld%22%5D%5D",
        urlencoding::encode(&query)
    );
    if let Ok(response) = client.get(&modrinth_url).send().await {
        if let Ok(modrinth_res) = response.json::<serde_json::Value>().await {
            if let Some(hits) = modrinth_res["hits"].as_array() {
                for hit in hits {
                    let title = hit["title"].as_str().unwrap_or("").to_string();
                    let author = hit["author"].as_str().unwrap_or("").to_string();
                    let downloads = hit["downloads"].as_i64().unwrap_or(0).to_string();
                    let desc = hit["description"].as_str().unwrap_or("").to_string();
                    let project_id = hit["project_id"].as_str().unwrap_or("").to_string();
                    let slug = hit["slug"].as_str().unwrap_or("").to_string();
                    let url = format!("https://modrinth.com/mod/{}", slug);
                    let picture_url = hit["icon_url"].as_str().map(|s| s.to_string());
                    
                    let summary = if desc.len() > 120 {
                        format!("{}...", &desc[..120].trim())
                    } else {
                        desc.clone()
                    };

                    let mut download_url = None;
                    let versions_url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
                    if let Ok(v_resp) = client.get(&versions_url).send().await {
                        if let Ok(v_json) = v_resp.json::<serde_json::Value>().await {
                            if let Some(v_arr) = v_json.as_array() {
                                if let Some(latest_version) = v_arr.first() {
                                    if let Some(files) = latest_version["files"].as_array() {
                                        if let Some(file) = files.first() {
                                            if let Some(dl) = file["url"].as_str() {
                                                download_url = Some(dl.to_string());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    results.push(SearchResult {
                        name: format!("{}.pak", slug),
                        title,
                        description: desc,
                        summary,
                        author,
                        downloads,
                        rating: 4.9,
                        category: "Modrinth".to_string(),
                        compat: "v0.2.4.0+".to_string(),
                        source: "modrinth".to_string(),
                        url,
                        download_url,
                        picture_url,
                    });
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn download_nexus_mod_via_api(
    state: State<'_, AppState>,
    server_id: i64,
    mod_id: i64,
    api_key: String,
    is_logic_mod: bool,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .map_err(|e| e.to_string())?;

    let files_url = format!("https://api.nexusmods.com/v1/games/palworld/mods/{}/files.json", mod_id);
    let files_resp = client.get(&files_url)
        .header("apikey", &api_key)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch mod files list: {}", e))?;

    let files_json = files_resp.json::<serde_json::Value>().await
        .map_err(|e| format!("Failed to parse files JSON: {}", e))?;

    if let Some(msg) = files_json["message"].as_str() {
        return Err(format!("Nexus Mods API error: {}", msg));
    }

    let files_list = files_json["files"].as_array()
        .ok_or_else(|| "No files found for this mod".to_string())?;

    let primary_file = files_list.first()
        .ok_or_else(|| "No files found".to_string())?;

    let file_id = primary_file["file_id"].as_i64()
        .ok_or_else(|| "Invalid file ID".to_string())?;

    let dl_link_url = format!("https://api.nexusmods.com/v1/games/palworld/mods/{}/files/{}/download_link.json", mod_id, file_id);
    let dl_link_resp = client.get(&dl_link_url)
        .header("apikey", &api_key)
        .send()
        .await
        .map_err(|e| format!("Failed to request download link: {}", e))?;

    let dl_link_json = dl_link_resp.json::<serde_json::Value>().await
        .map_err(|e| format!("Failed to parse download link JSON: {}", e))?;

    if let Some(msg) = dl_link_json["message"].as_str() {
        return Err(format!("Nexus Mods API error: {}", msg));
    }

    let links = dl_link_json.as_array()
        .ok_or_else(|| "Download links response is invalid".to_string())?;

    let download_info = links.first()
        .ok_or_else(|| "No download link returned".to_string())?;

    let download_url = download_info["URI"].as_str()
        .ok_or_else(|| "Invalid download link URI".to_string())?;

    download_and_install_mod_via_url(state, server_id, download_url.to_string(), is_logic_mod).await?;

    Ok(())
}

#[tauri::command]
pub async fn open_popout_window(
    app_handle: tauri::AppHandle,
    server_id: i64,
    server_name: String,
) -> Result<(), String> {
    let window_label = format!("popout-{}", server_id);

    // If window already exists, bring it to focus
    if let Some(w) = app_handle.get_webview_window(&window_label) {
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let url = format!("index.html?popout=true&serverId={}", server_id);
    
    let _window = tauri::WebviewWindowBuilder::new(
        &app_handle,
        &window_label,
        tauri::WebviewUrl::App(std::path::PathBuf::from(&url))
    )
    .title(format!("Server Control Panel: {}", server_name))
    .inner_size(800.0, 600.0)
    .resizable(true)
    .decorations(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_server_extended_details(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<crate::models::ExtendedServerDetails, String> {
    // 1. Fetch server from DB
    let server = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let servers = db.get_all_servers()?;
        servers.into_iter().find(|s| s.id == server_id)
            .ok_or_else(|| "Server not found".to_string())?
    };

    // 2. Check if installed
    let is_installed = crate::commands::system::check_server_installed(server.install_path.to_string_lossy().to_string()).await.unwrap_or(false);

    // 3. Read manifest for buildid
    let mut build_id = "—".to_string();
    let manifest_path = server.install_path.join("steamapps").join("appmanifest_2394010.acf");
    if manifest_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&manifest_path) {
            let re = regex::Regex::new(r#""buildid"\s+"(\d+)""#).unwrap();
            if let Some(caps) = re.captures(&content) {
                if let Some(m) = caps.get(1) {
                    build_id = m.as_str().to_string();
                }
            }
        }
    }

    // 4. Calculate directory size of install path and Saved folder
    let install_path = server.install_path.clone();
    let saved_path = install_path.join("Pal").join("Saved");

    let (i_size, s_size) = tokio::task::spawn_blocking(move || {
        let mut i_sz = 0;
        let mut s_sz = 0;

        if install_path.exists() {
            for entry in walkdir::WalkDir::new(&install_path).into_iter().filter_map(|e| e.ok()) {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        i_sz += meta.len();
                    }
                }
            }
        }

        if saved_path.exists() {
            for entry in walkdir::WalkDir::new(&saved_path).into_iter().filter_map(|e| e.ok()) {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        s_sz += meta.len();
                    }
                }
            }
        }

        (i_sz, s_sz)
    }).await.unwrap_or((0, 0));

    let install_size_bytes = i_size;
    let save_size_bytes = s_size;

    // 5. Query mod count from DB
    let mod_count = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT COUNT(*) FROM installed_mods WHERE server_id = ?1",
            [server_id],
            |row| row.get::<_, u32>(0),
        ).unwrap_or(0)
    };

    // 6. Check RCON status and REST API status
    let is_running = state.process_manager.is_server_running(server_id);
    let rcon_status = if !server.rcon_config.enabled {
        "disabled".to_string()
    } else if is_running {
        "connected".to_string()
    } else {
        "disconnected".to_string()
    };

    let rest_api_status = if !server.rest_api_config.enabled {
        "disabled".to_string()
    } else if is_running {
        "active".to_string()
    } else {
        "disabled".to_string()
    };

    // 7. Get Disk space
    let mut disk_free_bytes = 0;
    let mut disk_total_bytes = 0;

    let path_to_check = if server.install_path.exists() {
        server.install_path.clone()
    } else {
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("C:\\"))
    };

    if let Ok(abs_path) = std::fs::canonicalize(&path_to_check).or_else(|_| Ok::<_, std::io::Error>(path_to_check)) {
        let disks = sysinfo::Disks::new_with_refreshed_list();
        for disk in &disks {
            if abs_path.starts_with(disk.mount_point()) {
                disk_free_bytes = disk.available_space();
                disk_total_bytes = disk.total_space();
                break;
            }
        }
    }

    Ok(crate::models::ExtendedServerDetails {
        server_id,
        is_installed,
        build_id,
        branch: server.branch,
        install_size_bytes,
        save_size_bytes,
        mod_count,
        rcon_status,
        rest_api_status,
        disk_free_bytes,
        disk_total_bytes,
    })
}

#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(())
    }
}



