import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore, type ServerTab } from '../../stores/useAppStore';
import { tauriCommands, getStatusColor, formatUptime } from '../../lib/tauri';
import { RconConsole } from '../tabs/RconConsole';
import { ConfigEditor } from '../tabs/ConfigEditor';
import { BackupsTab } from '../tabs/BackupsTab';
import { LogsTab } from '../tabs/LogsTab';
import { PlayersTab } from '../tabs/PlayersTab';
import { SchedulerTab } from '../tabs/SchedulerTab';
import { ModsTab } from '../tabs/ModsTab';

// SVG Icons for Tabs
const OverviewIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
  </svg>
);

const ConfigIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.533 1.533 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.533 1.533 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
);

const RconIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 10a1 1 0 011-1h3a1 1 0 110 2h-3a1 1 0 01-1-1z" clipRule="evenodd" />
  </svg>
);

const PlayersIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
);

const BackupsIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
    <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
    <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
  </svg>
);

const ModsIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M11 17a1 1 0 001.447.894l5.657-2.828A1 1 0 0018.657 13.5l-5.657-2.828A1 1 0 0011 11.566V17z" />
    <path d="M7.5 13.5L1.843 10.672a1 1 0 00-.543 1.106V17a1 1 0 001.447.894l5.657-2.828A1 1 0 009 14.166V13.5z" />
    <path d="M10 2.236l5.657 2.828a1 1 0 01.543 1.106v.296L10.543 3.638a1.2 1.2 0 00-1.086 0L3.8 6.466v-.296a1 1 0 01.543-1.106L10 2.236z" />
  </svg>
);

const LogsIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 2h8v2H6V6zm0 4h8v2H6v-2zm0 4h5v2H6v-2z" clipRule="evenodd" />
  </svg>
);

const SchedulerIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
  </svg>
);

const tabIcons: Record<ServerTab, React.ComponentType> = {
  overview: OverviewIcon,
  config: ConfigIcon,
  rcon: RconIcon,
  players: PlayersIcon,
  backups: BackupsIcon,
  mods: ModsIcon,
  logs: LogsIcon,
  scheduler: SchedulerIcon,
};

const tabs: { id: ServerTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'config', label: 'Config' },
  { id: 'rcon', label: 'RCON' },
  { id: 'players', label: 'Players' },
  { id: 'backups', label: 'Backups' },
  { id: 'mods', label: 'Mod Manager' },
  { id: 'logs', label: 'Logs' },
  { id: 'scheduler', label: 'Scheduler' },
];

