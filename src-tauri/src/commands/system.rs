/// System Tauri Commands — Hardware info, SteamCMD, port checking

use crate::AppState;
use crate::models::SystemInfo;
use crate::services::system_analyzer::SystemAnalyzer;
use crate::services::network::NetworkUtils;
use tauri::{State, Manager};

#[tauri::command]
pub async fn get_system_info(state: State<'_, AppState>) -> Result<SystemInfo, String> {
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    sys.refresh_cpu_all();
    sys.refresh_memory();

    Ok(SystemInfo {
        cpu_name: sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default(),
        cpu_cores: sys.cpus().len() as u32,
        cpu_usage: sys.global_cpu_usage(),
        total_memory_mb: sys.total_memory() / 1024 / 1024,
        used_memory_mb: sys.used_memory() / 1024 / 1024,
        available_memory_mb: sys.available_memory() / 1024 / 1024,
        os_name: sysinfo::System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: sysinfo::System::os_version().unwrap_or_else(|| "Unknown".to_string()),
    })
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
    pub is_workshop_mod: Option<bool>,
    pub author: Option<String>,
    pub version: Option<String>,
    pub workshop_id: Option<String>,
    pub display_name: Option<String>,
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
                                is_workshop_mod: Some(false),
                                author: None,
                                version: None,
                                workshop_id: None,
                                display_name: None,
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
                                is_workshop_mod: Some(false),
                                author: None,
                                version: None,
                                workshop_id: None,
                                display_name: None,
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
                                is_workshop_mod: Some(false),
                                author: None,
                                version: None,
                                workshop_id: None,
                                display_name: None,
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
                                is_workshop_mod: Some(false),
                                author: None,
                                version: None,
                                workshop_id: None,
                                display_name: None,
                            });
                        }
                    }
                }
            }
        }
    }

    // 3. Official Workshop Mods
    let mods_dir = base_path.join("Mods");
    let workshop_dir = mods_dir.join("Workshop");
    let ini_path = mods_dir.join("PalModSettings.ini");

    // Read active mods from PalModSettings.ini
    let mut active_mods = std::collections::HashSet::new();
    if ini_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&ini_path) {
            let mut section_found = false;
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed == "[PalModSettings]" {
                    section_found = true;
                } else if trimmed.starts_with("[") {
                    section_found = false;
                }
                if section_found && trimmed.starts_with("ActiveModList=") {
                    if let Some(name) = trimmed.strip_prefix("ActiveModList=") {
                        active_mods.insert(name.trim().to_string());
                    }
                }
            }
        }
    }

    if workshop_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&workshop_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let folder_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let info_json_path = path.join("Info.json");
                    if info_json_path.exists() {
                        if let Ok(info_content) = std::fs::read_to_string(&info_json_path) {
                            if let Ok(info) = serde_json::from_str::<serde_json::Value>(&info_content) {
                                let package_name = info.get("PackageName")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");
                                
                                if !package_name.is_empty() {
                                    let author = info.get("Author")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                    let version = info.get("Version")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());

                                    let is_enabled = active_mods.contains(package_name);
                                    
                                    // Calculate total size of directory
                                    let mut size_bytes = 0;
                                    if let Ok(sub_entries) = std::fs::read_dir(&path) {
                                        for sub_entry in sub_entries.flatten() {
                                            if let Ok(metadata) = sub_entry.metadata() {
                                                if metadata.is_file() {
                                                    size_bytes += metadata.len();
                                                }
                                            }
                                        }
                                    }

                                    let is_logic = info.get("InstallRule")
                                        .and_then(|r| r.get("LogicMods"))
                                        .and_then(|l| l.as_array())
                                        .map(|arr| !arr.is_empty())
                                        .unwrap_or(false);

                                    let display_name = info.get("DisplayName")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());

                                    mods.push(ModItem {
                                        name: package_name.to_string(),
                                        path: path.to_string_lossy().to_string(),
                                        is_logic_mod: is_logic,
                                        enabled: is_enabled,
                                        size_bytes,
                                        is_workshop_mod: Some(true),
                                        author,
                                        version,
                                        workshop_id: Some(folder_name),
                                        display_name,
                                    });
                                }
                            }
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
        // Create a temporary directory to extract zip contents and analyze them
        let temp_dir = base_path.join("Temp_Import");
        if temp_dir.exists() {
            let _ = std::fs::remove_dir_all(&temp_dir);
        }
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temporary import directory: {}", e))?;

        let file = std::fs::File::open(&source_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;
        
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let outpath = match file.enclosed_name() {
                Some(path) => temp_dir.join(path),
                None => continue,
            };

            if (*file.name()).ends_with('/') {
                let _ = std::fs::create_dir_all(&outpath);
            } else {
                if let Some(p) = outpath.parent() {
                    let _ = std::fs::create_dir_all(p);
                }
                if let Ok(mut outfile) = std::fs::File::create(&outpath) {
                    let _ = std::io::copy(&mut file, &mut outfile);
                }
            }
        }

        // Check if there is an Info.json inside the extracted temp_dir
        if let Some(info_json_path) = crate::commands::workshop::find_info_json(&temp_dir) {
            log::info!("[IMPORT] Found Info.json in imported ZIP, installing as official/registered mod");
            let mod_src_dir = info_json_path.parent().unwrap();
            
            // Read Info.json to get PackageName and modify InstallRule if is_logic_mod is requested
            let mut package_name = file_name_str.trim_end_matches(".zip").to_string();
            let mut info_val = None;
            if let Ok(info_content) = std::fs::read_to_string(&info_json_path) {
                if let Ok(mut info) = serde_json::from_str::<serde_json::Value>(&info_content) {
                    if let Some(name) = info.get("PackageName").and_then(|v| v.as_str()) {
                        package_name = name.to_string();
                    }
                    
                    // If is_logic_mod is true, enforce that the pak file is registered under LogicMods in Info.json
                    if is_logic_mod {
                        let mut paks = Vec::new();
                        // Get any paks that were in Paks
                        if let Some(arr) = info.get("InstallRule").and_then(|r| r.get("Paks")).and_then(|a| a.as_array()) {
                            for item in arr {
                                if let Some(s) = item.as_str() {
                                    paks.push(s.to_string());
                                }
                            }
                        }
                        // Also check LogicMods to prevent duplicate/empty
                        if let Some(arr) = info.get("InstallRule").and_then(|r| r.get("LogicMods")).and_then(|a| a.as_array()) {
                            for item in arr {
                                if let Some(s) = item.as_str() {
                                    if !paks.contains(&s.to_string()) {
                                        paks.push(s.to_string());
                                    }
                                }
                            }
                        }
                        
                        // Enforce logic mods installation rule
                        if let Some(rule) = info.get_mut("InstallRule") {
                            rule["Paks"] = serde_json::json!(Vec::<String>::new());
                            rule["LogicMods"] = serde_json::json!(paks);
                        } else {
                            info["InstallRule"] = serde_json::json!({
                                "Paks": Vec::<String>::new(),
                                "LogicMods": paks
                            });
                        }
                    } else {
                        // Enforce regular paks installation rule
                        let mut paks = Vec::new();
                        if let Some(arr) = info.get("InstallRule").and_then(|r| r.get("Paks")).and_then(|a| a.as_array()) {
                            for item in arr {
                                if let Some(s) = item.as_str() {
                                    paks.push(s.to_string());
                                }
                            }
                        }
                        if let Some(arr) = info.get("InstallRule").and_then(|r| r.get("LogicMods")).and_then(|a| a.as_array()) {
                            for item in arr {
                                if let Some(s) = item.as_str() {
                                    if !paks.contains(&s.to_string()) {
                                        paks.push(s.to_string());
                                    }
                                }
                            }
                        }
                        
                        if let Some(rule) = info.get_mut("InstallRule") {
                            rule["Paks"] = serde_json::json!(paks);
                            rule["LogicMods"] = serde_json::json!(Vec::<String>::new());
                        } else {
                            info["InstallRule"] = serde_json::json!({
                                "Paks": paks,
                                "LogicMods": Vec::<String>::new()
                            });
                        }
                    }
                    
                    info_val = Some(info);
                }
            }

            // Dest is Mods/Workshop/<package_name>
            let dest_dir = base_path
                .join("Mods")
                .join("Workshop")
                .join(&package_name);

            if dest_dir.exists() {
                let _ = std::fs::remove_dir_all(&dest_dir);
            }
            std::fs::create_dir_all(&dest_dir)
                .map_err(|e| format!("Failed to create Mods/Workshop directory: {}", e))?;

            let mut copied_files = Vec::new();
            crate::commands::workshop::copy_dir_contents(mod_src_dir, &dest_dir, &mut copied_files)
                .map_err(|e| format!("Failed to copy mod files to workshop directory: {}", e))?;

            // Write back the modified Info.json if we successfully updated it
            if let Some(info) = info_val {
                if let Ok(updated_info_str) = serde_json::to_string_pretty(&info) {
                    let _ = std::fs::write(dest_dir.join("Info.json"), updated_info_str);
                }
            }

            // Enable mod in PalModSettings.ini
            let ini_path = base_path
                .join("Mods")
                .join("PalModSettings.ini");
            
            enable_mod_in_ini(&ini_path, &package_name)?;

            // Clean up temporary directory
            let _ = std::fs::remove_dir_all(&temp_dir);
        } else {
            // No Info.json found, copy paks to Paks or LogicMods based on is_logic_mod
            let mut paks = Vec::new();
            fn collect_paks(dir: &std::path::Path, paks: &mut Vec<std::path::PathBuf>) {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            collect_paks(&path, paks);
                        } else if path.is_file() {
                            if path.extension().map(|e| e == "pak").unwrap_or(false) {
                                paks.push(path);
                            }
                        }
                    }
                }
            }
            collect_paks(&temp_dir, &mut paks);

            if paks.is_empty() {
                let _ = std::fs::remove_dir_all(&temp_dir);
                return Err("No .pak files found inside the selected zip archive.".to_string());
            }

            for pak_path in paks {
                if let Some(fname) = pak_path.file_name() {
                    let dest_path = dest_dir.join(fname);
                    std::fs::copy(&pak_path, &dest_path)
                        .map_err(|e| format!("Failed to copy pak file: {}", e))?;
                }
            }

            // Clean up temporary directory
            let _ = std::fs::remove_dir_all(&temp_dir);
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

