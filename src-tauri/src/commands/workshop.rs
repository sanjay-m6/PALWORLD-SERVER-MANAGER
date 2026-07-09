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

    // Palworld app ID for dedicated server
    let app_id = "1623730"; // Palworld dedicated server workshop
    
    // Run SteamCMD to download the workshop item
    let steamcmd_dir = state.steamcmd.get_steamcmd_dir();
    let steamcmd_exe = state.steamcmd.get_steamcmd_exe();

    if !steamcmd_exe.exists() {
        return Ok(WorkshopDownloadResult {
            success: false,
            message: "SteamCMD is not installed. Please install it first from the Overview tab.".to_string(),
            mod_name: None,
        });
    }

    log::info!("[WORKSHOP] Downloading workshop item {} for server {}", workshop_id, server_id);

    let output = tokio::process::Command::new(&steamcmd_exe)
        .args([
            "+login", "anonymous",
            "+workshop_download_item", app_id, &workshop_id,
            "+quit",
        ])
        .output()
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
        .join(app_id)
        .join(&workshop_id);

    if workshop_content_dir.exists() {
        // Copy mod files to the server's Paks directory
        let paks_dir = std::path::Path::new(&install_path)
            .join("Pal")
            .join("Content")
            .join("Paks");
        
        std::fs::create_dir_all(&paks_dir)
            .map_err(|e| format!("Failed to create Paks directory: {}", e))?;

        let mut copied_files = Vec::new();
        copy_dir_contents(&workshop_content_dir, &paks_dir, &mut copied_files)
            .map_err(|e| format!("Failed to copy mod files: {}", e))?;

        let mod_name = if copied_files.is_empty() {
            format!("Workshop_{}", workshop_id)
        } else {
            copied_files[0].clone()
        };

        log::info!("[WORKSHOP] Successfully installed workshop item {} ({} files)", workshop_id, copied_files.len());

        Ok(WorkshopDownloadResult {
            success: true,
            message: format!("Successfully downloaded and installed workshop item {}. {} files copied.", workshop_id, copied_files.len()),
            mod_name: Some(mod_name),
        })
    } else {
        log::error!("[WORKSHOP] Download failed. SteamCMD output: {}", stdout);
        Ok(WorkshopDownloadResult {
            success: false,
            message: format!("Failed to download workshop item {}. The item may not exist or may require authentication.\n\nSteamCMD output:\n{}", workshop_id, stderr),
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
fn copy_dir_contents(
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
