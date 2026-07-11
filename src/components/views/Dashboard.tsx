import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands, getStatusColor, formatUptime, formatBytes } from '../../lib/tauri';
import { SponsorBanner } from '../ui/SponsorBanner';

// Custom SVGs for stats & actions
const ServerStackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-cyan-400">
    <rect width="20" height="8" x="2" y="2" rx="2" />
    <rect width="20" height="8" x="2" y="14" rx="2" />
    <line x1="6" x2="6.01" y1="6" y2="6" />
    <line x1="6" x2="6.01" y1="18" y2="18" />
    <line x1="10" x2="14" y1="6" y2="6" />
    <line x1="10" x2="14" y1="18" y2="18" />
  </svg>
);

const ActivePulseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-emerald-400">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const CpuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-primary-400">
    <rect width="16" height="16" x="4" y="4" rx="2" />
    <rect width="6" height="6" x="9" y="9" rx="1" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
  </svg>
);

const RamIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-warning-400">
    <path d="M6 19v2M10 19v2M14 19v2M18 19v2M8 11V9M12 11V9M16 11V9" />
    <rect x="3" y="3" width="18" height="12" rx="2" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 mr-1.5">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 mr-1.5">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 mr-1.5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const Dashboard: React.FC = () => {
  const {
    servers,
    setServers,
    setCurrentView,
    setSelectedServerId,
    setActiveServerTab,
    showNotification,
    installStates,
    setInstallState,
  } = useAppStore();

  const [installStatesMap, setInstallStatesMap] = useState<Record<number, boolean>>({});

  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [serverStats, setServerStats] = useState<Record<number, any>>({});
  
  // Real-time ticking uptime state
  const [uptimes, setUptimes] = useState<Record<number, number>>({});

  // Dialog / Drawer states
  const [activeConsoleServerId, setActiveConsoleServerId] = useState<number | null>(null);
  const [consoleCommand, setConsoleCommand] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [consoleLoading, setConsoleLoading] = useState(false);

  const [activePlayersServerId, setActivePlayersServerId] = useState<number | null>(null);
  const [playersList, setPlayersList] = useState<any[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Load servers and stats on mount
  useEffect(() => {
    loadServers();
    loadSystemInfo();
    refreshStats();
    
    const statsInterval = setInterval(refreshStats, 8000);
    const systemInterval = setInterval(loadSystemInfo, 10000);
    
    // Smooth 1s ticker for uptimes
    const uptimeTicker = setInterval(() => {
      setUptimes((prev) => {
        const next: Record<number, number> = { ...prev };
        Object.keys(next).forEach((key) => {
          const id = Number(key);
          next[id] = (next[id] || 0) + 1;
        });
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(systemInterval);
      clearInterval(uptimeTicker);
    };
  }, []);

  // Auto scroll console
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  const loadServers = async () => {
    try {
      const data = await tauriCommands.getServers();
      setServers(data);
      
      const map: Record<number, boolean> = {};
      await Promise.all(
        data.map(async (s) => {
          try {
            const installed = await tauriCommands.checkServerInstalled(s.installPath);
            map[s.id] = installed;
          } catch (_) {
            map[s.id] = false;
          }
        })
      );
      setInstallStatesMap(map);
    } catch (e: any) {
      showNotification('error', `Failed to load servers: ${e}`);
    }
  };

  const handleInstallServer = async (serverId: number, installPath: string, branch: string) => {
    setInstallState(serverId, {
      isInstalling: true,
      progress: 0,
      status: 'starting',
      log: `Downloading Palworld Dedicated Server via SteamCMD (Branch: ${branch})...\n`,
      speed: 0,
      eta: null,
    });
    try {
      showNotification('info', 'Starting Palworld server installation...');
      const result = await tauriCommands.installPalworldServer(installPath, branch);
      setInstallState(serverId, (prev) => ({
        log: prev.log + result + '\n✓ Installation finished successfully!',
      }));
      showNotification('success', 'Server installed successfully via SteamCMD');
      setInstallStatesMap((prev) => ({ ...prev, [serverId]: true }));
    } catch (e: any) {
      setInstallState(serverId, (prev) => ({
        log: prev.log + `\n✗ Error: ${e}`,
      }));
      showNotification('error', `Installation failed: ${e}`);
    } finally {
      setInstallState(serverId, {
        isInstalling: false,
      });
    }
  };

  const loadSystemInfo = async () => {
    try {
      const info = await tauriCommands.getSystemInfo();
      setSystemInfo(info);
    } catch (_) {}
  };

  const refreshStats = async () => {
    const store = useAppStore.getState();
    const running = store.servers.filter(
      (s) => s.status === 'running' || s.status === 'online'
    );
    const stats: Record<number, any> = {};
    const newUptimes: Record<number, number> = {};

    for (const server of running) {
      try {
        const status = await tauriCommands.getServerStatus(server.id);
        stats[server.id] = status;
        if (status.uptimeSeconds) {
          newUptimes[server.id] = status.uptimeSeconds;
        }
      } catch (_) {}
    }
    setServerStats(stats);
    setUptimes(newUptimes);
  };

  // Global Multi-Server Actions
  const handleStartAll = async () => {
    const stopped = servers.filter(
      (s) => s.status !== 'running' && s.status !== 'online' && s.status !== 'starting'
    );
    if (stopped.length === 0) {
      showNotification('info', 'All servers are already running.');
      return;
    }
    showNotification('info', `Starting ${stopped.length} server(s)...`);
    const errors: string[] = [];
    for (const s of stopped) {
      try {
        await tauriCommands.startServer(s.id);
      } catch (err: any) {
        errors.push(`${s.name}: ${err}`);
      }
    }
    if (errors.length > 0) {
      showNotification('error', `Failed to start: ${errors.join(', ')}`);
    } else {
      showNotification('success', 'All servers started successfully.');
    }
    await loadServers();
  };

  const handleStopAll = async () => {
    const running = servers.filter(
      (s) => s.status === 'running' || s.status === 'online'
    );
    if (running.length === 0) {
      showNotification('info', 'No servers are currently running.');
      return;
    }
    if (!confirm(`Are you sure you want to stop all ${running.length} running server(s)?`)) return;
    showNotification('info', `Stopping ${running.length} server(s)...`);
    for (const s of running) {
      try {
        await tauriCommands.stopServer(s.id, false);
      } catch (err) {
        console.error(err);
      }
    }
    await loadServers();
  };

  const handleFirewallAll = async () => {
    showNotification('info', 'Allocating and validating ports in firewall rules...');
    for (const s of servers) {
      try {
        await tauriCommands.setupFirewallRules(s.id);
      } catch (err) {
        console.error(err);
      }
    }
    showNotification('success', 'Firewall rules updated for all server ports.');
  };

  // Card Level Operations
  const handleStartServer = async (serverId: number) => {
    try {
      await tauriCommands.startServer(serverId);
      showNotification('success', 'Server starting...');
      await loadServers();
    } catch (e: any) {
      showNotification('error', `Start failed: ${e}`);
    }
  };

  const handleStopServer = async (serverId: number) => {
    try {
      await tauriCommands.stopServer(serverId, false);
      showNotification('success', 'Server stopped successfully.');
      await loadServers();
    } catch (e: any) {
      showNotification('error', `Stop failed: ${e}`);
    }
  };

  const handleRestartServer = async (serverId: number) => {
    try {
      await tauriCommands.restartServer(serverId);
      showNotification('success', 'Restarting server...');
      await loadServers();
    } catch (e: any) {
      showNotification('error', `Restart failed: ${e}`);
    }
  };

  const handleCreateQuickBackup = async (serverId: number) => {
    try {
      showNotification('info', 'Creating backup...');
      await tauriCommands.createBackup(serverId, 'Dashboard Quick Backup');
      showNotification('success', 'Backup created successfully!');
    } catch (e: any) {
      showNotification('error', `Backup failed: ${e}`);
    }
  };

  const handleSingleFirewallRules = async (serverId: number) => {
    try {
      showNotification('info', 'Allocating port in Windows Firewall...');
      await tauriCommands.setupFirewallRules(serverId);
      showNotification('success', 'Firewall rules successfully allocated!');
    } catch (e: any) {
      showNotification('error', `Firewall allocation failed: ${e}`);
    }
  };

  // Quick Preset Profile Apply
  const handleApplyPreset = async (serverId: number, preset: string) => {
    try {
      showNotification('info', `Applying ${preset} preset profile...`);
      await tauriCommands.applyPreset(serverId, preset);
      showNotification('success', `Applied ${preset} preset profile!`);
      await loadServers();
    } catch (e: any) {
      showNotification('error', `Failed to apply preset: ${e}`);
    }
  };

  // RCON Console Dialog handlers
  const openConsole = async (serverId: number) => {
    setActiveConsoleServerId(serverId);
    setConsoleLogs(['Connecting to RCON console...']);
    setConsoleLoading(true);
    try {
      await tauriCommands.rconConnect(serverId);
      setConsoleLogs((prev) => [...prev, '✓ Connected to RCON server.', 'Type a command (e.g. Broadcast Welcome!) or Broadcast message below.']);
    } catch (e: any) {
      setConsoleLogs((prev) => [...prev, `❌ Connection failed: ${e}`]);
    } finally {
      setConsoleLoading(false);
    }
  };

  const closeConsole = async () => {
    if (activeConsoleServerId !== null) {
      try {
        await tauriCommands.rconDisconnect(activeConsoleServerId);
      } catch (_) {}
    }
    setActiveConsoleServerId(null);
    setConsoleLogs([]);
  };

  const handleSendConsoleCommand = async () => {
    if (!consoleCommand.trim() || activeConsoleServerId === null) return;
    const cmd = consoleCommand.trim();
    setConsoleLogs((prev) => [...prev, `> ${cmd}`]);
    setConsoleCommand('');
    try {
      const response = await tauriCommands.rconSendCommand(activeConsoleServerId, cmd);
      setConsoleLogs((prev) => [...prev, response || 'Command executed successfully (no output).']);
    } catch (e: any) {
      setConsoleLogs((prev) => [...prev, `Error: ${e}`]);
    }
  };

  const handleSendBroadcast = async () => {
    if (!consoleCommand.trim() || activeConsoleServerId === null) return;
    const msg = consoleCommand.trim();
    setConsoleLogs((prev) => [...prev, `📢 Broadcast: ${msg}`]);
    setConsoleCommand('');
    try {
      await tauriCommands.broadcastMessage(activeConsoleServerId, msg);
      setConsoleLogs((prev) => [...prev, 'Broadcast sent successfully.']);
    } catch (e: any) {
      setConsoleLogs((prev) => [...prev, `Broadcast Error: ${e}`]);
    }
  };

  // Player Drawer Handlers
  const openPlayersList = async (serverId: number) => {
    setActivePlayersServerId(serverId);
    setPlayersLoading(true);
    setPlayersList([]);
    try {
      await tauriCommands.rconConnect(serverId);
      const players = await tauriCommands.getPlayerList(serverId);
      setPlayersList(players || []);
    } catch (e: any) {
      showNotification('error', `Failed to fetch online player list: ${e}`);
    } finally {
      setPlayersLoading(false);
    }
  };

  const handleKickPlayer = async (steamId: string) => {
    if (activePlayersServerId === null) return;
    if (!confirm(`Are you sure you want to kick player ${steamId}?`)) return;
    try {
      await tauriCommands.kickPlayer(activePlayersServerId, steamId);
      showNotification('success', 'Player kicked.');
      // Refresh list
      const players = await tauriCommands.getPlayerList(activePlayersServerId);
      setPlayersList(players || []);
    } catch (e: any) {
      showNotification('error', `Kick failed: ${e}`);
    }
  };

  const handleBanPlayer = async (steamId: string) => {
    if (activePlayersServerId === null) return;
    if (!confirm(`Are you sure you want to ban player ${steamId}?`)) return;
    try {
      await tauriCommands.banPlayer(activePlayersServerId, steamId);
      showNotification('success', 'Player banned.');
      // Refresh list
      const players = await tauriCommands.getPlayerList(activePlayersServerId);
      setPlayersList(players || []);
    } catch (e: any) {
      showNotification('error', `Ban failed: ${e}`);
    }
  };

  const openServerDetail = (id: number) => {
    setSelectedServerId(id);
    setActiveServerTab('overview');
    setCurrentView('server-detail');
  };

  const runningCount = servers.filter(
    (s) => s.status === 'running' || s.status === 'online'
  ).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-fade-in text-dark-50">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-xs text-dark-400 mt-1">
            Global control center for dedicated Palworld servers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentView('create-server')}
            className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
          >
            <span>+ New Server</span>
          </button>
        </div>
      </div>

      <SponsorBanner />

      {/* Global Toolbar Control Panel */}
      <div className="glass-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-dark-900/25 border-l-4 border-l-primary-500 shadow-md animate-slide-in" style={{ animationDelay: '50ms' }}>
        <div>
          <h3 className="text-xs font-bold text-dark-200 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
            Multi-Server Command Console
          </h3>
          <p className="text-[10px] text-dark-500 mt-0.5 font-medium">Orchestrate configurations and lifecycle states across all configured server nodes.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-dark-100">
          <button
            onClick={handleStartAll}
            className="btn-success text-[10px] px-3.5 py-1.5 font-bold uppercase tracking-wider flex items-center gap-1 hover:shadow-success-500/20"
          >
            <PlayIcon /> Start All
          </button>
          <button
            onClick={handleStopAll}
            className="btn-danger text-[10px] px-3.5 py-1.5 font-bold uppercase tracking-wider flex items-center gap-1 hover:shadow-error-500/20"
          >
            <StopIcon /> Stop All
          </button>
          <button
            onClick={handleFirewallAll}
            className="btn-ghost text-[10px] px-3.5 py-1.5 font-bold uppercase tracking-wider flex items-center gap-1 border border-dark-700/50 hover:border-dark-600"
          >
            <ShieldIcon /> Configure Firewall
          </button>
        </div>
      </div>

      {/* Quick Stats Panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Servers */}
        <div className="glass-card stats-card-hover p-4 border border-dark-800 bg-dark-900/10 flex items-center justify-between animate-slide-in" style={{ animationDelay: '100ms' }}>
          <div>
            <div className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
              Total Servers
            </div>
            <div className="mt-1 text-2xl font-black bg-gradient-to-r from-cyan-200 to-cyan-400 bg-clip-text text-transparent">
              {servers.length}
            </div>
          </div>
          <div className="stats-icon-badge w-9 h-9 rounded-full bg-cyan-500/5 border border-cyan-500/15 flex items-center justify-center transition-all duration-300">
            <ServerStackIcon />
          </div>
        </div>

        {/* Active Servers */}
        <div className="glass-card stats-card-hover p-4 border border-dark-800 bg-dark-900/10 flex items-center justify-between animate-slide-in" style={{ animationDelay: '175ms' }}>
          <div>
            <div className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
              Active Servers
            </div>
            <div className="mt-1 text-2xl font-black bg-gradient-to-r from-emerald-200 to-emerald-400 bg-clip-text text-transparent">
              {runningCount}
            </div>
          </div>
          <div className="stats-icon-badge w-9 h-9 rounded-full bg-emerald-500/5 border border-emerald-500/15 flex items-center justify-center transition-all duration-300">
            <ActivePulseIcon />
          </div>
        </div>

        {/* Global CPU Usage */}
        <div className="glass-card stats-card-hover p-4 border border-dark-800 bg-dark-900/10 flex items-center justify-between animate-slide-in" style={{ animationDelay: '250ms' }}>
          <div>
            <div className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
              Global CPU Usage
            </div>
            <div className="mt-1 text-2xl font-black bg-gradient-to-r from-primary-200 to-primary-400 bg-clip-text text-transparent">
              {systemInfo ? `${systemInfo.cpuUsage.toFixed(0)}%` : '—'}
            </div>
          </div>
          <div className="stats-icon-badge w-9 h-9 rounded-full bg-primary-500/5 border border-primary-500/15 flex items-center justify-center transition-all duration-300">
            <CpuIcon />
          </div>
        </div>

        {/* System RAM Load */}
        <div className="glass-card stats-card-hover p-4 border border-dark-800 bg-dark-900/10 flex items-center justify-between animate-slide-in" style={{ animationDelay: '325ms' }}>
          <div>
            <div className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
              System RAM Load
            </div>
            <div className="mt-1 text-2xl font-black bg-gradient-to-r from-warning-200 to-warning-400 bg-clip-text text-transparent">
              {systemInfo
                ? `${(systemInfo.usedMemoryMb / 1024).toFixed(1)} GB`
                : '—'}
            </div>
            {systemInfo && (
              <div className="mt-0.5 text-[9px] text-dark-500 font-semibold font-mono">
                / {(systemInfo.totalMemoryMb / 1024).toFixed(1)} GB
              </div>
            )}
          </div>
          <div className="stats-icon-badge w-9 h-9 rounded-full bg-warning-500/5 border border-warning-500/15 flex items-center justify-center transition-all duration-300">
            <RamIcon />
          </div>
        </div>
      </div>

      {/* Server Grid */}
      {servers.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-20 bg-dark-900/5">
          <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 text-dark-600 mb-4 animate-pulse">
            <rect x="8" y="12" width="48" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
            <rect x="8" y="36" width="48" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="20" r="2" fill="currentColor" />
            <circle cx="16" cy="44" r="2" fill="currentColor" />
          </svg>
          <h3 className="text-sm font-bold text-dark-300 mb-1">
            No Dedicated Servers Configured
          </h3>
          <p className="text-[11px] text-dark-500 mb-4 max-w-sm text-center">
            Create or register your first server nodes to start managing deployment pipelines, mods, and backups.
          </p>
          <button
            onClick={() => setCurrentView('create-server')}
            className="btn-primary text-xs font-semibold px-6 py-2.5 flex items-center gap-2"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Deploy New Server
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {servers.map((server, index) => {
            const stats = serverStats[server.id];
            const isActive =
              server.status === 'running' || server.status === 'online';
            const uptimeSecs = uptimes[server.id];
            const installState = installStates[server.id];

            return (
              <div
                key={server.id}
                onClick={() => openServerDetail(server.id)}
                className={`glass-card server-card-hover p-5 flex flex-col justify-between border relative overflow-hidden cursor-pointer hover:shadow-xl active:scale-[0.99] animate-slide-in ${
                  isActive ? 'border-primary-500/35 bg-primary-950/5 hover:border-primary-500/60' : 'border-dark-800 bg-dark-900/10 hover:border-dark-700'
                }`}
                style={{ animationDelay: `${(index * 75) + 400}ms` }}
              >
                {/* Active server decorative accent */}
                {isActive && <div className="active-pulse-glowing-glow" />}

                {/* Mini start/stop overlay */}
                {(server.status === 'starting' || server.status === 'stopping' || server.status === 'restarting' || server.status === 'updating') && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-dark-950/90 backdrop-blur-sm animate-fade-in p-4 text-center select-none">
                    <div className="relative w-12 h-12 flex items-center justify-center">
                      <div className={`absolute inset-0 rounded-full border-2 border-dashed ${
                        server.status === 'stopping' ? 'border-error-500/40 animate-spin-slow' : 'border-primary-500/40 animate-spin'
                      }`} />
                      <div className={`absolute inset-1.5 rounded-full border ${
                        server.status === 'stopping' ? 'border-red-400/30 animate-pulse' : 'border-cyan-400/30 animate-pulse'
                      }`} />
                    </div>
                    <span className={`text-[10px] font-black tracking-widest mt-3 uppercase ${
                      server.status === 'stopping' ? 'text-error-400 animate-pulse' : 'text-primary-400 animate-pulse'
                    }`}>
                      {server.status === 'starting' && 'Starting...'}
                      {server.status === 'stopping' && 'Stopping...'}
                      {server.status === 'restarting' && 'Restarting...'}
                      {server.status === 'updating' && 'Updating...'}
                    </span>
                  </div>
                )}
                <div className="relative z-10">
                  {/* Top line Info */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className={`status-dot ${getStatusColor(server.status)} ${isActive ? 'pulse-status-green' : ''}`} />
                        <span className="text-xs font-bold text-dark-100 hover:text-primary-400 transition-colors cursor-pointer truncate max-w-[150px]">
                          {server.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-dark-500 mt-1 truncate max-w-[180px] font-medium" title={server.description || undefined}>
                        {server.description || 'Palworld dedicated server node'}
                      </p>
                    </div>

                    {/* Quick Preset Selector */}
                    {server.isRemote ? (
                      <span className="flex items-center gap-1 text-[8px] bg-primary-500/10 text-primary-400 border border-primary-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                        Remote
                      </span>
                    ) : (
                      <select
                        value={server.preset}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleApplyPreset(server.id, e.target.value)}
                        className="bg-dark-900/80 border border-dark-700/50 hover:border-dark-600 text-[9px] text-dark-300 font-bold px-2 py-0.5 rounded focus:outline-none focus:border-primary-500/50 cursor-pointer transition-colors"
                      >
                        <option value="Balanced">Balanced</option>
                        <option value="Casual">Casual</option>
                        <option value="PvP">PvP</option>
                        <option value="Hardcore">Hardcore</option>
                        <option value="Performance">Performance</option>
                      </select>
                    )}
                  </div>

                  {/* Info table */}
                  <div className="grid grid-cols-2 gap-y-3 text-[10px] mb-4 border-b border-dark-800 pb-3">
                    <div>
                      <span className="text-dark-500 font-medium uppercase tracking-wider block text-[8px]">{server.isRemote ? 'Remote Host' : 'Game Port'}</span>
                      <span className="text-dark-200 font-mono font-semibold truncate block max-w-[120px]" title={server.isRemote ? `${server.host}:${server.ports.gamePort}` : undefined}>
                        {server.isRemote ? server.host : server.ports.gamePort}
                      </span>
                    </div>
                    <div>
                      <span className="text-dark-500 font-medium uppercase tracking-wider block text-[8px]">Max Players</span>
                      <span className="text-dark-200 font-semibold">{server.maxPlayers} Slots</span>
                    </div>
                    <div>
                      <span className="text-dark-500 font-medium uppercase tracking-wider block text-[8px]">Lifecycle State</span>
                      <span className={`${
                        installState && installState.isInstalling
                          ? 'text-primary-400 animate-pulse font-bold'
                          : installStatesMap[server.id] === false && !server.isRemote
                          ? 'text-red-400 font-mono font-bold'
                          : 'text-dark-200'
                      } capitalize font-semibold`}>
                        {server.isRemote
                          ? 'Remote Connection'
                          : installState && installState.isInstalling
                          ? installState.status
                          : installStatesMap[server.id] === false
                          ? 'Not Installed'
                          : server.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-dark-500 font-medium uppercase tracking-wider block text-[8px]">Real Uptime</span>
                      <span className="text-dark-200 font-mono font-semibold">
                        {uptimeSecs !== undefined ? formatUptime(uptimeSecs) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Resource Monitors */}
                  {isActive && stats && !server.isRemote && (
                    <div className="space-y-3 mb-4">
                      {/* CPU Bar */}
                      <div>
                        <div className="flex items-center justify-between text-[9px] text-dark-400 mb-1">
                          <span className="font-semibold">CPU Overhead</span>
                          <span className="font-bold text-primary-400">{(stats.cpuUsage || 0).toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 bg-dark-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(stats.cpuUsage || 0, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* RAM Bar */}
                      <div>
                        <div className="flex items-center justify-between text-[9px] text-dark-400 mb-1">
                          <span className="font-semibold">RAM Allocation</span>
                          <span className="font-bold text-warning-400">{stats.memoryMb || 0} MB</span>
                        </div>
                        <div className="h-1.5 bg-dark-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-warning-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(((stats.memoryMb || 0) / 10240) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Grid controls */}
                <div className="space-y-2 pt-2 border-t border-dark-800 relative z-10">
                  {server.isRemote ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openServerDetail(server.id);
                      }}
                      className="btn-primary w-full py-1.5 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-primary-600 to-cyan-500 hover:from-primary-500 hover:to-cyan-400 border-none"
                    >
                      Manage Connection
                    </button>
                  ) : installState && installState.isInstalling ? (
                    <div className="space-y-1.5 py-1 px-1" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-primary-400 font-bold capitalize animate-pulse">{installState.status}</span>
                        <span className="text-dark-300 font-mono font-bold">{installState.progress?.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-dark-950 border border-dark-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-primary-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                          style={{ width: `${installState.progress || 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[8px] text-dark-500 font-mono">
                        {installState.speed > 0 ? (
                          <span>{formatBytes(installState.speed)}/s</span>
                        ) : (
                          <span />
                        )}
                        {installState.eta !== null && installState.eta > 0 && (
                          <span>ETA: {formatUptime(installState.eta)}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Primary Power State Toggle / Install Trigger */}
                      <div className="flex gap-2">
                        {installStatesMap[server.id] === false ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInstallServer(server.id, server.installPath, server.branch);
                            }}
                            className="btn-primary w-full py-1.5 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-primary-600 to-cyan-500 hover:from-primary-500 hover:to-cyan-400 border-none"
                          >
                            Install Server (SteamCMD)
                          </button>
                        ) : isActive ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStopServer(server.id);
                              }}
                              className="btn-danger flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:shadow-error-500/10"
                            >
                              Stop
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestartServer(server.id);
                              }}
                              className="btn-ghost flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider border border-dark-700/50 hover:bg-dark-800"
                            >
                              Restart
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartServer(server.id);
                            }}
                            className="btn-success w-full py-1.5 text-[10px] font-bold uppercase tracking-wider hover:shadow-success-500/10"
                            disabled={server.status === 'starting'}
                          >
                            {server.status === 'starting' ? 'Starting...' : 'Start Server'}
                          </button>
                        )}
                      </div>

                      {/* Secondary Quick Action Console Buttons */}
                      {isActive && (
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openConsole(server.id);
                            }}
                            className="btn-ghost py-1 text-[9px] font-semibold border border-dark-800 hover:bg-dark-850"
                            title="Broadcast & RCON commands"
                          >
                            Console
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPlayersList(server.id);
                            }}
                            className="btn-ghost py-1 text-[9px] font-semibold border border-dark-800 hover:bg-dark-850"
                            title="View online player inventory"
                          >
                            Players
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateQuickBackup(server.id);
                            }}
                            className="btn-ghost py-1 text-[9px] font-semibold border border-dark-800 hover:bg-dark-850"
                            title="Take manual backup snapshot"
                          >
                            Backup
                          </button>
                        </div>
                      )}

                      {/* Stopped Quick Actions */}
                      {!isActive && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openServerDetail(server.id);
                            }}
                            className="btn-ghost py-1 text-[9px] font-semibold border border-dark-800 text-center block"
                          >
                            Open Details
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSingleFirewallRules(server.id);
                            }}
                            className="btn-ghost py-1 text-[9px] font-semibold border border-dark-800 text-center block"
                          >
                            Firewall Port
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}



      {/* RCON Console Overlay Modal */}
      {activeConsoleServerId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-2xl flex flex-col h-[450px] border border-dark-700 bg-dark-950 animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-dark-800">
              <div>
                <h3 className="text-sm font-bold text-dark-100">Live RCON Console</h3>
                <p className="text-[10px] text-dark-500 mt-0.5">Sends live game messages and execution commands directly to running server node.</p>
              </div>
              <button
                onClick={closeConsole}
                className="text-dark-400 hover:text-dark-100 transition-colors font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>

            {/* Command terminal */}
            <div className="flex-1 overflow-y-auto p-4 bg-black/40 font-mono text-[11px] space-y-1.5 scrollbar-thin">
              {consoleLogs.map((log, idx) => (
                <div key={idx} className={log.startsWith('>') ? 'text-primary-400' : log.startsWith('Error') || log.startsWith('❌') ? 'text-error-400' : 'text-dark-300'}>
                  {log}
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>

            {/* Input actions */}
            <div className="p-3 border-t border-dark-850 flex gap-2">
              <input
                type="text"
                value={consoleCommand}
                onChange={(e) => setConsoleCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendConsoleCommand()}
                placeholder="Type command (e.g. Save, Broadcast message, ShowPlayers)..."
                className="input-field text-xs flex-1 bg-dark-900 border-dark-800"
                disabled={consoleLoading}
              />
              <button
                onClick={handleSendBroadcast}
                disabled={consoleLoading || !consoleCommand.trim()}
                className="btn-ghost text-xs px-3 border border-dark-700/50 hover:bg-dark-800"
              >
                Broadcast
              </button>
              <button
                onClick={handleSendConsoleCommand}
                disabled={consoleLoading || !consoleCommand.trim()}
                className="btn-primary text-xs px-4"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Players List Modal */}
      {activePlayersServerId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-lg flex flex-col h-[380px] border border-dark-700 bg-dark-950 animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-dark-800">
              <div>
                <h3 className="text-sm font-bold text-dark-100">Connected Players</h3>
                <p className="text-[10px] text-dark-500 mt-0.5">View and moderate users currently connected to the server instance.</p>
              </div>
              <button
                onClick={() => setActivePlayersServerId(null)}
                className="text-dark-400 hover:text-dark-100 transition-colors font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {playersLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-xs text-dark-400">
                  <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Fetching active player data...</span>
                </div>
              ) : playersList.length === 0 ? (
                <div className="text-center py-16 text-dark-500 text-xs font-semibold">
                  No players are currently connected.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {playersList.map((player) => (
                    <div key={player.steamId} className="flex items-center justify-between p-2.5 bg-dark-900/40 rounded border border-dark-800/40 text-xs">
                      <div>
                        <span className="font-bold text-dark-100">{player.name}</span>
                        <span className="text-[9px] text-dark-500 font-mono block mt-0.5">ID: {player.steamId}</span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleKickPlayer(player.steamId)}
                          className="bg-warning-500/10 border border-warning-500/20 text-warning-400 hover:bg-warning-500/20 text-[10px] px-2.5 py-1 rounded transition-all font-semibold"
                        >
                          Kick
                        </button>
                        <button
                          onClick={() => handleBanPlayer(player.steamId)}
                          className="bg-error-500/10 border border-error-500/20 text-error-400 hover:bg-error-500/20 text-[10px] px-2.5 py-1 rounded transition-all font-semibold"
                        >
                          Ban
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Action Button (FAB) — Deploy Server ─────────────── */}
      <button
        onClick={() => setCurrentView('create-server')}
        className="fixed bottom-8 right-8 z-40 group"
        aria-label="Deploy new server"
        title="Deploy New Server"
      >
        {/* Outer glow ring */}
        <div className="absolute inset-0 rounded-full bg-primary-500/20 animate-ping opacity-30 scale-110" />
        {/* Button body */}
        <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-primary-500/30 transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary-500/50 active:scale-95">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-dark-950 transition-transform duration-300 group-hover:rotate-90">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

    </div>
  );
};
