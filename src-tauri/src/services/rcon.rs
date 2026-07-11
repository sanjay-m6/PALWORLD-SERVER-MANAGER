/// RCON Client for Palworld Dedicated Servers
///
/// Implements the Source RCON protocol for communicating with Palworld servers.
/// Per the Source RCON spec, authentication requires handling TWO response packets:
///   1. An empty SERVERDATA_RESPONSE_VALUE packet
///   2. A SERVERDATA_AUTH_RESPONSE packet (ID == -1 means auth failed)

use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

const SERVERDATA_AUTH: i32 = 3;
const SERVERDATA_AUTH_RESPONSE: i32 = 2;
const SERVERDATA_EXECCOMMAND: i32 = 2;
const SERVERDATA_RESPONSE_VALUE: i32 = 0;

struct RconPacket {
    id: i32,
    packet_type: i32,
    body: String,
}

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

        // Authenticate using Source RCON protocol
        session.request_id += 1;
        let auth_request_id = session.request_id;

        // Send AUTH packet
        Self::write_packet(&mut session.stream, auth_request_id, SERVERDATA_AUTH, password).await?;

        // Per the Source RCON protocol specification, the server responds to
        // SERVERDATA_AUTH with TWO packets:
        //   1. An empty SERVERDATA_RESPONSE_VALUE packet (can be ignored)
        //   2. A SERVERDATA_AUTH_RESPONSE packet where:
        //      - ID == request_id means success
        //      - ID == -1 means authentication failed
        //
        // Some server implementations (including Palworld) may not always send
        // the first empty packet, so we read packets in a loop until we get
        // the AUTH_RESPONSE or hit a timeout.

        let auth_result = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            Self::read_auth_response(&mut session.stream, auth_request_id),
        )
        .await
        .map_err(|_| "RCON authentication timed out".to_string())?;

        match auth_result {
            Ok(true) => {
                log::info!("[RCON] Authentication successful for server {}", server_id);
            }
            Ok(false) => {
                return Err("RCON authentication failed. Check your admin password.".to_string());
            }
            Err(e) => {
                return Err(format!("RCON authentication error: {}", e));
            }
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

        session.request_id += 1;
        let request_id = session.request_id;

        match Self::write_packet(&mut session.stream, request_id, SERVERDATA_EXECCOMMAND, command).await {
            Ok(_) => {}
            Err(e) => {
                log::error!("[RCON] Failed to send command for server {}: {}", server_id, e);
                drop(session);
                let mut sessions = self.sessions.lock().await;
                sessions.remove(&server_id);
                return Err(format!("RCON command failed: {}. Connection lost, please reconnect.", e));
            }
        }

        match Self::read_packet(&mut session.stream).await {
            Ok(packet) => Ok(packet.body),
            Err(e) => {
                log::error!("[RCON] Command read failed for server {}: {}", server_id, e);
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

    /// Read the authentication response, handling the two-packet flow.
    /// Returns Ok(true) on success, Ok(false) on auth failure.
    async fn read_auth_response(
        stream: &mut TcpStream,
        _auth_request_id: i32,
    ) -> Result<bool, String> {
        // Read up to 2 packets. The server may send:
        //   1. An empty SERVERDATA_RESPONSE_VALUE (id matches or is -1)
        //   2. The SERVERDATA_AUTH_RESPONSE (type 2)
        // Some implementations only send one packet.
        for _ in 0..2 {
            let packet = Self::read_packet(stream).await?;

            log::debug!(
                "[RCON] Auth response packet: id={}, type={}, body_len={}",
                packet.id,
                packet.packet_type,
                packet.body.len()
            );

            // If this is the AUTH_RESPONSE packet (type 2), check the ID
            if packet.packet_type == SERVERDATA_AUTH_RESPONSE {
                if packet.id == -1 {
                    return Ok(false); // Auth failed
                }
                return Ok(true); // Auth succeeded
            }

            // If we got a RESPONSE_VALUE with id == -1, auth failed
            if packet.id == -1 {
                return Ok(false);
            }

            // Otherwise it's the empty RESPONSE_VALUE packet, continue to read
            // the actual AUTH_RESPONSE
        }

        // If we got here without an AUTH_RESPONSE, assume success
        // (some quirky implementations)
        Ok(true)
    }

    /// Write a single RCON packet to the stream
    async fn write_packet(
        stream: &mut TcpStream,
        request_id: i32,
        packet_type: i32,
        body: &str,
    ) -> Result<(), String> {
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

        stream
            .write_all(&packet)
            .await
            .map_err(|e| format!("Failed to send RCON packet: {}", e))?;

        Ok(())
    }

    /// Read a single RCON packet from the stream
    async fn read_packet(stream: &mut TcpStream) -> Result<RconPacket, String> {
        // Read size (4 bytes)
        let mut size_buf = [0u8; 4];
        stream
            .read_exact(&mut size_buf)
            .await
            .map_err(|e| format!("Failed to read RCON response size: {}", e))?;

        let response_size = i32::from_le_bytes(size_buf) as usize;
        if response_size > 65536 {
            return Err("RCON response too large".to_string());
        }
        if response_size < 10 {
            // Minimum: ID(4) + Type(4) + empty body null(1) + padding null(1) = 10
            return Err(format!("RCON response too short: {} bytes", response_size));
        }

        // Read the rest of the packet
        let mut response_buf = vec![0u8; response_size];
        stream
            .read_exact(&mut response_buf)
            .await
            .map_err(|e| format!("Failed to read RCON response: {}", e))?;

        // Parse: ID(4) + Type(4) + Body + null + null
        let response_id = i32::from_le_bytes([
            response_buf[0],
            response_buf[1],
            response_buf[2],
            response_buf[3],
        ]);

        let response_type = i32::from_le_bytes([
            response_buf[4],
            response_buf[5],
            response_buf[6],
            response_buf[7],
        ]);

        let body_end = response_buf.len().saturating_sub(2);
        let body = if body_end > 8 {
            String::from_utf8_lossy(&response_buf[8..body_end]).to_string()
        } else {
            String::new()
        };

        Ok(RconPacket {
            id: response_id,
            packet_type: response_type,
            body,
        })
    }
}
