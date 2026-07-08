/// Palworld REST API Client
///
/// Palworld's built-in REST API (default port 8212) provides server info,
/// player management, and metrics. This is a Palworld-unique feature not
/// found in ARK servers.

use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PalworldServerInfo {
    pub version: String,
    pub server_name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PalworldPlayerInfo {
    pub name: String,
    pub player_id: String,
    pub user_id: String,
    pub ip: String,
    pub ping: f64,
    pub location_x: f64,
    pub location_y: f64,
    pub level: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PalworldPlayersResponse {
    pub players: Vec<PalworldPlayerInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PalworldMetrics {
    pub current_player_num: u32,
    pub server_frame_time: f64,
    pub days: u32,
    pub uptime: u64,
}

pub struct PalworldRestApiClient {
    client: Client,
    base_url: String,
    admin_password: String,
}

impl PalworldRestApiClient {
    pub fn new(host: &str, port: u16, admin_password: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            base_url: format!("http://{}:{}", host, port),
            admin_password: admin_password.to_string(),
        }
    }

    /// Get server info
    pub async fn get_server_info(&self) -> Result<PalworldServerInfo, String> {
        let response = self.client
            .get(format!("{}/v1/api/info", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .send()
            .await
            .map_err(|e| format!("REST API request failed: {}", e))?;

        response
            .json::<PalworldServerInfo>()
            .await
            .map_err(|e| format!("Failed to parse server info: {}", e))
    }

    /// Get player list
    pub async fn get_players(&self) -> Result<Vec<PalworldPlayerInfo>, String> {
        let response = self.client
            .get(format!("{}/v1/api/players", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .send()
            .await
            .map_err(|e| format!("REST API request failed: {}", e))?;

        let players_response: PalworldPlayersResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse players: {}", e))?;

        Ok(players_response.players)
    }

    /// Get server metrics
    pub async fn get_metrics(&self) -> Result<PalworldMetrics, String> {
        let response = self.client
            .get(format!("{}/v1/api/metrics", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .send()
            .await
            .map_err(|e| format!("REST API request failed: {}", e))?;

        response
            .json::<PalworldMetrics>()
            .await
            .map_err(|e| format!("Failed to parse metrics: {}", e))
    }

    /// Kick a player
    pub async fn kick_player(&self, user_id: &str, message: &str) -> Result<(), String> {
        let body = serde_json::json!({
            "userid": user_id,
            "message": message,
        });

        self.client
            .post(format!("{}/v1/api/kick", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Kick request failed: {}", e))?;

        Ok(())
    }

    /// Ban a player
    pub async fn ban_player(&self, user_id: &str, message: &str) -> Result<(), String> {
        let body = serde_json::json!({
            "userid": user_id,
            "message": message,
        });

        self.client
            .post(format!("{}/v1/api/ban", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ban request failed: {}", e))?;

        Ok(())
    }

    /// Unban a player
    pub async fn unban_player(&self, user_id: &str) -> Result<(), String> {
        let body = serde_json::json!({
            "userid": user_id,
        });

        self.client
            .post(format!("{}/v1/api/unban", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Unban request failed: {}", e))?;

        Ok(())
    }

    /// Save the world
    pub async fn save_world(&self) -> Result<(), String> {
        self.client
            .post(format!("{}/v1/api/save", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .send()
            .await
            .map_err(|e| format!("Save request failed: {}", e))?;

        Ok(())
    }

    /// Shutdown the server
    pub async fn shutdown(&self, wait_time: u32, message: &str) -> Result<(), String> {
        let body = serde_json::json!({
            "waittime": wait_time,
            "message": message,
        });

        self.client
            .post(format!("{}/v1/api/shutdown", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Shutdown request failed: {}", e))?;

        Ok(())
    }

    /// Broadcast a message
    pub async fn broadcast(&self, message: &str) -> Result<(), String> {
        let body = serde_json::json!({
            "message": message,
        });

        self.client
            .post(format!("{}/v1/api/announce", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Broadcast request failed: {}", e))?;

        Ok(())
    }

    /// Check if the REST API is reachable
    pub async fn health_check(&self) -> bool {
        self.client
            .get(format!("{}/v1/api/info", self.base_url))
            .basic_auth("admin", Some(&self.admin_password))
            .send()
            .await
            .is_ok()
    }
}
