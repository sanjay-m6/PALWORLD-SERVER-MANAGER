# 🎮 Palworld Server Manager

<div align="center">

![Palworld Server Manager Banner](public/banner.png)

A professional, real-time administration dashboard and mod curation system for **Palworld Dedicated Servers**. Manage server instances, configure properties, watch logs in real-time, automate backups, and install mods directly from Nexus Mods and Modrinth.

[![Discord Server](https://img.shields.io/discord/1524748938337320970?style=for-the-badge&logo=discord&logoColor=white&color=5865F2&label=Discord%20Server)](https://discord.gg/gSNpPXhecV)
[![Get Support](https://img.shields.io/badge/Get%20Support-Discord-blue?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/gSNpPXhecV)
[![Bug Reports](https://img.shields.io/badge/Bug%20Reports-Discord-red?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/gSNpPXhecV)

</div>

---

## 🌟 Key Features

* **⚡ Real-Time Console Monitor**
  * Watch live server console logs, stdout, and stderr streams instantly within the app.
* **📦 One-Click Mod Installation**
  * Browse, search, filter, and install mods directly from Nexus Mods and Modrinth database integrations.
* **💾 Automated Backup Engine**
  * Keep your save game data safe with automatic, scheduled ZIP backup creation and easy restoration.
* **⚙️ Visual Configuration Editor**
  * Customize all server parameters (`PalWorldSettings.ini`) visually with sliders, toggles, and preset configurations.
* **🌐 Easy Profile Presets**
  * Apply pre-configured difficulty presets (`Casual`, `Balanced`, `PvP`, `Hardcore`, `Performance`) with a single click.
* **🛡️ Integrated RCON Moderation**
  * Moderate your active server with live player tables, broadcast announcements, and admin controls (Kick, Ban, Save, Shutdown).
* **🔒 One-Click Firewall Configuration**
  * Automatically register and configure inbound and outbound Windows Firewall rules for your server ports.
* **🔄 Automated Restart Schedules**
  * Keep server performance optimal by scheduling routine restarts.
* **📈 Real-Time Server Telemetry**
  * Monitor active player count, server ping, memory, and CPU utilization live.

---

## 💬 Community, Support & Bug Reports

All support, discussions, and bug reports are handled through our official Discord server.

### 🚀 Get Involved
* **💬 General Chat**: Meet other hosts and discuss server setups in `#general`.
* **🛠️ Get Support**: Having installation or setup issues? Get help in `#installation-help` or `#server-setup`.
* **🐛 Report Bugs**: Found an issue? Open a ticket or report it using the template in `#bug-reports`.
* **💡 Suggest Features**: Suggest and vote on new ideas in `#feature-requests`.

<div align="center">

[👉 Join the Palworld Server Manager Discord 👈](https://discord.gg/gSNpPXhecV)

</div>

---

## 🚀 Getting Started

### Installation
1. Go to the [Releases](https://github.com/sanjay-m6/PALWORLD-SERVER-MANAGER/releases) page.
2. Download the latest `.exe` installer.
3. Run the installer and launch the app.
4. *The in-app updater will automatically check for and notify you of new updates.*

### Running Locally (For Contributors)
To run and develop the project on your local machine:

1. Clone this repository:
   ```bash
   git clone https://github.com/sanjay-m6/PALWORLD-SERVER-MANAGER.git
   cd PALWORLD-SERVER-MANAGER
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the application in development mode:
   ```bash
   npm run tauri dev
   ```
4. Build the application for production:
   ```bash
   npm run tauri build
   ```

---

## 📝 License & Credits

* **Developer**: Sanjay
* **Copyright**: Copyright © 2026 Sanjay. All rights reserved.
