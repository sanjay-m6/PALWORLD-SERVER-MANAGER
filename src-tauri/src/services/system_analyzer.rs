/// System Analyzer — Hardware monitoring and performance stats

use sysinfo::System;
use crate::models::{SystemInfo, ProcessStats};

pub struct SystemAnalyzer;

impl SystemAnalyzer {
    pub fn get_system_info() -> SystemInfo {
        let mut sys = System::new_all();
        sys.refresh_all();

        SystemInfo {
            cpu_name: sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default(),
            cpu_cores: sys.cpus().len() as u32,
            cpu_usage: sys.global_cpu_usage(),
            total_memory_mb: sys.total_memory() / 1024 / 1024,
            used_memory_mb: sys.used_memory() / 1024 / 1024,
            available_memory_mb: sys.available_memory() / 1024 / 1024,
            os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
            os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        }
    }

    pub fn get_process_stats(pid: u32) -> Option<ProcessStats> {
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]), true);

        let process = sys.process(sysinfo::Pid::from_u32(pid))?;

        Some(ProcessStats {
            pid,
            cpu_usage: process.cpu_usage(),
            memory_mb: process.memory() / 1024 / 1024,
            uptime_seconds: process.run_time(),
            thread_count: 0, // sysinfo doesn't expose thread count directly
        })
    }
}
