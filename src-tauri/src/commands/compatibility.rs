use crate::AppState;
use crate::commands::system::list_installed_mods;
use tauri::State;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::fs;
use std::time::SystemTime;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModCompatibilityResult {
    pub name: String,
    pub path: String,
    pub status: String, // "compatible", "outdated", "unknown"
    pub is_logic_mod: bool,
    pub is_workshop_mod: bool,
    pub mod_version: String,
    pub last_updated: String,
}

#[tauri::command]
pub async fn check_mod_compatibility(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<ModCompatibilityResult>, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let server_exe = Path::new(&install_path).join("PalServer.exe");
    let game_server_mtime = if server_exe.exists() {
        fs::metadata(&server_exe)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH)
    } else {
        SystemTime::UNIX_EPOCH
    };

    let installed_mods = list_installed_mods(state.clone(), server_id).await?;
    let mut results = Vec::new();

    for m in installed_mods {
        let mod_path = Path::new(&m.path);
        let mod_mtime = if mod_path.exists() {
            fs::metadata(mod_path)
                .and_then(|meta| meta.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH)
        } else {
            SystemTime::UNIX_EPOCH
        };

        // Format system time to human readable ISO string
        let formatted_mtime = if mod_mtime != SystemTime::UNIX_EPOCH {
            let datetime: chrono::DateTime<chrono::Local> = mod_mtime.into();
            datetime.format("%Y-%m-%d %H:%M:%S").to_string()
        } else {
            "Unknown".to_string()
        };

        // Determine compatibility status
        let status = if game_server_mtime == SystemTime::UNIX_EPOCH || mod_mtime == SystemTime::UNIX_EPOCH {
            "unknown".to_string()
        } else if mod_mtime < game_server_mtime {
            // Mod is older than the last game server update
            "outdated".to_string()
        } else {
            "compatible".to_string()
        };

        results.push(ModCompatibilityResult {
            name: m.name,
            path: m.path,
            status,
            is_logic_mod: m.is_logic_mod,
            is_workshop_mod: m.is_workshop_mod.unwrap_or(false),
            mod_version: m.version.unwrap_or_else(|| "1.0.0".to_string()),
            last_updated: formatted_mtime,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn clean_mod_residue(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<String, String> {
    let install_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server_install_path(server_id)?
    };

    let base_path = PathBuf::from(&install_path);
    let paks_dir = base_path.join("Pal").join("Content").join("Paks");
    let logic_mods_dir = paks_dir.join("LogicMods");
    let legacy_mods_dir = paks_dir.join("~mods");
    let binaries_win64_dir = base_path.join("Pal").join("Binaries").join("Win64");

    let mut deleted_files = Vec::new();

    // Fetch active (enabled) mods
    let installed_mods = list_installed_mods(state.clone(), server_id).await?;
    let active_mod_paths: std::collections::HashSet<String> = installed_mods
        .iter()
        .filter(|m| m.enabled)
        .map(|m| m.path.clone())
        .collect();

    // Helper function to scan and clean orphaned .pak files
    let mut clean_pak_folder = |dir: &Path| -> Result<(), String> {
        if dir.exists() && dir.is_dir() {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(ext) = path.extension() {
                            let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                            // Skip base game files!
                            if file_name.starts_with("Pal-") {
                                continue;
                            }
                            if ext == "pak" || ext == "disabled" {
                                let path_str = path.to_string_lossy().to_string();
                                if !active_mod_paths.contains(&path_str) {
                                    if let Ok(_) = fs::remove_file(&path) {
                                        deleted_files.push(file_name.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    };

    // Clean Paks folders
    clean_pak_folder(&paks_dir)?;
    clean_pak_folder(&logic_mods_dir)?;
    clean_pak_folder(&legacy_mods_dir)?;

    // Clean legacy folder if empty
    if legacy_mods_dir.exists() && legacy_mods_dir.is_dir() {
        if let Ok(mut entries) = fs::read_dir(&legacy_mods_dir) {
            if entries.next().is_none() {
                let _ = fs::remove_dir(&legacy_mods_dir);
            }
        }
    }

    // Clean WorkshopMods folder
    let workshop_mods_dir = paks_dir.join("~WorkshopMods");
    if workshop_mods_dir.exists() && workshop_mods_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&workshop_mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let folder_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let is_active = installed_mods.iter().any(|m| m.enabled && m.name == folder_name);
                    if !is_active {
                        if let Ok(_) = fs::remove_dir_all(&path) {
                            deleted_files.push(format!("~WorkshopMods/{}", folder_name));
                        }
                    }
                }
            }
        }
        // If the whole ~WorkshopMods folder is empty, delete it
        if let Ok(mut entries) = fs::read_dir(&workshop_mods_dir) {
            if entries.next().is_none() {
                let _ = fs::remove_dir(&workshop_mods_dir);
            }
        }
    }

    // Clean orphaned UE4SS injector files if no script/logic mods are active
    let has_active_script_mods = installed_mods.iter().any(|m| m.enabled && m.is_logic_mod);
    if !has_active_script_mods && binaries_win64_dir.exists() {
        let ue4ss_files = vec![
            "dwmapi.dll",
            "xinput1_3.dll",
            "UE4SS.dll",
            "UE4SS-settings.ini",
            "UE4SS-settings.json",
        ];
        for f in ue4ss_files {
            let file_path = binaries_win64_dir.join(f);
            if file_path.exists() {
                if let Ok(_) = fs::remove_file(&file_path) {
                    deleted_files.push(f.to_string());
                }
            }
        }

        // Clean UE4SS Mods folder
        let ue4ss_mods_dir = binaries_win64_dir.join("Mods");
        if ue4ss_mods_dir.exists() && ue4ss_mods_dir.is_dir() {
            if let Ok(_) = fs::remove_dir_all(&ue4ss_mods_dir) {
                deleted_files.push("Binaries/Win64/Mods/".to_string());
            }
        }
    }

    if deleted_files.is_empty() {
        Ok("No orphaned mod residue or leftover files found.".to_string())
    } else {
        Ok(format!(
            "Successfully cleaned up residue. Deleted files/folders:\n{}",
            deleted_files.join("\n")
        ))
    }
}
