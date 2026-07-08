/// Network Utilities — Port checking, public IP detection

use std::net::TcpListener;

pub struct NetworkUtils;

impl NetworkUtils {
    /// Check if a port is available
    pub fn is_port_available(port: u16) -> bool {
        TcpListener::bind(format!("0.0.0.0:{}", port)).is_ok()
    }

    /// Get the public IP address
    pub async fn get_public_ip() -> Result<String, String> {
        let response = reqwest::get("https://api.ipify.org")
            .await
            .map_err(|e| format!("Failed to get public IP: {}", e))?;

        response
            .text()
            .await
            .map_err(|e| format!("Failed to read IP response: {}", e))
    }

    /// Get the local IP address
    pub fn get_local_ip() -> Result<String, String> {
        local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .map_err(|e| format!("Failed to get local IP: {}", e))
    }

    /// Find the next available port starting from the given port
    pub fn find_available_port(start_port: u16) -> u16 {
        let mut port = start_port;
        while port < 65535 {
            if Self::is_port_available(port) {
                return port;
            }
            port += 1;
        }
        start_port
    }
}
