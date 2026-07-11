import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/useAppStore';
import type { Server, ServerStatus } from '../stores/useAppStore';

// ─── Tauri Command Wrappers ─────────────────────────────────────────────────

export const tauriCommands = {
  // Server commands
  getServers: () => invoke<Server[]>('get_servers'),
  createServer: (request: any) => invoke<Server>('create_server', { request }),
  deleteServer: (serverId: number, backupFirst: boolean, deleteFiles: boolean) =>
    invoke<void>('delete_server', { serverId, backupFirst, deleteFiles }),
  startServer: (serverId: number) => invoke<void>('start_server', { serverId }),
  stopServer: (serverId: number, force: boolean) =>
    invoke<void>('stop_server', { serverId, force }),
  restartServer: (serverId: number) => invoke<void>('restart_server', { serverId }),
  getServerStatus: (serverId: number) =>
    invoke<{ isRunning: boolean; pid: number | null; uptimeSeconds: number | null; cpuUsage: number | null; memoryMb: number | null }>('get_server_status', { serverId }),
  updateServerBranch: (serverId: number, branch: string) =>
    invoke<void>('update_server_branch', { serverId, branch }),
  updateServerAutoStart: (serverId: number, autoStart: boolean) =>
    invoke<void>('update_server_auto_start', { serverId, autoStart }),
  updateServerAutoRestart: (serverId: number, autoRestart: boolean) =>
    invoke<void>('update_server_auto_restart', { serverId, autoRestart }),
  updateServerRunAsAdmin: (serverId: number, runAsAdmin: boolean) =>
    invoke<void>('update_server_run_as_admin', { serverId, runAsAdmin }),
  wipeServer: (serverId: number, wipeSaves: boolean, wipeConfigs: boolean) =>
    invoke<void>('wipe_server', { serverId, wipeSaves, wipeConfigs }),

  // Config commands
  getServerConfig: (serverId: number) => invoke<any>('get_server_config', { serverId }),
  saveServerConfig: (serverId: number, config: any) =>
    invoke<void>('save_server_config', { serverId, config }),
  allocatePorts: (serverId: number) =>
    invoke<{ gamePort: number; rconPort: number; restApiPort: number }>('allocate_ports', { serverId }),
  openFirewallPorts: (serverName: string, gamePort: number, rconPort: number, restApiPort: number) =>
    invoke<void>('open_firewall_ports', { serverName, gamePort, rconPort, restApiPort }),
  checkFirewallStatus: (serverName: string) =>
    invoke<{ gamePortAllowed: boolean; rconPortAllowed: boolean; restApiPortAllowed: boolean }>('check_firewall_status', { serverName }),
  getRawConfig: (serverId: number) => invoke<string>('get_raw_config', { serverId }),
  saveRawConfig: (serverId: number, content: string) =>
    invoke<void>('save_raw_config', { serverId, content }),
  getConfigPresets: () => invoke<any[]>('get_config_presets'),
  applyPreset: (serverId: number, preset: string) =>
    invoke<any>('apply_preset', { serverId, preset }),

  // RCON commands
  rconConnect: (serverId: number) => invoke<any>('rcon_connect', { serverId }),
  rconDisconnect: (serverId: number) => invoke<void>('rcon_disconnect', { serverId }),
  rconSendCommand: (serverId: number, command: string) =>
    invoke<any>('rcon_send_command', { serverId, command }),
  getPlayerList: (serverId: number) => invoke<any[]>('get_player_list', { serverId }),
  kickPlayer: (serverId: number, steamId: string) =>
    invoke<any>('kick_player', { serverId, steamId }),
  banPlayer: (serverId: number, steamId: string) =>
    invoke<any>('ban_player', { serverId, steamId }),
  broadcastMessage: (serverId: number, message: string) =>
    invoke<any>('broadcast_message', { serverId, message }),

  // Backup commands
  createBackup: (serverId: number, label?: string) =>
    invoke<any>('create_backup', { serverId, label }),
  getBackups: (serverId: number) => invoke<any[]>('get_backups', { serverId }),
  restoreBackup: (serverId: number, backupId: number) =>
    invoke<void>('restore_backup', { serverId, backupId }),
  deleteBackup: (backupId: number) => invoke<void>('delete_backup', { backupId }),

  // System commands
  getSystemInfo: () => invoke<any>('get_system_info'),
  getProcessStats: (serverId: number) => invoke<any>('get_process_stats', { serverId }),
  checkPortAvailable: (port: number) => invoke<boolean>('check_port_available', { port }),
  getPublicIp: () => invoke<string>('get_public_ip'),
  getLocalIp: () => invoke<string>('get_local_ip'),
  checkSteamcmdInstalled: () => invoke<boolean>('check_steamcmd_installed'),
  checkServerInstalled: (installPath: string) =>
    invoke<boolean>('check_server_installed', { installPath }),
  installSteamcmd: () => invoke<void>('install_steamcmd'),
  installPalworldServer: (installPath: string, branch?: string) =>
    invoke<string>('install_palworld_server', { installPath, branch }),
  updatePalworldServer: (installPath: string, branch?: string) =>
    invoke<string>('update_palworld_server', { installPath, branch }),
  openFolder: (path: string) =>
    invoke<void>('open_folder', { path }),
  getServerExtendedDetails: (serverId: number) =>
    invoke<any>('get_server_extended_details', { serverId }),
  parseExistingServerConfig: (installPath: string) =>
    invoke<{
      name: string;
      description: string;
      installPath: string;
      gamePort: number;
      rconPort: number;
      restApiPort: number;
      maxPlayers: number;
      adminPassword: string;
      serverPassword: string | null;
      publicIp?: string | null;
    }>('parse_existing_server_config', { installPath }),
  // Installation Commands
  startServerInstallation: (serverId: number, branch: string) =>
    invoke<void>('start_server_installation', { serverId, branch }),
  cancelServerInstallation: (serverId: number) =>
    invoke<void>('cancel_server_installation', { serverId }),
  getActiveInstallationState: (serverId: number) =>
    invoke<any>('get_active_installation_state', { serverId }),
  getServerInstallationHistory: (serverId: number) =>
    invoke<any[]>('get_server_installation_history', { serverId }),
  runInstallationDiagnostics: (serverId: number) =>
    invoke<any>('run_installation_diagnostics', { serverId }),
  getSetting: (key: string) => invoke<string | null>('get_setting', { key }),
  setSetting: (key: string, value: string) =>
    invoke<void>('set_setting', { key, value }),
  setupFirewallRules: (serverId: number) =>
    invoke<void>('setup_firewall_rules', { serverId }),
  listInstalledMods: (serverId: number) =>
    invoke<any[]>('list_installed_mods', { serverId }),
  readPalModSettings: (serverId: number) =>
    invoke<string>('read_pal_mod_settings', { serverId }),
  savePalModSettings: (serverId: number, content: string) =>
    invoke<void>('save_pal_mod_settings', { serverId, content }),
  getModFiles: (modPath: string) =>
    invoke<string[]>('get_mod_files', { modPath }),
  installMod: (serverId: number, sourceFilePath: string, isLogicMod: boolean) =>
    invoke<void>('install_mod', { serverId, sourceFilePath, isLogicMod }),
  toggleMod: (serverId: number, modName: string, isLogicMod: boolean, enable: boolean, isWorkshopMod?: boolean) =>
    invoke<void>('toggle_mod', { serverId, modName, isLogicMod, enable, isWorkshopMod }),
  deleteMod: (serverId: number, modName: string, isLogicMod: boolean, enabled: boolean, isWorkshopMod?: boolean) =>
    invoke<void>('delete_mod', { serverId, modName, isLogicMod, enabled, isWorkshopMod }),
  getModPerformanceReport: (serverId: number) =>
    invoke<any[]>('get_mod_performance_report', { serverId }),
  checkModConflicts: (serverId: number) =>
    invoke<any[]>('check_mod_conflicts', { serverId }),
  createModSnapshot: (serverId: number, description: string) =>
    invoke<void>('create_mod_snapshot', { serverId, description }),
  listModSnapshots: (serverId: number) =>
    invoke<any[]>('list_mod_snapshots', { serverId }),
  restoreModSnapshot: (serverId: number, snapshotId: string) =>
    invoke<void>('restore_mod_snapshot', { serverId, snapshotId }),
  downloadAndInstallModViaUrl: (serverId: number, url: string, isLogicMod: boolean) =>
    invoke<void>('download_and_install_mod_via_url', { serverId, url, isLogicMod }),
  searchModsOnline: (query: string) =>
    invoke<any[]>('search_mods_online', { query }),
  downloadNexusModViaApi: (serverId: number, modId: number, apiKey: string, isLogicMod: boolean) =>
    invoke<void>('download_nexus_mod_via_api', { serverId, modId, apiKey, isLogicMod }),
  downloadCurseForgeModViaApi: (serverId: number, modId: number, apiKey: string, isLogicMod: boolean) =>
    invoke<void>('download_curseforge_mod_via_api', { serverId, modId, apiKey, isLogicMod }),

  // Scheduler commands
  getTasks: (serverId: number) => invoke<any[]>('get_tasks', { serverId }),
  createTask: (serverId: number, taskName: string, taskType: string, cronExpression: string) =>
    invoke<number>('create_task', { serverId, taskName, taskType, cronExpression }),
  updateTask: (taskId: number, taskName: string, taskType: string, cronExpression: string) =>
    invoke<void>('update_task', { taskId, taskName, taskType, cronExpression }),
  deleteTask: (taskId: number) => invoke<void>('delete_task', { taskId }),
  toggleTask: (taskId: number, enabled: boolean) =>
    invoke<void>('toggle_task', { taskId, enabled }),

  // Access Control commands
  getBanList: (serverId: number) => invoke<string[]>('get_ban_list', { serverId }),
  removeBan: (serverId: number, steamId: string) => invoke<void>('remove_ban', { serverId, steamId }),
  addToBanList: (serverId: number, steamId: string) => invoke<void>('add_to_ban_list', { serverId, steamId }),
  getWhitelist: (serverId: number) => invoke<string[]>('get_whitelist', { serverId }),
  setWhitelist: (serverId: number, steamIds: string[]) => invoke<void>('set_whitelist', { serverId, steamIds }),

  // Discord commands
  testDiscordWebhook: (webhookUrl: string) => invoke<string>('test_discord_webhook', { webhookUrl }),
  sendDiscordNotification: (eventType: string, serverName: string, message: string) =>
    invoke<void>('send_discord_notification', { eventType, serverName, message }),

  // Startup commands
  getStartupEnabled: () => invoke<boolean>('get_startup_enabled'),
  setStartupEnabled: (enabled: boolean) => invoke<void>('set_startup_enabled', { enabled }),
  autoStartServers: () => invoke<number>('auto_start_servers'),

  // Workshop commands
  downloadWorkshopMod: (serverId: number, workshopId: string, modTitle?: string, isLogicMod?: boolean) =>
    invoke<{ success: boolean; message: string; modName: string | null }>('download_workshop_mod', { serverId, workshopId, modTitle, isLogicMod }),
  checkUe4ssInstalled: (serverId: number) => invoke<boolean>('check_ue4ss_installed', { serverId }),
  installUe4ss: (serverId: number) => invoke<string>('install_ue4ss', { serverId }),
};