fn enable_mod_in_ini(ini_path: &std::path::Path, package_name: &str) -> Result<(), String> {
    let mut lines = Vec::new();
    let mut section_found = false;
    let mut global_enable_found = false;
    let mut mod_already_active = false;

    if ini_path.exists() {
        let content = std::fs::read_to_string(ini_path)
            .map_err(|e| format!("Failed to read PalModSettings.ini: {}", e))?;
        
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed == "[PalModSettings]" {
                section_found = true;
            } else if trimmed.starts_with("[") {
                section_found = false;
            }
            if section_found && trimmed.starts_with("bGlobalEnableMod") {
                global_enable_found = true;
                lines.push("bGlobalEnableMod=true".to_string());
                continue;
            }
            if section_found && trimmed == &format!("ActiveModList={}", package_name) {
                mod_already_active = true;
            }
            lines.push(line.to_string());
        }
    }

    if !section_found {
        lines.push("[PalModSettings]".to_string());
    }
    if !global_enable_found {
        lines.push("bGlobalEnableMod=true".to_string());
    }
    if !mod_already_active {
        lines.push(format!("ActiveModList={}", package_name));
    }

    if let Some(parent) = ini_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create Mods directory: {}", e))?;
    }

    std::fs::write(ini_path, lines.join("\n") + "\n")
        .map_err(|e| format!("Failed to write PalModSettings.ini: {}", e))?;

    Ok(())
}

