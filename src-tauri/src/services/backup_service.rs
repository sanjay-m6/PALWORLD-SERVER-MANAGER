/// Backup Service
///
/// Manages backup creation, restoration, and retention for Palworld server saves.

use std::fs;
use std::path::{Path, PathBuf};
use chrono::Local;
use zip::write::SimpleFileOptions;
use walkdir::WalkDir;

pub struct BackupService;

impl BackupService {
    /// Create a backup of a server's save data and config
    pub fn create_backup(
        install_path: &str,
        backup_dir: &str,
        label: Option<&str>,
        include_configs: bool,
        include_saves: bool,
    ) -> Result<(PathBuf, i64), String> {
        let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_name = if let Some(label) = label {
            format!("backup_{}_{}.zip", label.replace(' ', "_"), timestamp)
        } else {
            format!("backup_{}.zip", timestamp)
        };

        let backup_path = PathBuf::from(backup_dir).join(&backup_name);
        fs::create_dir_all(backup_dir)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;

        let file = fs::File::create(&backup_path)
            .map_err(|e| format!("Failed to create backup file: {}", e))?;

        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .compression_level(Some(6));

        let install = PathBuf::from(install_path);

        // Backup save files
        if include_saves {
            let save_dir = install.join("Pal").join("Saved").join("SaveGames");
            if save_dir.exists() {
                Self::add_directory_to_zip(&mut zip, &save_dir, "SaveGames", options)?;
            }
        }

        // Backup config files
        if include_configs {
            let config_dir = install.join("Pal").join("Saved").join("Config");
            if config_dir.exists() {
                Self::add_directory_to_zip(&mut zip, &config_dir, "Config", options)?;
            }
        }

        zip.finish().map_err(|e| format!("Failed to finalize backup: {}", e))?;

        let size = fs::metadata(&backup_path)
            .map(|m| m.len() as i64)
            .unwrap_or(0);

        log::info!("[BACKUP] Created backup at {:?} ({} bytes)", backup_path, size);
        Ok((backup_path, size))
    }

    /// Restore a backup to a server
    pub fn restore_backup(backup_path: &str, install_path: &str) -> Result<(), String> {
        let backup_file = fs::File::open(backup_path)
            .map_err(|e| format!("Failed to open backup: {}", e))?;

        let mut archive = zip::ZipArchive::new(backup_file)
            .map_err(|e| format!("Invalid backup archive: {}", e))?;

        let target = PathBuf::from(install_path).join("Pal").join("Saved");

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)
                .map_err(|e| format!("Failed to read archive entry: {}", e))?;

            let out_path = target.join(entry.name());

            if entry.is_dir() {
                fs::create_dir_all(&out_path)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            } else {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent dir: {}", e))?;
                }
                let mut outfile = fs::File::create(&out_path)
                    .map_err(|e| format!("Failed to create file: {}", e))?;
                std::io::copy(&mut entry, &mut outfile)
                    .map_err(|e| format!("Failed to write file: {}", e))?;
            }
        }

        log::info!("[BACKUP] Restored backup from {:?}", backup_path);
        Ok(())
    }

    /// Apply retention policy — delete old backups
    pub fn apply_retention(backup_dir: &str, max_count: usize) -> Result<u32, String> {
        let mut backups: Vec<_> = fs::read_dir(backup_dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension().map(|ext| ext == "zip").unwrap_or(false)
            })
            .collect();

        if backups.len() <= max_count {
            return Ok(0);
        }

        // Sort by modified time (newest first)
        backups.sort_by(|a, b| {
            b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                .cmp(&a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH))
        });

        let mut deleted = 0u32;
        for backup in backups.into_iter().skip(max_count) {
            if fs::remove_file(backup.path()).is_ok() {
                deleted += 1;
            }
        }

        Ok(deleted)
    }

    fn add_directory_to_zip(
        zip: &mut zip::ZipWriter<fs::File>,
        source_dir: &Path,
        prefix: &str,
        options: SimpleFileOptions,
    ) -> Result<(), String> {
        for entry in WalkDir::new(source_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            let relative = path.strip_prefix(source_dir).unwrap_or(path);
            let archive_path = format!("{}/{}", prefix, relative.to_string_lossy());

            if path.is_dir() {
                zip.add_directory(&archive_path, options)
                    .map_err(|e| format!("Failed to add directory to zip: {}", e))?;
            } else {
                zip.start_file(&archive_path, options)
                    .map_err(|e| format!("Failed to start file in zip: {}", e))?;
                let mut file = fs::File::open(path)
                    .map_err(|e| format!("Failed to open source file: {}", e))?;
                std::io::copy(&mut file, zip)
                    .map_err(|e| format!("Failed to copy to zip: {}", e))?;
            }
        }
        Ok(())
    }
}