// ─── Event Listeners ────────────────────────────────────────────────────────

let listenersSetup = false;

export function setupEventListeners() {
  if (listenersSetup) return;
  listenersSetup = true;

  // Server lifecycle events
  listen<{
    server_id: number;
    event: string;
    reason?: string;
    exit_code?: number;
    uptime_seconds?: number;
    timestamp: string;
  }>('server-lifecycle', (event) => {
    const data = event.payload;
    const store = useAppStore.getState();

    let status: ServerStatus = 'stopped';
    switch (data.event) {
      case 'started':
        status = 'running';
        break;
      case 'stopped':
        status = 'stopped';
        break;
      case 'crashed':
        status = 'crashed';
        store.showNotification('error', `Server crashed unexpectedly`);
        break;
    }

    store.updateServerStatus(data.server_id, status);
    // Refetch full list to update other views reactively
    tauriCommands.getServers().then(store.setServers).catch(console.error);
  });

  // Server log events
  listen<{
    server_id: number;
    timestamp: string;
    level: string;
    message: string;
  }>('server-log', (event) => {
    const data = event.payload;
    useAppStore.getState().addLogLine(data.server_id, {
      timestamp: data.timestamp,
      level: data.level,
      message: data.message,
    });
  });

  // Install progress events

// Install tick events
listen<{
  serverId: number;
  isInstalling: boolean;
  stage: string;
  progress: number;
  status: string;
  bytesDownloaded: number;
  bytesTotal: number;
  speedBps: number;
  avgSpeedBps: number;
  peakSpeedBps: number;
  diskWriteSpeedBps: number;
  diskReadSpeedBps: number;
  etaSeconds: number | null;
  cdnServer: string;
  elapsedSeconds: number;
}>('install-tick', (event) => {
  const data = event.payload;
  const store = useAppStore.getState();
  store.setInstallState(data.serverId, {
    isInstalling: data.isInstalling,
    stage: data.stage,
    progress: data.progress,
    status: data.status,
    bytesDownloaded: data.bytesDownloaded,
    bytesTotal: data.bytesTotal,
    speed: data.speedBps,
    speedBps: data.speedBps,
    avgSpeedBps: data.avgSpeedBps,
    peakSpeedBps: data.peakSpeedBps,
    diskWriteSpeedBps: data.diskWriteSpeedBps,
    diskReadSpeedBps: data.diskReadSpeedBps,
    eta: data.etaSeconds,
    cdnServer: data.cdnServer,
    elapsedSeconds: data.elapsedSeconds,
  });

  if (data.stage === 'completed' || data.stage === 'failed') {
    // Refetch full list to update installed status reactively
    tauriCommands.getServers().then(store.setServers).catch(console.error);
  }
});

// Install log events
listen<{
  serverId: number;
  line: string;
}>('install-log', (event) => {
  const data = event.payload;
  const store = useAppStore.getState();
  store.setInstallState(data.serverId, (prev) => {
    let currentLog = prev.log || '';
    const incomingLine = data.line;

    // Optimize progress line replacement to prevent log bloat and UI lag
    const isProgressLine = incomingLine.includes("Update state") && incomingLine.includes("progress:");

    if (isProgressLine) {
      const lines = currentLog.split('\n');
      let replaced = false;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line === '') continue;
        if (line.includes("Update state") && line.includes("progress:")) {
          lines[i] = incomingLine.replace(/\r?\n$/, '');
          currentLog = lines.join('\n') + '\n';
          replaced = true;
          break;
        } else {
          break;
        }
      }
      if (!replaced) {
        currentLog = currentLog + incomingLine;
      }
    } else {
      currentLog = currentLog + incomingLine;
    }

    return { log: currentLog };
  });
});

  // Server auto-update notification events
  listen<{
    serverId: number;
    serverName: string;
    eventType: string;
    message: string;
  }>('server-update-notification', (event) => {
    const data = event.payload;
    const store = useAppStore.getState();
    if (data.eventType === 'success') {
      store.showNotification('success', data.message);
    } else if (data.eventType === 'failed') {
      store.showNotification('error', data.message);
    } else {
      store.showNotification('info', data.message);
    }
  });

  // RCON status events
  listen<{
    server_id: number;
    connected: boolean;
  }>('rcon-status', (event) => {
    const data = event.payload;
    useAppStore.getState().setRconConnected(data.server_id, data.connected);
  });
}

// ─── Utility: Format Uptime ─────────────────────────────────────────────────

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return '—';
  if (seconds === 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Utility: Format Bytes ──────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── Utility: Status Color ─────────────────────────────────────────────────

export function getStatusColor(status: ServerStatus): string {
  switch (status) {
    case 'running':
    case 'online':
      return 'status-online';
    case 'starting':
      return 'status-starting';
    case 'stopping':
    case 'restarting':
    case 'updating':
      return 'status-stopping';
    case 'crashed':
      return 'status-error';
    default:
      return 'status-offline';
  }
}

// ─── Global Application Version ─────────────────────────────────────────────
// Dynamically fetched from tauri.conf.json at runtime — never hardcoded.
import { getVersion } from '@tauri-apps/api/app';

let _cachedVersion: string | null = null;

export async function fetchAppVersion(): Promise<string> {
  if (_cachedVersion) return _cachedVersion;
  try {
    _cachedVersion = await getVersion();
  } catch {
    _cachedVersion = '0.0.0';
  }
  return _cachedVersion;
}
