/// Workshop & UE4SS Commands — Direct mod downloads from Steam Workshop + UE4SS installer

use crate::AppState;
use tauri::State;
use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopDownloadResult {
    pub success: bool,
    pub message: String,
    pub mod_name: Option<String>,
}

/// Download a mod from Steam Workshop using SteamCMD
#[tauri::command]
pub async fn download_workshop_mod(
    state: State<'_, AppState>,
    server_id: i64,
    workshop_id: String,
    mod_title: Option<String>,
    is_logic_mod: Option<bool>,
) -> Result<WorkshopDownloadResult, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    // Query Steam Web API to find the consumer_app_id of this workshop item
    let mut app_id = "1623730".to_string();
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build();
        
    if let Ok(client) = client {
        let body = format!("itemcount=1&publishedfileids[0]={}", workshop_id);
        if let Ok(resp) = client.post("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/")
            .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await 
        {
            let json: Result<serde_json::Value, _> = resp.json().await;
            if let Ok(json_val) = json {
                if let Some(details) = json_val["response"]["publishedfiledetails"].as_array() {
                    if let Some(item) = details.first() {
                        if let Some(consumer_app_id) = item["consumer_app_id"].as_i64() {
                            app_id = consumer_app_id.to_string();
                        }
                    }
                }
            }
        }
    }
    
    // Run SteamCMD to download the workshop item
    let (steamcmd_exe, steamcmd_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if let Ok(Some(path)) = db.get_setting("steamcmd_path") {
            if !path.trim().is_empty() {
                let exe = std::path::PathBuf::from(path);
                let dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| state.steamcmd.get_steamcmd_dir());
                (exe, dir)
            } else {
                (state.steamcmd.get_steamcmd_exe(), state.steamcmd.get_steamcmd_dir())
            }
        } else {
            (state.steamcmd.get_steamcmd_exe(), state.steamcmd.get_steamcmd_dir())
        }
    };

    if !steamcmd_exe.exists() {
        return Ok(WorkshopDownloadResult {
            success: false,
            message: "SteamCMD is not installed. Please install it first from the Overview tab.".to_string(),
            mod_name: None,
        });
    }

    let steam_username = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_setting("steam_username").unwrap_or(None)
    };
    let login_user = steam_username
        .as_ref()
        .filter(|u| !u.trim().is_empty())
        .map(|u| u.as_str())
        .unwrap_or("anonymous");

    log::info!("[WORKSHOP] Downloading workshop item {} for server {} using login {}", workshop_id, server_id, login_user);

    let mut cmd = tokio::process::Command::new(&steamcmd_exe);
    cmd.args([
        "+login", login_user,
        "+workshop_download_item", &app_id, &workshop_id,
        "+quit",
    ]);
    cmd.stdin(std::process::Stdio::null());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output()
        .await
        .map_err(|e| format!("Failed to run SteamCMD: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Find the download path from SteamCMD output
    // Typically: "Downloaded item 12345 to /path/to/steamapps/workshop/content/..."
    let workshop_content_dir = steamcmd_dir
        .join("steamapps")
        .join("workshop")
        .join("content")
        .join(&app_id)
        .join(&workshop_id);

    let mut resolved_content_dir = None;
    let mut is_local_client_fallback = false;

    if workshop_content_dir.exists() {
        resolved_content_dir = Some(workshop_content_dir);
    } else {
        // Fallback: Check all local Steam client library directories
        let mut paths_to_check = Vec::new();
        for lib_dir in get_all_steam_library_workshop_dirs(&app_id) {
            paths_to_check.push(lib_dir.join(&workshop_id));
        }

        // Also add common fallback paths as a last resort
        paths_to_check.push(std::path::PathBuf::from(format!("C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\{}", app_id)).join(&workshop_id));
        paths_to_check.push(std::path::PathBuf::from(format!("C:\\Program Files\\Steam\\steamapps\\workshop\\content\\{}", app_id)).join(&workshop_id));
        paths_to_check.push(std::path::PathBuf::from(format!("D:\\SteamLibrary\\steamapps\\workshop\\content\\{}", app_id)).join(&workshop_id));
        paths_to_check.push(std::path::PathBuf::from(format!("E:\\SteamLibrary\\steamapps\\workshop\\content\\{}", app_id)).join(&workshop_id));

        for path in paths_to_check {
            if path.exists() {
                log::info!("[WORKSHOP] Found workshop item {} in local Steam client path: {:?}", workshop_id, path);
                resolved_content_dir = Some(path);
                is_local_client_fallback = true;
                break;
            }
        }
    }

    if let Some(content_dir) = resolved_content_dir {
        // Look for Info.json (official mod loader structure)
        if let Some(info_json_path) = find_info_json(&content_dir) {
            let mod_src_dir = info_json_path.parent().unwrap();
            
            // Dest is Mods/Workshop/<workshop_id>
            let dest_dir = std::path::Path::new(&install_path)
                .join("Mods")
                .join("Workshop")
                .join(&workshop_id);

            std::fs::create_dir_all(&dest_dir)
                .map_err(|e| format!("Failed to create Mods/Workshop directory: {}", e))?;

            let mut copied_files = Vec::new();
            copy_dir_contents(mod_src_dir, &dest_dir, &mut copied_files)
                .map_err(|e| format!("Failed to copy mod files to workshop directory: {}", e))?;

            // Read Info.json to get PackageName and inject DisplayName if provided
            let mut package_name = format!("Workshop_{}", workshop_id);
            let mut info_val = None;
            if let Ok(info_content) = std::fs::read_to_string(dest_dir.join("Info.json")) {
                if let Ok(mut info) = serde_json::from_str::<serde_json::Value>(&info_content) {
                    if let Some(name) = info.get("PackageName").and_then(|v| v.as_str()) {
                        package_name = name.to_string();
                    }
                    if let Some(title) = &mod_title {
                        info["DisplayName"] = serde_json::json!(title);
                    }
                    
                    let is_logic = is_logic_mod.unwrap_or(false);
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
                    
                    if is_logic {
                        if let Some(rule) = info.get_mut("InstallRule") {
                            if rule.is_object() {
                                rule["Paks"] = serde_json::json!(Vec::<String>::new());
                                rule["LogicMods"] = serde_json::json!(paks);
                            } else {
                                info["InstallRule"] = serde_json::json!({
                                    "Paks": Vec::<String>::new(),
                                    "LogicMods": paks
                                });
                            }
                        } else {
                            info["InstallRule"] = serde_json::json!({
                                "Paks": Vec::<String>::new(),
                                "LogicMods": paks
                            });
                        }
                    } else {
                        if let Some(rule) = info.get_mut("InstallRule") {
                            if rule.is_object() {
                                rule["Paks"] = serde_json::json!(paks);
                                rule["LogicMods"] = serde_json::json!(Vec::<String>::new());
                            } else {
                                info["InstallRule"] = serde_json::json!({
                                    "Paks": paks,
                                    "LogicMods": Vec::<String>::new()
                                });
                            }
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

            if let Some(info) = info_val {
                if let Ok(updated_info_str) = serde_json::to_string_pretty(&info) {
                    let _ = std::fs::write(dest_dir.join("Info.json"), updated_info_str);
                }
            }

            // Enable mod in PalModSettings.ini
            let ini_path = std::path::Path::new(&install_path)
                .join("Mods")
                .join("PalModSettings.ini");
            
            enable_mod_in_ini(&ini_path, &package_name)?;

            log::info!("[WORKSHOP] Successfully installed official mod {} as {}", workshop_id, package_name);

            let msg = if is_local_client_fallback {
                format!("Successfully installed official Workshop Mod \"{}\" from local Steam library.", package_name)
            } else {
                format!("Successfully downloaded and installed official Workshop Mod \"{}\".", package_name)
            };

            Ok(WorkshopDownloadResult {
                success: true,
                message: msg,
                mod_name: Some(package_name),
            })
        } else {
            // Fallback: Copy mod files to the server's Workshop directory and generate a default Info.json
            let dest_dir = std::path::Path::new(&install_path)
                .join("Mods")
                .join("Workshop")
                .join(&workshop_id);

            std::fs::create_dir_all(&dest_dir)
                .map_err(|e| format!("Failed to create Mods/Workshop directory: {}", e))?;

            let mut copied_files = Vec::new();
            copy_dir_contents(&content_dir, &dest_dir, &mut copied_files)
                .map_err(|e| format!("Failed to copy mod files to workshop directory: {}", e))?;

            // Generate default Info.json
            let package_name = format!("Workshop_{}", workshop_id);
            
            // Scan dest_dir for any .pak files recursively and get relative paths
            let mut paks = Vec::new();
            fn collect_paks_relative(root: &std::path::Path, current: &std::path::Path, paks: &mut Vec<String>) {
                if current.is_dir() {
                    if let Ok(entries) = std::fs::read_dir(current) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_dir() {
                                collect_paks_relative(root, &path, paks);
                            } else if path.is_file() {
                                if let Some(ext) = path.extension() {
                                    if ext == "pak" {
                                        if let Ok(rel) = path.strip_prefix(root) {
                                            paks.push(rel.to_string_lossy().replace("\\", "/"));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            collect_paks_relative(&dest_dir, &dest_dir, &mut paks);

            let is_logic = is_logic_mod.unwrap_or(false);
            let info_content = serde_json::json!({
                "PackageName": package_name,
                "Version": "1.0.0",
                "IsServer": true,
                "DisplayName": mod_title.clone().unwrap_or_else(|| package_name.clone()),
                "InstallRule": {
                    "Paks": if is_logic { vec![] } else { paks.clone() },
                    "LogicMods": if is_logic { paks.clone() } else { vec![] }
                }
            });

            if let Ok(info_str) = serde_json::to_string_pretty(&info_content) {
                let _ = std::fs::write(dest_dir.join("Info.json"), info_str);
            }

            // Enable mod in PalModSettings.ini
            let ini_path = std::path::Path::new(&install_path)
                .join("Mods")
                .join("PalModSettings.ini");
            
            enable_mod_in_ini(&ini_path, &package_name)?;

            log::info!("[WORKSHOP] Successfully installed legacy workshop item {} as official mod {}", workshop_id, package_name);

            let msg = if is_local_client_fallback {
                format!("Successfully installed Workshop Mod \"{}\" from local Steam library.", package_name)
            } else {
                format!("Successfully downloaded and installed Workshop Mod \"{}\".", package_name)
            };

            Ok(WorkshopDownloadResult {
                success: true,
                message: msg,
                mod_name: Some(package_name),
            })
        }
    } else {
        log::error!("[WORKSHOP] Download failed. SteamCMD output: {}", stdout);
        
        let custom_msg = if stdout.contains("Steam Guard") || stdout.contains("Two-Factor") || stderr.contains("Steam Guard") || stderr.contains("Two-Factor") {
            format!(
                "Failed to download workshop item {}. SteamCMD requires a Steam Guard code. \
                Please log in manually once in your server's terminal by running:\n\
                steamcmd.exe +login {}\n\
                and enter your password/Steam Guard code to cache your credentials.",
                workshop_id, login_user
            )
        } else if stdout.contains("login failed") || stdout.contains("Login Failed") || stderr.contains("login failed") || stderr.contains("Login Failed") {
            format!(
                "Failed to download workshop item {}. SteamCMD login failed for user '{}'. \
                Please verify your username or run SteamCMD manually to cache valid credentials.",
                workshop_id, login_user
            )
        } else if login_user == "anonymous" {
            format!(
                "Failed to download workshop item {}. Paid games like Palworld do not support anonymous downloads. \
                Please enter your Steam username in the Settings tab, log in once via SteamCMD to cache credentials, or subscribe to the mod in your Steam client to import it locally.",
                workshop_id
            )
        } else {
            format!(
                "Failed to download workshop item {}. Paid games require owning the game on the account logged into SteamCMD. \
                SteamCMD output:\n{}\n{}",
                workshop_id, stdout, stderr
            )
        };

        Ok(WorkshopDownloadResult {
            success: false,
            message: custom_msg,
            mod_name: None,
        })
    }
}

/// Check if UE4SS is installed for a server
#[tauri::command]
pub async fn check_ue4ss_installed(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<bool, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let ue4ss_dll = std::path::Path::new(&install_path)
        .join("Pal")
        .join("Binaries")
        .join("Win64")
        .join("UE4SS.dll");

    let ue4ss_settings = std::path::Path::new(&install_path)
        .join("Pal")
        .join("Binaries")
        .join("Win64")
        .join("UE4SS-settings.ini");

    Ok(ue4ss_dll.exists() || ue4ss_settings.exists())
}

/// Install UE4SS to the server
#[tauri::command]
pub async fn install_ue4ss(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<String, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let target_dir = std::path::Path::new(&install_path)
        .join("Pal")
        .join("Binaries")
        .join("Win64");

    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create target directory: {}", e))?;

    // Download latest UE4SS release from GitHub
    let ue4ss_url = "https://github.com/UE4SS-RE/RE-UE4SS/releases/latest/download/UE4SS_v3.0.1.zip";
    
    log::info!("[UE4SS] Downloading UE4SS for server {}", server_id);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client.get(ue4ss_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download UE4SS: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("UE4SS download failed with status: {}", resp.status()));
    }

    let bytes = resp.bytes()
        .await
        .map_err(|e| format!("Failed to read UE4SS download: {}", e))?;

    // Extract the zip to the target directory
    let reader = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| format!("Failed to open UE4SS zip: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        
        let name = file.name().to_string();
        let outpath = target_dir.join(&name);

        if file.is_dir() {
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create dir: {}", e))?;
        } else {
            if let Some(p) = outpath.parent() {
                std::fs::create_dir_all(p)
                    .map_err(|e| format!("Failed to create parent dir: {}", e))?;
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
    }

    log::info!("[UE4SS] Successfully installed UE4SS for server {}", server_id);
    Ok("UE4SS installed successfully! Restart the server to activate.".to_string())
}

/// Helper: Recursively copy directory contents
pub fn copy_dir_contents(
    src: &std::path::Path,
    dst: &std::path::Path,
    copied_files: &mut Vec<String>,
) -> Result<(), std::io::Error> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        
        if path.is_dir() {
            let dst_sub = dst.join(&file_name);
            std::fs::create_dir_all(&dst_sub)?;
            copy_dir_contents(&path, &dst_sub, copied_files)?;
        } else {
            let dst_file = dst.join(&file_name);
            std::fs::copy(&path, &dst_file)?;
            copied_files.push(file_name);
        }
    }
    Ok(())
}

pub fn find_info_json(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.file_name().unwrap_or_default() == "Info.json" {
                return Some(path);
            }
            if path.is_dir() {
                if let Some(found) = find_info_json(&path) {
                    return Some(found);
                }
            }
        }
    }
    None
}

fn get_all_steam_library_workshop_dirs(app_id: &str) -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    
    // Get primary steam directory from registry
    let mut primary_steam_dir = None;
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("SteamPath") {
                    let parts: Vec<&str> = line.split("REG_SZ").collect();
                    if parts.len() > 1 {
                        let path_str = parts[1].trim().replace("/", "\\");
                        let path = std::path::PathBuf::from(path_str);
                        if path.exists() {
                            primary_steam_dir = Some(path);
                        }
                    }
                }
            }
        }
    }

    if let Some(steam_dir) = primary_steam_dir {
        // 1. Add the primary steam workshop folder
        dirs.push(steam_dir.join("steamapps").join("workshop").join("content").join(app_id));

        // 2. Read libraryfolders.vdf to find secondary libraries
        let vdf_path = steam_dir.join("steamapps").join("libraryfolders.vdf");
        if vdf_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&vdf_path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.contains("\"path\"") {
                        // Extract value between quotes after "path"
                        let parts: Vec<&str> = trimmed.split('"').collect();
                        if parts.len() >= 4 {
                            let path_str = parts[3].replace("\\\\", "\\");
                            let path = std::path::PathBuf::from(path_str);
                            if path.exists() {
                                dirs.push(path.join("steamapps").join("workshop").join("content").join(app_id));
                            }
                        }
                    }
                }
            }
        }
    }

    dirs
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
