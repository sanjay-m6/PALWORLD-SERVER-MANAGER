/// SteamCMD Service
///
/// Downloads, installs, and manages SteamCMD for Palworld Dedicated Server installation.
/// Palworld Dedicated Server Steam App ID: 2394010

use std::io::Cursor;
use std::path::PathBuf;
use anyhow::{Result, Context};

const PALWORLD_SERVER_APP_ID: &str = "2394010";
const STEAMCMD_URL: &str = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

pub struct SteamCmdService {
    base_dir: PathBuf,
}

impl SteamCmdService {
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    pub fn get_steamcmd_dir(&self) -> PathBuf {
        self.base_dir.join("steamcmd")
    }

    pub fn get_steamcmd_exe(&self) -> PathBuf {
        self.get_steamcmd_dir().join("steamcmd.exe")
    }

    pub fn is_installed(&self) -> bool {
        self.get_steamcmd_exe().exists()
    }

    /// Download and install SteamCMD
    pub async fn install(&self) -> Result<()> {
        let install_dir = self.get_steamcmd_dir();
        if !install_dir.exists() {
            std::fs::create_dir_all(&install_dir)?;
        }

        log::info!("[STEAMCMD] Downloading SteamCMD from {}", STEAMCMD_URL);
        let response = reqwest::get(STEAMCMD_URL)
            .await
            .context("Failed to download SteamCMD")?;

        let bytes = response.bytes().await.context("Failed to read SteamCMD download")?;

        let target_dir = install_dir.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
            archive.extract(&target_dir)?;
            Ok(())
        }).await??;

        log::info!("[STEAMCMD] Installed at {:?}", install_dir);
        Ok(())
    }

    /// Install or update Palworld Dedicated Server
    pub async fn install_palworld_server(&self, app_handle: tauri::AppHandle, install_path: &str) -> Result<String> {
        let steamcmd_exe = self.get_steamcmd_exe();
        if !steamcmd_exe.exists() {
            anyhow::bail!("SteamCMD not installed. Please install SteamCMD first.");
        }

        std::fs::create_dir_all(install_path)?;

        // Cleanup corrupted SteamCMD downloading state if it exists
        let downloading_path = std::path::PathBuf::from(install_path).join("steamapps").join("downloading");
        if downloading_path.exists() {
            log::info!("[STEAMCMD] Cleaning up existing downloading directory to prevent corruption");
            let _ = std::fs::remove_dir_all(&downloading_path);
        }

        log::info!("[STEAMCMD] Installing Palworld server to {}", install_path);

        use tokio::io::AsyncBufReadExt;
        use tauri::Emitter;

        #[derive(Clone, serde::Serialize)]
        #[serde(rename_all = "camelCase")]
        struct InstallProgressPayload {
            install_path: String,
            status: String,
            progress: f32,
            bytes_downloaded: u64,
            bytes_total: u64,
        }

        #[derive(Clone, serde::Serialize)]
        #[serde(rename_all = "camelCase")]
        struct InstallLogPayload {
            install_path: String,
            line: String,
        }

        let mut child = tokio::process::Command::new(&steamcmd_exe)
            .args([
                "+force_install_dir", install_path,
                "+login", "anonymous",
                "+app_update", PALWORLD_SERVER_APP_ID,
                "validate",
                "+quit",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("Failed to spawn SteamCMD")?;

        use tokio::io::AsyncReadExt;
        let mut stdout = child.stdout.take().context("Failed to get stdout")?;
        let mut buffer = [0u8; 1024];
        let mut accumulated = Vec::new();
        let mut full_stdout = String::new();

        // e.g. "Update state (0x61) downloading, progress: 1.25 (1254321 / 100000000)"
        let progress_re = regex::Regex::new(
            r"Update state \((0x[0-9a-fA-F]+)\) ([^,]+), progress: ([0-9.]+)\s+\((\d+)\s+/\s+(\d+)\)"
        ).unwrap();

        while let Ok(n) = stdout.read(&mut buffer).await {
            if n == 0 {
                break;
            }

            for &byte in &buffer[..n] {
                if byte == b'\n' || byte == b'\r' {
                    if !accumulated.is_empty() {
                        let line_str = String::from_utf8_lossy(&accumulated).to_string();
                        let trimmed = line_str.trim();
                        if !trimmed.is_empty() {
                            log::info!("[STEAMCMD] {}", trimmed);
                            full_stdout.push_str(trimmed);
                            full_stdout.push('\n');

                            let _ = app_handle.emit("install-log", InstallLogPayload {
                                install_path: install_path.to_string(),
                                line: format!("{}\n", trimmed),
                            });

                            if let Some(caps) = progress_re.captures(trimmed) {
                                let status = caps.get(2).map_or("", |m| m.as_str());
                                let progress: f32 = caps.get(3).map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
                                let downloaded: u64 = caps.get(4).map_or(0, |m| m.as_str().parse().unwrap_or(0));
                                let total: u64 = caps.get(5).map_or(0, |m| m.as_str().parse().unwrap_or(0));

                                let _ = app_handle.emit("install-progress", InstallProgressPayload {
                                    install_path: install_path.to_string(),
                                    status: status.to_string(),
                                    progress,
                                    bytes_downloaded: downloaded,
                                    bytes_total: total,
                                });
                            }
                        }
                        accumulated.clear();
                    }
                } else {
                    accumulated.push(byte);
                }
            }
        }

        if !accumulated.is_empty() {
            let line_str = String::from_utf8_lossy(&accumulated).to_string();
            let trimmed = line_str.trim();
            if !trimmed.is_empty() {
                log::info!("[STEAMCMD] {}", trimmed);
                full_stdout.push_str(trimmed);
                full_stdout.push('\n');

                let _ = app_handle.emit("install-log", InstallLogPayload {
                    install_path: install_path.to_string(),
                    line: format!("{}\n", trimmed),
                });
            }
        }

        let status = child.wait().await?;
        if !status.success() {
            let stderr = child.stderr.take();
            let stderr_str = if let Some(stderr_stream) = stderr {
                let mut reader = tokio::io::BufReader::new(stderr_stream);
                let mut err_line = String::new();
                let mut err_accum = String::new();
                while reader.read_line(&mut err_line).await.unwrap_or(0) > 0 {
                    err_accum.push_str(&err_line);
                    err_line.clear();
                }
                err_accum
            } else {
                "Unknown error".to_string()
            };
            log::error!("[STEAMCMD] Install failed: {}", stderr_str);
            anyhow::bail!("SteamCMD failed with exit code {:?}. stderr: {}", status.code(), stderr_str);
        }

        log::info!("[STEAMCMD] Palworld server installed successfully");

        // Emit final success event
        let _ = app_handle.emit("install-progress", InstallProgressPayload {
            install_path: install_path.to_string(),
            status: "finished".to_string(),
            progress: 100.0,
            bytes_downloaded: 0,
            bytes_total: 0,
        });

        Ok(full_stdout)
    }

    /// Update an existing Palworld server installation
    pub async fn update_server(&self, app_handle: tauri::AppHandle, install_path: &str) -> Result<String> {
        self.install_palworld_server(app_handle, install_path).await
    }

    /// Validate server files
    pub async fn validate_server(&self, app_handle: tauri::AppHandle, install_path: &str) -> Result<String> {
        self.install_palworld_server(app_handle, install_path).await
    }

    /// Repair SteamCMD installation
    pub async fn repair(&self) -> Result<()> {
        let install_dir = self.get_steamcmd_dir();

        // Remove exe and cache but keep steamapps
        let exe_path = install_dir.join("steamcmd.exe");
        if exe_path.exists() {
            let _ = std::fs::remove_file(&exe_path);
        }

        for subdir in ["appcache", "package"] {
            let dir = install_dir.join(subdir);
            if dir.exists() {
                let _ = std::fs::remove_dir_all(&dir);
            }
        }

        log::info!("[STEAMCMD] Repairing - re-downloading...");
        self.install().await
    }
}
