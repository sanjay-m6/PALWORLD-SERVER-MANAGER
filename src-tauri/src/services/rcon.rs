/// RCON Client for Palworld Dedicated Servers
///
/// Implements the Source RCON protocol for communicating with Palworld servers.
/// Palworld uses standard RCON without ARK's quirks, making this implementation cleaner.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

const SERVERDATA_AUTH: i32 = 3;
const SERVERDATA_AUTH_RESPONSE: i32 = 2;
const SERVERDATA_EXECCOMMAND: i32 = 2;
const SERVERDATA_RESPONSE_VALUE: i32 = 0;

struct RconSession {
    stream: TcpStream,
    request_id: i32,
    address: String,
    port: u16,
    password: String,
}

#[derive(Clone)]
pub struct RconService {
    sessions: Arc<Mutex<HashMap<i64, Arc<Mutex<RconSession>>>>>,
}

impl RconService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Connect to a server's RCON
    pub async fn connect(
        &self,
        server_id: i64,
        address: &str,
        port: u16,
        password: &str,
    ) -> Result<String, String> {
        let addr = format!("{}:{}", address, port);
        log::info!("[RCON] Connecting to server {} at {}", server_id, addr);

        let stream = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            TcpStream::connect(&addr),
        )
        .await
        .map_err(|_| format!("Connection timed out to {}", addr))?
        .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;

        let mut session = RconSession {
            stream,
            request_id: 0,
            address: address.to_string(),
            port,
            password: password.to_string(),
        };

        // Authenticate
        let auth_response = Self::send_packet(&mut session, SERVERDATA_AUTH, password).await?;

        if auth_response.is_empty() || auth_response.contains("Authentication failed") {
            return Err("RCON authentication failed. Check your admin password.".to_string());
        }

        let session = Arc::new(Mutex::new(session));
        let mut sessions = self.sessions.lock().await;
        sessions.insert(server_id, session);

        log::info!("[RCON] Connected to server {}", server_id);
        Ok("Connected successfully".to_string())
    }

    /// Disconnect from a server
    pub async fn disconnect(&self, server_id: i64) -> Result<(), String> {
        let mut sessions = self.sessions.lock().await;
        sessions.remove(&server_id);
        log::info!("[RCON] Disconnected from server {}", server_id);
        Ok(())
    }

    /// Send an RCON command
    pub async fn send_command(&self, server_id: i64, command: &str) -> Result<String, String> {
        let session = {
            let sessions = self.sessions.lock().await;
            sessions
                .get(&server_id)
                .cloned()
                .ok_or_else(|| "Not connected to RCON. Please connect first.".to_string())?
        };

        let mut session = session.lock().await;
        log::info!("[RCON] Server {} executing: {}", server_id, command);

        match Self::send_packet(&mut session, SERVERDATA_EXECCOMMAND, command).await {
            Ok(response) => Ok(response),
            Err(e) => {
                log::error!("[RCON] Command failed for server {}: {}", server_id, e);
                // Try to reconnect
                drop(session);
                let mut sessions = self.sessions.lock().await;
                sessions.remove(&server_id);
                Err(format!("RCON command failed: {}. Connection lost, please reconnect.", e))
            }
        }
    }

    /// Check if connected to a server
    pub async fn is_connected(&self, server_id: i64) -> bool {
        let sessions = self.sessions.lock().await;
        sessions.contains_key(&server_id)
    }

    /// Parse ShowPlayers response into Player structs
    pub fn parse_player_list(response: &str) -> Vec<crate::models::Player> {
        let mut players = Vec::new();

        for line in response.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("name,") {
                continue; // Skip header or empty
            }

            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 3 {
                players.push(crate::models::Player {
                    name: parts[0].trim().to_string(),
                    player_uid: parts[1].trim().to_string(),
                    steam_id: parts[2].trim().to_string(),
                    join_time: None,
                    ping_ms: None,
                    is_admin: false,
                });
            }
        }

        players
    }

    // ─── Internal RCON Protocol ─────────────────────────────────────────────

    async fn send_packet(
        session: &mut RconSession,
        packet_type: i32,
        body: &str,
    ) -> Result<String, String> {
        session.request_id += 1;
        let request_id = session.request_id;

        // Build packet: Size(4) + ID(4) + Type(4) + Body(null) + Padding(null)
        let body_bytes = body.as_bytes();
        let size = 4 + 4 + body_bytes.len() as i32 + 2; // ID + Type + Body + 2 null terminators

        let mut packet = Vec::with_capacity(size as usize + 4);
        packet.extend_from_slice(&size.to_le_bytes());
        packet.extend_from_slice(&request_id.to_le_bytes());
        packet.extend_from_slice(&packet_type.to_le_bytes());
        packet.extend_from_slice(body_bytes);
        packet.push(0); // Body null terminator
        packet.push(0); // Packet null terminator

        session
            .stream
            .write_all(&packet)
            .await
            .map_err(|e| format!("Failed to send RCON packet: {}", e))?;

        // Read response
        let mut size_buf = [0u8; 4];
        session
            .stream
            .read_exact(&mut size_buf)
            .await
            .map_err(|e| format!("Failed to read RCON response size: {}", e))?;

        let response_size = i32::from_le_bytes(size_buf) as usize;
        if response_size > 65536 {
            return Err("RCON response too large".to_string());
        }

        let mut response_buf = vec![0u8; response_size];
        session
            .stream
            .read_exact(&mut response_buf)
            .await
            .map_err(|e| format!("Failed to read RCON response: {}", e))?;

        // Parse response: ID(4) + Type(4) + Body + null + null
        if response_buf.len() < 10 {
            return Err("RCON response too short".to_string());
        }

        let _response_id = i32::from_le_bytes([
            response_buf[0],
            response_buf[1],
            response_buf[2],
            response_buf[3],
        ]);

        let _response_type = i32::from_le_bytes([
            response_buf[4],
            response_buf[5],
            response_buf[6],
            response_buf[7],
        ]);

        let body_end = response_buf.len().saturating_sub(2);
        let body = String::from_utf8_lossy(&response_buf[8..body_end]).to_string();

        Ok(body)
    }
}
