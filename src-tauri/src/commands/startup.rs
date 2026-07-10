/// Windows Startup Commands — Auto-launch on boot via Registry

use tauri::State;
use crate::AppState;



/// Check if the app is registered for Windows startup
#[tauri::command]
pub fn get_startup_enabled() -> Result<bool, String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let mut cmd = Command::new("reg");
        cmd.args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "PalworldServerManager",
        ]);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let output = cmd.output()
            .map_err(|e| format!("Registry query failed: {}", e))?;

        Ok(output.status.success())
    }

    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

/// Enable or disable Windows startup auto-launch
#[tauri::command]
pub fn set_startup_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;

        if enabled {
            // Get the current executable path
            let exe_path = std::env::current_exe()
                .map_err(|e| format!("Failed to get exe path: {}", e))?;
            let exe_str = exe_path.to_string_lossy();

            let mut cmd = Command::new("reg");
            cmd.args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "PalworldServerManager",
                "/t",
                "REG_SZ",
                "/d",
                &format!("\"{}\"", exe_str),
                "/f",
            ]);

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }

            let output = cmd.output()
                .map_err(|e| format!("Registry write failed: {}", e))?;

            if !output.status.success() {
                return Err(format!(
                    "Failed to add startup entry: {}",
                    String::from_utf8_lossy(&output.stderr)
                ));
            }
        } else {
            let mut cmd = Command::new("reg");
            cmd.args([
                "delete",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "PalworldServerManager",
                "/f",
            ]);

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }

            let output = cmd.output()
                .map_err(|e| format!("Registry delete failed: {}", e))?;

            if !output.status.success() {
                // Key might not exist, which is fine
                let stderr = String::from_utf8_lossy(&output.stderr);
                if !stderr.contains("unable to find") && !stderr.contains("ERROR: The system was unable") {
                    return Err(format!("Failed to remove startup entry: {}", stderr));
                }
            }
        }

        Ok(())
    }

    #[cfg(not(windows))]
    {
        Err("Startup management is only available on Windows".to_string())
    }
}

/// Auto-start servers that have autoStart flag on app launch
#[tauri::command]
pub async fn auto_start_servers(
    state: State<'_, AppState>,
) -> Result<u32, String> {
    let servers_to_start: Vec<(i64, String, String, u16, u16, String)> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection()?;
        
        let mut stmt = conn.prepare(
            "SELECT id, install_path, startup_args, game_port, rcon_port, admin_password FROM servers WHERE auto_start = 1 AND status = 'stopped'"
        ).map_err(|e| format!("Query failed: {}", e))?;

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2).unwrap_or_default(),
                row.get::<_, u16>(3).unwrap_or(8211),
                row.get::<_, u16>(4).unwrap_or(25575),
                row.get::<_, String>(5).unwrap_or_default(),
            ))
        }).map_err(|e| format!("Query failed: {}", e))?;

        rows.filter_map(|r| r.ok()).collect()
    };

    let mut started = 0u32;
    for (server_id, install_path, startup_args, game_port, rcon_port, admin_password) in servers_to_start {
        // Update status to starting
        if let Ok(db) = state.db.lock() {
            let _ = db.update_server_status(server_id, "starting");
        }
        
        match state.process_manager.start_server(
            server_id,
            &install_path,
            &startup_args,
            game_port,
            rcon_port,
            &admin_password,
        ) {
            Ok(_) => {
                started += 1;
                log::info!("[STARTUP] Auto-started server ID {}", server_id);
            }
            Err(e) => {
                log::error!("[STARTUP] Failed to auto-start server ID {}: {}", server_id, e);
                if let Ok(db) = state.db.lock() {
                    let _ = db.update_server_status(server_id, "stopped");
                }
            }
        }
    }

    Ok(started)
}