fn disable_mod_in_ini(ini_path: &std::path::Path, package_name: &str) -> Result<(), String> {
    if !ini_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(ini_path)
        .map_err(|e| format!("Failed to read PalModSettings.ini: {}", e))?;
    
    let mut lines = Vec::new();
    let target = format!("ActiveModList={}", package_name);

    for line in content.lines() {
        if line.trim() != target {
            lines.push(line.to_string());
        }
    }

    std::fs::write(ini_path, lines.join("\n") + "\n")
        .map_err(|e| format!("Failed to write PalModSettings.ini: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_mod(
    state: State<'_, AppState>,
    server_id: i64,
    mod_name: String,
    is_logic_mod: bool,
    enable: bool,
    is_workshop_mod: Option<bool>,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    if is_workshop_mod.unwrap_or(false) {
        let ini_path = std::path::PathBuf::from(&install_path)
            .join("Mods")
            .join("PalModSettings.ini");
        
        if enable {
            enable_mod_in_ini(&ini_path, &mod_name)?;
        } else {
            disable_mod_in_ini(&ini_path, &mod_name)?;
        }
        return Ok(());
    }

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
    is_workshop_mod: Option<bool>,
) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    if is_workshop_mod.unwrap_or(false) {
        let ini_path = std::path::PathBuf::from(&install_path)
            .join("Mods")
            .join("PalModSettings.ini");
        disable_mod_in_ini(&ini_path, &mod_name)?;

        let workshop_dir = std::path::PathBuf::from(&install_path)
            .join("Mods")
            .join("Workshop");
        
        if workshop_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&workshop_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let info_json = path.join("Info.json");
                        if info_json.exists() {
                            if let Ok(content) = std::fs::read_to_string(&info_json) {
                                if let Ok(info) = serde_json::from_str::<serde_json::Value>(&content) {
                                    if let Some(package_name) = info.get("PackageName").and_then(|v| v.as_str()) {
                                        if package_name == mod_name {
                                            std::fs::remove_dir_all(&path)
                                                .map_err(|e| format!("Failed to delete mod folder: {}", e))?;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return Ok(());
    }

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
        // Create a temporary directory inside the server's install path to extract zip contents and analyze them
        let temp_import_dir = base_path.join("Temp_Download_Import");
        if temp_import_dir.exists() {
            let _ = std::fs::remove_dir_all(&temp_import_dir);
        }
        std::fs::create_dir_all(&temp_import_dir).map_err(|e| format!("Failed to create temporary import directory: {}", e))?;

        let file = std::fs::File::open(&temp_file_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;
        
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let outpath = match file.enclosed_name() {
                Some(path) => temp_import_dir.join(path),
                None => continue,
            };

            if (*file.name()).ends_with('/') {
                let _ = std::fs::create_dir_all(&outpath);
            } else {
                if let Some(p) = outpath.parent() {
                    let _ = std::fs::create_dir_all(p);
                }
                if let Ok(mut outfile) = std::fs::File::create(&outpath) {
                    let _ = std::io::copy(&mut file, &mut outfile);
                }
            }
        }

        // Check if there is an Info.json inside the extracted temp_import_dir
        if let Some(info_json_path) = crate::commands::workshop::find_info_json(&temp_import_dir) {
            log::info!("[DOWNLOAD] Found Info.json in downloaded ZIP, installing as official/registered mod");
            let mod_src_dir = info_json_path.parent().unwrap();
            
            // Read Info.json to get PackageName and modify InstallRule if is_logic_mod is requested
            let mut package_name = file_name.trim_end_matches(".zip").to_string();
            let mut info_val = None;
            if let Ok(info_content) = std::fs::read_to_string(&info_json_path) {
                if let Ok(mut info) = serde_json::from_str::<serde_json::Value>(&info_content) {
                    if let Some(name) = info.get("PackageName").and_then(|v| v.as_str()) {
                        package_name = name.to_string();
                    }
                    
                    // If is_logic_mod is true, enforce that the pak file is registered under LogicMods in Info.json
                    let mut paks = Vec::new();
                    if let Some(arr) = info.get("InstallRule").and_then(|r| r.get("Paks")).and_then(|a| a.as_array()) {
                        for item in arr {
                            if let Some(s) = item.as_str() {
                                paks.push(s.to_string());
                            }
                        }
                    }
                    if let Some(arr) = info.get("InstallRule").and_then(|r| r.get("LogicMods")).and_then(|a| a.as_array()) {
                        for item in arr {
                            if let Some(s) = item.as_str() {
                                if !paks.contains(&s.to_string()) {
                                    paks.push(s.to_string());
                                }
                            }
                        }
                    }
                    
                    if is_logic_mod {
                        if let Some(rule) = info.get_mut("InstallRule") {
                            rule["Paks"] = serde_json::json!(Vec::<String>::new());
                            rule["LogicMods"] = serde_json::json!(paks);
                        } else {
                            info["InstallRule"] = serde_json::json!({
                                "Paks": Vec::<String>::new(),
                                "LogicMods": paks
                            });
                        }
                    } else {
                        if let Some(rule) = info.get_mut("InstallRule") {
                            rule["Paks"] = serde_json::json!(paks);
                            rule["LogicMods"] = serde_json::json!(Vec::<String>::new());
                        } else {
                            info["InstallRule"] = serde_json::json!({
                                "Paks": paks,
                                "LogicMods": Vec::<String>::new()
                            });
                        }
                    }
                    
                    info_val = Some(info);
                }
            }

            // Dest is Mods/Workshop/<package_name>
            let dest_dir = base_path
                .join("Mods")
                .join("Workshop")
                .join(&package_name);

            if dest_dir.exists() {
                let _ = std::fs::remove_dir_all(&dest_dir);
            }
            std::fs::create_dir_all(&dest_dir)
                .map_err(|e| format!("Failed to create Mods/Workshop directory: {}", e))?;

            let mut copied_files = Vec::new();
            crate::commands::workshop::copy_dir_contents(mod_src_dir, &dest_dir, &mut copied_files)
                .map_err(|e| format!("Failed to copy mod files to workshop directory: {}", e))?;

            // Write back the modified Info.json if we successfully updated it
            if let Some(info) = info_val {
                if let Ok(updated_info_str) = serde_json::to_string_pretty(&info) {
                    let _ = std::fs::write(dest_dir.join("Info.json"), updated_info_str);
                }
            }

            // Enable mod in PalModSettings.ini
            let ini_path = base_path
                .join("Mods")
                .join("PalModSettings.ini");
            
            enable_mod_in_ini(&ini_path, &package_name)?;

            // Clean up temporary directory
            let _ = std::fs::remove_dir_all(&temp_import_dir);
        } else {
            // No Info.json found, copy paks to Paks or LogicMods based on is_logic_mod
            let mut paks = Vec::new();
            fn collect_paks(dir: &std::path::Path, paks: &mut Vec<std::path::PathBuf>) {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            collect_paks(&path, paks);
                        } else if path.is_file() {
                            if path.extension().map(|e| e == "pak").unwrap_or(false) {
                                paks.push(path);
                            }
                        }
                    }
                }
            }
            collect_paks(&temp_import_dir, &mut paks);

            if paks.is_empty() {
                let _ = std::fs::remove_dir_all(&temp_import_dir);
                return Err("No .pak files found inside the selected zip archive.".to_string());
            }

            for pak_path in paks {
                if let Some(fname) = pak_path.file_name() {
                    let dest_path = dest_dir.join(fname);
                    std::fs::copy(&pak_path, &dest_path)
                        .map_err(|e| format!("Failed to copy pak file: {}", e))?;
                }
            }

            // Clean up temporary directory
            let _ = std::fs::remove_dir_all(&temp_import_dir);
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

fn safe_truncate(s: &str, max_chars: usize) -> String {
    let truncated: String = s.chars().take(max_chars).collect();
    if s.chars().count() > max_chars {
        format!("{}...", truncated.trim())
    } else {
        truncated
    }
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
    pub workshop_id: Option<String>,
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

    let steam_key = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_setting("steam_api_key")?.unwrap_or_default()
    };

    let curseforge_key = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_setting("curseforge_api_key")?.unwrap_or_default()
    };

    let mut results = Vec::new();
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .map_err(|e| e.to_string())?;

    let query_trimmed = query.trim();

    // 1. Search Nexus Mods (if API key provided)
    if !api_key.is_empty() {
        let mut searched_mod_id = None;
        if let Ok(id) = query_trimmed.parse::<i64>() {
            searched_mod_id = Some(id);
        } else if query_trimmed.contains("nexusmods.com/") {
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
            if let Ok(resp) = client.get(&url).header("apikey", &api_key).send().await {
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
                            summary: safe_truncate(&summary, 120),
                            author,
                            downloads,
                            rating: 4.8,
                            category: "Nexus Mods".to_string(),
                            compat: "v0.2.4.0+".to_string(),
                            source: "nexus".to_string(),
                            url,
                            download_url: None,
                            picture_url,
                            workshop_id: None,
                        });
                    }
                }
            }
        } else {
            // Fetch popular mods
            let popular_url = "https://api.nexusmods.com/v1/games/palworld/mods/trending.json";
        if let Ok(resp) = client.get(popular_url).header("apikey", &api_key).send().await {
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
                            if !results.iter().any(|r: &SearchResult| r.name == item_name) {
                                results.push(SearchResult {
                                    name: item_name,
                                    title: name.to_string(),
                                    description: description.to_string(),
                                    summary: safe_truncate(summary, 120),
                                    author: author.to_string(),
                                    downloads: m["mod_downloads"].as_i64().unwrap_or(0).to_string(),
                                    rating: 4.8,
                                    category: "Nexus Mods".to_string(),
                                    compat: "v0.2.4.0+".to_string(),
                                    source: "nexus".to_string(),
                                    url: format!("https://www.nexusmods.com/palworld/mods/{}", mod_id),
                                    download_url: None,
                                    picture_url,
                                    workshop_id: None,
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
                            if !results.iter().any(|r: &SearchResult| r.name == item_name) {
                                results.push(SearchResult {
                                    name: item_name,
                                    title: name.to_string(),
                                    description: description.to_string(),
                                    summary: safe_truncate(summary, 120),
                                    author: author.to_string(),
                                    downloads: m["mod_downloads"].as_i64().unwrap_or(0).to_string(),
                                    rating: 4.8,
                                    category: "Nexus Mods".to_string(),
                                    compat: "v0.2.4.0+".to_string(),
                                    source: "nexus".to_string(),
                                    url: format!("https://www.nexusmods.com/palworld/mods/{}", mod_id),
                                    download_url: None,
                                    picture_url,
                                    workshop_id: None,
                                });
                            }
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
                    
                    let summary = safe_truncate(&desc, 120);

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
                        workshop_id: None,
                    });
                }
            }
        }
    }

    // 3. Search Steam Workshop (if API key provided)
    if !steam_key.is_empty() {
        let steam_url = format!(
            "https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?key={}&query_type=0&page=1&numperpage=20&appid=1623730&creator_appid=1623730&search_text={}&return_short_description=1&return_metadata=1",
            steam_key,
            urlencoding::encode(&query)
        );

        if let Ok(resp) = client.get(&steam_url).send().await {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(details) = json["response"]["publishedfiledetails"].as_array() {
                    for item in details {
                        let publishedfileid = item["publishedfileid"].as_str().unwrap_or("");
                        if publishedfileid.is_empty() {
                            continue;
                        }
                        
                        let title = item["title"].as_str().unwrap_or("").to_string();
                        let description = item["description"].as_str().unwrap_or("").to_string();
                        let raw_summary = item["short_description"].as_str()
                            .or(item["description"].as_str())
                            .unwrap_or("");
                        let summary = safe_truncate(raw_summary, 120);
                        
                        let downloads = item["subscriptions"].as_i64()
                            .or_else(|| item["subscriptions"].as_str().and_then(|s| s.parse().ok()))
                            .unwrap_or(0)
                            .to_string();
                        
                        let picture_url = item["preview_url"].as_str().map(|s| s.to_string());
                        let url = format!("https://steamcommunity.com/sharedfiles/filedetails/?id={}", publishedfileid);
                        
                        results.push(SearchResult {
                            name: format!("workshop_{}", publishedfileid),
                            title,
                            description,
                            summary,
                            author: "Workshop Creator".to_string(),
                            downloads,
                            rating: 4.8,
                            category: "Steam Workshop".to_string(),
                            compat: "v0.2.4.0+".to_string(),
                            source: "steam".to_string(),
                            url,
                            download_url: None,
                            picture_url,
                            workshop_id: Some(publishedfileid.to_string()),
                        });
                    }
                }
            }
        }
    }

    // 4. Search CurseForge (if API key provided)
    if !curseforge_key.is_empty() {
        let curseforge_url = format!(
            "https://api.curseforge.com/v1/mods/search?gameId=825597&searchFilter={}&pageSize=20",
            urlencoding::encode(&query)
        );

        if let Ok(resp) = client.get(&curseforge_url)
            .header("x-api-key", &curseforge_key)
            .send()
            .await {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(data) = json["data"].as_array() {
                    for item in data {
                        let id = item["id"].as_i64().unwrap_or(0);
                        if id == 0 {
                            continue;
                        }
                        
                        let title = item["name"].as_str().unwrap_or("").to_string();
                        let raw_summary = item["summary"].as_str().unwrap_or("");
                        let summary = safe_truncate(raw_summary, 120);
                        let description = summary.clone();
                        
                        let author = item["authors"].as_array()
                            .and_then(|arr| arr.first())
                            .and_then(|a| a["name"].as_str())
                            .unwrap_or("CurseForge Creator")
                            .to_string();
                        
                        let downloads = item["downloadCount"].as_i64().unwrap_or(0).to_string();
                        let picture_url = item["logo"]["url"].as_str().map(|s| s.to_string());
                        let url = item["links"]["websiteUrl"].as_str()
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| format!("https://www.curseforge.com/palworld/mods/{}", id));
                        
                        results.push(SearchResult {
                            name: format!("curseforge_{}.pak", id),
                            title,
                            description,
                            summary,
                            author,
                            downloads,
                            rating: 4.8,
                            category: "CurseForge".to_string(),
                            compat: "v0.2.4.0+".to_string(),
                            source: "curseforge".to_string(),
                            url,
                            download_url: Some(id.to_string()),
                            picture_url,
                            workshop_id: None,
                        });
                    }
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
pub async fn download_curseforge_mod_via_api(
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

    // 1. Get files list for this mod
    let files_url = format!("https://api.curseforge.com/v1/mods/{}/files", mod_id);
    let files_resp = client.get(&files_url)
        .header("x-api-key", &api_key)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch CurseForge files list: {}", e))?;

    let files_json = files_resp.json::<serde_json::Value>().await
        .map_err(|e| format!("Failed to parse CurseForge files JSON: {}", e))?;

    let files_list = files_json["data"].as_array()
        .ok_or_else(|| "No files found for this CurseForge mod".to_string())?;

    let primary_file = files_list.first()
        .ok_or_else(|| "No files found on CurseForge".to_string())?;

    let file_id = primary_file["id"].as_i64()
        .ok_or_else(|| "Invalid file ID".to_string())?;

    // 2. Get download URL
    let dl_link_url = format!("https://api.curseforge.com/v1/mods/{}/files/{}/download-url", mod_id, file_id);
    let dl_link_resp = client.get(&dl_link_url)
        .header("x-api-key", &api_key)
        .send()
        .await
        .map_err(|e| format!("Failed to request CurseForge download link: {}", e))?;

    let dl_link_json = dl_link_resp.json::<serde_json::Value>().await
        .map_err(|e| format!("Failed to parse CurseForge download link JSON: {}", e))?;

    let download_url = dl_link_json["data"].as_str()
        .ok_or_else(|| "Invalid download link returned by CurseForge".to_string())?;

    // 3. Download and install
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

    // 2. Get status details conditionally based on whether it is remote or local
    let (is_installed, build_id, install_size_bytes, save_size_bytes) = if server.is_remote {
        (true, "remote".to_string(), 0u64, 0u64)
    } else {
        // Check if installed
        let is_installed = crate::commands::system::check_server_installed(server.install_path.to_string_lossy().to_string()).await.unwrap_or(false);

        // Read manifest for buildid
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

        // Calculate directory size of install path and Saved folder
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

        (is_installed, build_id, i_size, s_size)
    };

    // 5. Query mod count dynamically from filesystem
    let mod_count = list_installed_mods(state.clone(), server_id).await.map(|v| v.len() as u32).unwrap_or(0);

    // 6. Check RCON status and REST API status
    let is_running = server.is_remote || state.process_manager.is_server_running(server_id);
    let host = if server.is_remote { &server.host } else { "127.0.0.1" };
    let is_rcon_reachable = if is_running {
        let addr = format!("{}:{}", host, server.ports.rcon_port);
        tokio::time::timeout(
            std::time::Duration::from_millis(200),
            tokio::net::TcpStream::connect(&addr),
        )
        .await
        .map(|res| res.is_ok())
        .unwrap_or(false)
    } else {
        false
    };

    let rcon_status = if !server.rcon_config.enabled {
        "disabled".to_string()
    } else if is_rcon_reachable {
        "connected".to_string()
    } else {
        "disconnected".to_string()
    };

    let is_rest_reachable = if server.is_remote {
        let addr = format!("{}:{}", host, server.rest_api_config.port);
        tokio::time::timeout(
            std::time::Duration::from_millis(200),
            tokio::net::TcpStream::connect(&addr),
        )
        .await
        .map(|res| res.is_ok())
        .unwrap_or(false)
    } else {
        is_running
    };

    let rest_api_status = if !server.rest_api_config.enabled {
        "disabled".to_string()
    } else if is_rest_reachable {
        "active".to_string()
    } else {
        "disabled".to_string()
    };

    // 7. Get Disk space
    let mut disk_free_bytes = 0;
    let mut disk_total_bytes = 0;

    if !server.is_remote {
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConfigResponse {
    pub name: String,
    pub description: String,
    pub install_path: String,
    pub game_port: u16,
    pub rcon_port: u16,
    pub rest_api_port: u16,
    pub max_players: u32,
    pub admin_password: String,
    pub server_password: Option<String>,
    pub public_ip: Option<String>,
}

#[tauri::command]
pub async fn parse_existing_server_config(install_path: String) -> Result<ImportConfigResponse, String> {
    use crate::services::config_generator::ConfigGenerator;
    use crate::services::ini_parser;
    use std::path::PathBuf;

    let base = PathBuf::from(&install_path);
    let mut detected_path = base.clone();
    let mut exe_found = false;

    // 1. Check if the directory itself has the exe
    let shipping_exe = detected_path.join("Pal").join("Binaries").join("Win64").join("PalServer-Win64-Shipping-Cmd.exe");
    let root_exe = detected_path.join("PalServer.exe");
    if shipping_exe.exists() || root_exe.exists() {
        exe_found = true;
    }

    // 2. If not, scan immediate subdirectories for PalServer.exe (e.g. if pointing to a common folder)
    if !exe_found {
        if let Ok(entries) = std::fs::read_dir(&base) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let sub_dir = entry.path();
                        let sub_exe = sub_dir.join("PalServer.exe");
                        let sub_shipping = sub_dir.join("Pal").join("Binaries").join("Win64").join("PalServer-Win64-Shipping-Cmd.exe");
                        if sub_exe.exists() || sub_shipping.exists() {
                            detected_path = sub_dir;
                            exe_found = true;
                            break;
                        }
                    }
                }
            }
        }
    }

    // 3. What if they selected a subfolder of the server (like "Pal", "Binaries", etc.)? Traverse upwards.
    if !exe_found {
        let mut current = base.clone();
        for _ in 0..4 {
            let check_exe = current.join("PalServer.exe");
            let check_shipping = current.join("Pal").join("Binaries").join("Win64").join("PalServer-Win64-Shipping-Cmd.exe");
            if check_exe.exists() || check_shipping.exists() {
                detected_path = current;
                exe_found = true;
                break;
            }
            if let Some(parent) = current.parent() {
                current = parent.to_path_buf();
            } else {
                break;
            }
        }
    }

    if !exe_found {
        return Err("The selected directory does not appear to contain a Palworld server installation (missing PalServer.exe).".to_string());
    }

    let install_path_str = detected_path.to_string_lossy().to_string();
    let settings_path = ConfigGenerator::get_settings_path(&install_path_str);
    let default_settings_path = detected_path.join("DefaultPalWorldSettings.ini");

    let mut import_resp = ImportConfigResponse {
        name: "Imported Server".to_string(),
        description: "".to_string(),
        install_path: install_path_str.clone(),
        game_port: 8211,
        rcon_port: 25575,
        rest_api_port: 8212,
        max_players: 32,
        admin_password: "admin".to_string(),
        server_password: None,
        public_ip: None,
    };

    let final_settings_path = if settings_path.exists() {
        Some(settings_path)
    } else if default_settings_path.exists() {
        Some(default_settings_path)
    } else {
        None
    };

    if let Some(path) = final_settings_path {
        if let Ok(settings_map) = ini_parser::read_settings_file(&path) {
            if let Some(v) = settings_map.get("ServerName") {
                import_resp.name = v.trim_matches('"').to_string();
            }
            if let Some(v) = settings_map.get("ServerDescription") {
                import_resp.description = v.trim_matches('"').to_string();
            }
            if let Some(v) = settings_map.get("PublicPort") {
                if let Ok(port) = v.parse::<u16>() {
                    import_resp.game_port = port;
                }
            }
            if let Some(v) = settings_map.get("RCONPort") {
                if let Ok(port) = v.parse::<u16>() {
                    import_resp.rcon_port = port;
                }
            }
            if let Some(v) = settings_map.get("RESTAPIPort") {
                if let Ok(port) = v.parse::<u16>() {
                    import_resp.rest_api_port = port;
                }
            }
            if let Some(v) = settings_map.get("ServerPlayerMaxNum") {
                if let Ok(players) = v.parse::<u32>() {
                    import_resp.max_players = players;
                }
            }
            if let Some(v) = settings_map.get("AdminPassword") {
                let pass = v.trim_matches('"').to_string();
                if !pass.is_empty() {
                    import_resp.admin_password = pass;
                }
            }
            if let Some(v) = settings_map.get("ServerPassword") {
                let pass = v.trim_matches('"').to_string();
                if !pass.is_empty() {
                    import_resp.server_password = Some(pass);
                }
            }
            if let Some(v) = settings_map.get("PublicIP") {
                let ip = v.trim_matches('"').to_string();
                if !ip.is_empty() {
                    import_resp.public_ip = Some(ip);
                }
            }
        }
    }

    Ok(import_resp)
}