export const ServerDetail: React.FC = () => {
  const {
    servers,
    selectedServerId,
    activeServerTab,
    setActiveServerTab,
    setCurrentView,
    showNotification,
    setServers,
  } = useAppStore();

  const [liveStats, setLiveStats] = useState<any>(null);

  const server = servers.find((s) => s.id === selectedServerId);

  const refreshStats = useCallback(async () => {
    if (!server) return;
    try {
      const stats = await tauriCommands.getServerStatus(server.id);
      setLiveStats(stats);
    } catch (_) {}
  }, [server?.id]);

  useEffect(() => {
    if (server && (server.status === 'running' || server.status === 'online')) {
      refreshStats();
      const interval = setInterval(refreshStats, 5000);
      return () => clearInterval(interval);
    }
  }, [server?.id, server?.status, refreshStats]);

  if (!server) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-dark-400">Server not found</p>
          <button onClick={() => setCurrentView('dashboard')} className="btn-primary mt-3">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isActive = server.status === 'running' || server.status === 'online';

  const handleStart = async () => {
    try {
      await tauriCommands.startServer(server.id);
      showNotification('success', 'Server starting...');
      const updated = await tauriCommands.getServers();
      setServers(updated);
    } catch (e: any) {
      showNotification('error', `Start failed: ${e}`);
    }
  };

  const handleStop = async () => {
    try {
      await tauriCommands.stopServer(server.id, false);
      showNotification('success', 'Server stopped');
      const updated = await tauriCommands.getServers();
      setServers(updated);
    } catch (e: any) {
      showNotification('error', `Stop failed: ${e}`);
    }
  };

  const handleRestart = async () => {
    try {
      await tauriCommands.restartServer(server.id);
      showNotification('success', 'Server restarting...');
      const updated = await tauriCommands.getServers();
      setServers(updated);
    } catch (e: any) {
      showNotification('error', `Restart failed: ${e}`);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete server "${server.name}"? This cannot be undone.`)) return;
    try {
      await tauriCommands.deleteServer(server.id, true);
      showNotification('success', 'Server deleted');
      const updated = await tauriCommands.getServers();
      setServers(updated);
      setCurrentView('dashboard');
    } catch (e: any) {
      showNotification('error', `Delete failed: ${e}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/30 bg-dark-900/30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="btn-ghost p-2"
            aria-label="Back to dashboard"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`status-dot ${getStatusColor(server.status)}`} />
              <h1 className="text-lg font-bold text-dark-50">{server.name}</h1>
              <span className="text-[10px] font-medium text-dark-500 uppercase tracking-wider px-2 py-0.5 rounded-full bg-dark-800/50 border border-dark-700/30">
                {server.preset}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-dark-50">
              <span>Port {server.ports.gamePort}</span>
              <span>Max {server.maxPlayers} players</span>
              {isActive && liveStats && (
                <span>Uptime: {formatUptime(liveStats.uptimeSeconds)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isActive ? (
            <>
              <button onClick={handleRestart} className="btn-primary text-xs">
                Restart
              </button>
              <button onClick={handleStop} className="btn-danger text-xs">
                Stop
              </button>
            </>
          ) : (
            <button
              onClick={handleStart}
              className="btn-success text-xs"
              disabled={server.status === 'starting'}
            >
              {server.status === 'starting' ? 'Starting...' : 'Start Server'}
            </button>
          )}
          <button onClick={handleDelete} className="btn-ghost text-xs text-error-400 hover:text-error-300">
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-6 border-b border-dark-700/30 bg-dark-900/20">
        {tabs.map((tab) => {
          const Icon = tabIcons[tab.id];
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveServerTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-semibold transition-all border-b-2 ${
                activeServerTab === tab.id
                  ? 'text-primary-400 border-primary-500 bg-primary-500/5'
                  : 'text-dark-400 border-transparent hover:text-dark-200 hover:border-dark-700/60 hover:bg-dark-900/10'
              }`}
            >
              {Icon && <Icon />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {(server.status === 'starting' || server.status === 'stopping' || server.status === 'restarting' || server.status === 'updating') && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-dark-950/85 backdrop-blur-md animate-fade-in">
            {/* Pulsing glow particle ring */}
            <div className="relative w-24 h-24 flex items-center justify-center">
              {/* Outer cyber ring */}
              <div className={`absolute inset-0 rounded-full border-2 border-dashed ${
                server.status === 'stopping' ? 'border-error-500/40 animate-spin-slow' : 'border-primary-500/40 animate-spin'
              }`} />
              <div className={`absolute inset-2.5 rounded-full border ${
                server.status === 'stopping' ? 'border-red-400/20' : 'border-cyan-400/20'
              } animate-ping`} />
              
              {/* Central icon */}
              <div className="z-10">
                {server.status === 'stopping' ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-error-400 animate-pulse">
                    <path d="M6 19h12V5H6v14z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-primary-400 animate-pulse">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                  </svg>
                )}
              </div>
            </div>

            {/* Glowing Text status */}
            <h2 className={`text-sm font-black tracking-widest mt-5 uppercase ${
              server.status === 'stopping' ? 'text-error-400' : 'text-gradient-cyan'
            }`}>
              {server.status === 'starting' && 'Booting server nodes...'}
              {server.status === 'stopping' && 'Terminating server process...'}
              {server.status === 'restarting' && 'Rebooting system service...'}
              {server.status === 'updating' && 'Downloading server updates...'}
            </h2>
            <p className="text-[9px] tracking-widest text-dark-500 uppercase font-bold mt-1.5 font-mono">
              Please stand by. Spawning desktop console.
            </p>
          </div>
        )}

        <div className={activeServerTab === 'overview' ? 'h-full block' : 'hidden'}>
          <OverviewTab server={server} stats={liveStats} />
        </div>
        <div className={activeServerTab === 'config' ? 'h-full block' : 'hidden'}>
          <ConfigEditor serverId={server.id} />
        </div>
        <div className={activeServerTab === 'rcon' ? 'h-full block' : 'hidden'}>
          <RconConsole serverId={server.id} />
        </div>
        <div className={activeServerTab === 'players' ? 'h-full block' : 'hidden'}>
          <PlayersTab serverId={server.id} />
        </div>
        <div className={activeServerTab === 'backups' ? 'h-full block' : 'hidden'}>
          <BackupsTab serverId={server.id} />
        </div>
        <div className={activeServerTab === 'logs' ? 'h-full block' : 'hidden'}>
          <LogsTab serverId={server.id} />
        </div>
        <div className={activeServerTab === 'mods' ? 'h-full block' : 'hidden'}>
          <ModsTab serverId={server.id} />
        </div>
        <div className={activeServerTab === 'scheduler' ? 'h-full block' : 'hidden'}>
          <SchedulerTab serverId={server.id} />
        </div>
      </div>
    </div>
  );
};

// ─── Overview Tab ───────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ server: any; stats: any }> = ({ server, stats }) => {
  const { showNotification, installStates, setInstallState } = useAppStore();
  const [steamcmdInstalled, setSteamcmdInstalled] = useState<boolean | null>(null);

  const [publicIp, setPublicIp] = useState('Fetching...');
  const [localIp, setLocalIp] = useState('Fetching...');

  React.useEffect(() => {
    const fetchIps = async () => {
      try {
        const pub = await tauriCommands.getPublicIp();
        setPublicIp(pub);
      } catch (_) {
        setPublicIp('Unavailable');
      }
      try {
        const loc = await tauriCommands.getLocalIp();
        setLocalIp(loc);
      } catch (_) {
        setLocalIp('Unavailable');
      }
    };
    fetchIps();
  }, []);

  const installState = installStates[server.id] || {
    isInstalling: false,
    progress: null,
    status: '',
    bytesDownloaded: 0,
    bytesTotal: 0,
    log: '',
  };

  const checkSteamcmd = async () => {
    try {
      const installed = await tauriCommands.checkSteamcmdInstalled();
      setSteamcmdInstalled(installed);
    } catch (_) {
      setSteamcmdInstalled(false);
    }
  };

  useEffect(() => {
    checkSteamcmd();
  }, []);

  const handleInstallSteamcmd = async () => {
    setInstallState(server.id, { isInstalling: true });
    try {
      showNotification('info', 'Installing SteamCMD...');
      await tauriCommands.installSteamcmd();
      showNotification('success', 'SteamCMD installed successfully');
      setSteamcmdInstalled(true);
    } catch (e: any) {
      showNotification('error', `Failed to install SteamCMD: ${e}`);
    } finally {
      setInstallState(server.id, { isInstalling: false });
    }
  };

  const handleInstallServer = async () => {
    setInstallState(server.id, {
      isInstalling: true,
      progress: 0,
      status: 'starting',
      log: 'Downloading Palworld Dedicated Server via SteamCMD...\nThis may take several minutes.\n',
    });
    try {
      showNotification('info', 'Starting Palworld server installation...');
      const result = await tauriCommands.installPalworldServer(server.installPath);
      setInstallState(server.id, (prev) => ({
        log: prev.log + result + '\n✓ Installation finished successfully!',
      }));
      showNotification('success', 'Server installed successfully via SteamCMD');
    } catch (e: any) {
      setInstallState(server.id, (prev) => ({
        log: prev.log + `\n✗ Error: ${e}`,
      }));
      showNotification('error', `Installation failed: ${e}`);
    } finally {
      setInstallState(server.id, {
        isInstalling: false,
        progress: null,
      });
    }
  };

  const handleUpdateServer = async () => {
    setInstallState(server.id, {
      isInstalling: true,
      progress: 0,
      status: 'updating',
      log: 'Checking and updating Palworld Dedicated Server via SteamCMD...\n',
    });
    try {
      showNotification('info', 'Starting server update...');
      const result = await tauriCommands.updatePalworldServer(server.installPath);
      setInstallState(server.id, (prev) => ({
        log: prev.log + result + '\n✓ Update finished successfully!',
      }));
      showNotification('success', 'Server updated successfully');
    } catch (e: any) {
      setInstallState(server.id, (prev) => ({
        log: prev.log + `\n✗ Error: ${e}`,
      }));
      showNotification('error', `Update failed: ${e}`);
    } finally {
      setInstallState(server.id, {
        isInstalling: false,
        progress: null,
      });
    }
  };

  const isActive = server.status === 'running' || server.status === 'online';

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      {/* Live Stats */}
      {isActive && stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="glass-card p-4 text-center">
            <div className="text-[10px] font-medium text-dark-500 uppercase tracking-wider">
              PID
            </div>
            <div className="text-lg font-bold text-dark-100 font-mono mt-1">
              {stats.pid ?? '—'}
            </div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-[10px] font-medium text-dark-500 uppercase tracking-wider">
              CPU
            </div>
            <div className="text-lg font-bold text-primary-400 mt-1">
              {stats.cpuUsage?.toFixed(1) ?? '0'}%
            </div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-[10px] font-medium text-dark-500 uppercase tracking-wider">
              Memory
            </div>
            <div className="text-lg font-bold text-warning-400 mt-1">
              {stats.memoryMb ?? 0} MB
            </div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-[10px] font-medium text-dark-500 uppercase tracking-wider">
              Uptime
            </div>
            <div className="text-lg font-bold text-success-400 mt-1">
              {formatUptime(stats.uptimeSeconds)}
            </div>
          </div>
        </div>
      )}


      {/* SteamCMD Installation Panel */}
      {!isActive && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-dark-200">
                Server Update & Installation (SteamCMD)
              </h3>
              <p className="text-xs text-dark-500 mt-1">
                Install, download, or update Palworld dedicated server files anonymously from SteamCMD.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-dark-400">SteamCMD:</span>
              {steamcmdInstalled === null ? (
                <span className="text-xs text-dark-500">Checking...</span>
              ) : steamcmdInstalled ? (
                <span className="text-xs text-success-400 font-medium bg-success-500/10 px-2 py-0.5 rounded-full border border-success-500/20">
                  Ready
                </span>
              ) : (
                <button
                  onClick={handleInstallSteamcmd}
                  disabled={installState.isInstalling}
                  className="btn-primary text-xs py-1 px-2.5"
                >
                  Install SteamCMD
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleInstallServer}
              disabled={installState.isInstalling || steamcmdInstalled === false}
              className="btn-primary text-xs flex items-center gap-2"
            >
              Install Server (SteamCMD)
            </button>
            <button
              onClick={handleUpdateServer}
              disabled={installState.isInstalling || steamcmdInstalled === false}
              className="btn-ghost text-xs border border-dark-700/50 hover:border-dark-600 flex items-center gap-2"
            >
              Update Server
            </button>
          </div>

          {installState.isInstalling && installState.progress !== null && (
            <div className="mt-3 space-y-2 animate-fade-in p-4 rounded-lg bg-dark-950/40 border border-dark-800/60">
              <div className="flex justify-between items-center text-xs">
                <span className="text-primary-400 font-medium capitalize flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                  </span>
                  {installState.status || 'Installing'}
                </span>
                <span className="text-dark-300 font-semibold font-mono">
                  {installState.progress.toFixed(1)}%
                </span>
              </div>
              
              <div className="w-full bg-dark-950/80 border border-dark-800 rounded-full h-3 overflow-hidden p-[2px]">
                <div
                  className="bg-gradient-to-r from-primary-500 to-cyan-400 h-full rounded-full transition-all duration-300 relative overflow-hidden"
                  style={{ width: `${installState.progress}%` }}
                >
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse"></div>
                </div>
              </div>

              {installState.bytesTotal > 0 && (
                <div className="text-[10px] text-dark-500 text-right font-mono">
                  {(installState.bytesDownloaded / (1024 * 1024)).toFixed(1)} MB / {(installState.bytesTotal / (1024 * 1024)).toFixed(1)} MB
                </div>
              )}
            </div>
          )}

          {installState.log && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider mb-1">
                Installation Log Output
              </div>
              <pre className="console-output text-xs h-32 overflow-y-auto whitespace-pre-wrap">
                {installState.log}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Server Details */}
      <div className="grid grid-cols-2 gap-6">
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
            Server Information
          </h3>
          {[
            ['Status', server.status],
            ['Preset', server.preset],
            ['Install Path', server.installPath],
            ['Created', new Date(server.createdAt).toLocaleDateString()],
            ['Last Started', server.lastStarted ? new Date(server.lastStarted).toLocaleString() : 'Never'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-xs text-dark-500">{label}</span>
              <span className="text-xs text-dark-200 font-mono max-w-[200px] truncate" title={String(value)}>{value}</span>
            </div>
          ))}
        </div>

        <div className="glass-card p-5 space-y-4">
          <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
            Network Configuration
          </h3>
          {[
            ['Local Address', `${localIp}:${server.ports.gamePort}`, true],
            ['Public Address', `${publicIp}:${server.ports.gamePort}`, true],
            ['Game Port', server.ports.gamePort, false],
            ['RCON Port', server.ports.rconPort, false],
            ['REST API Port', server.restApiConfig.port, false],
            ['Max Players', server.maxPlayers, false],
            ['Public', server.isPublic ? 'Yes' : 'No', false],
            ['RCON', server.rconConfig.enabled ? 'Enabled' : 'Disabled', false],
          ].map(([label, value, isCopyable]) => (
            <div key={String(label)} className="flex justify-between items-center h-7">
              <span className="text-xs text-dark-500">{label}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-dark-200 font-mono">{String(value)}</span>
                {isCopyable && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(String(value));
                      showNotification('success', `${label} copied to clipboard!`);
                    }}
                    className="p-1 rounded text-dark-400 hover:text-primary-400 hover:bg-dark-800/60 transition-colors"
                    title="Copy to clipboard"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                      <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v1H7a3 3 0 00-3 3v6H3a2 2 0 01-2-2V7a2 2 0 012-2h2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