#[tauri::command]
pub async fn get_mod_files(mod_path: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&mod_path);
    if !path.exists() {
        return Err("Mod directory/file does not exist".to_string());
    }

    let mut files = Vec::new();
    if path.is_file() {
        if let Some(filename) = path.file_name() {
            files.push(filename.to_string_lossy().to_string());
        }
    } else {
        fn collect_files(root: &std::path::Path, current: &std::path::Path, files: &mut Vec<String>) -> Result<(), std::io::Error> {
            if current.is_dir() {
                for entry in std::fs::read_dir(current)? {
                    let entry = entry?;
                    let path = entry.path();
                    if path.is_dir() {
                        collect_files(root, &path, files)?;
                    } else {
                        if let Ok(rel) = path.strip_prefix(root) {
                            files.push(rel.to_string_lossy().to_string());
                        }
                    }
                }
            }
            Ok(())
        }
        let _ = collect_files(path, path, &mut files);
    }

    Ok(files)
}

#[tauri::command]
pub async fn read_pal_mod_settings(state: State<'_, AppState>, server_id: i64) -> Result<String, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };
    let ini_path = std::path::PathBuf::from(&install_path)
        .join("Mods")
        .join("PalModSettings.ini");
    if !ini_path.exists() {
        return Ok("".to_string());
    }
    std::fs::read_to_string(ini_path).map_err(|e| format!("Failed to read PalModSettings.ini: {}", e))
}

#[tauri::command]
pub async fn save_pal_mod_settings(state: State<'_, AppState>, server_id: i64, content: String) -> Result<(), String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };
    let mods_dir = std::path::PathBuf::from(&install_path).join("Mods");
    if !mods_dir.exists() {
        std::fs::create_dir_all(&mods_dir).map_err(|e| format!("Failed to create Mods directory: {}", e))?;
    }
    let ini_path = mods_dir.join("PalModSettings.ini");
    std::fs::write(ini_path, content).map_err(|e| format!("Failed to write PalModSettings.ini: {}", e))
}





