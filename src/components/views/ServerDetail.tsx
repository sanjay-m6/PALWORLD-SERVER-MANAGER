import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore, type ServerTab } from '../../stores/useAppStore';
import { tauriCommands, getStatusColor, formatUptime, formatBytes } from '../../lib/tauri';
import { RconConsole } from '../tabs/RconConsole';
import { ConfigEditor } from '../tabs/ConfigEditor';
import { BackupsTab } from '../tabs/BackupsTab';
import { LogsTab } from '../tabs/LogsTab';
import { PlayersTab } from '../tabs/PlayersTab';
import { SchedulerTab } from '../tabs/SchedulerTab';
import { ModsTab } from '../tabs/ModsTab';
import { FirewallTab } from '../tabs/FirewallTab';
import { CustomSelect } from '../ui/CustomSelect';

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

const FirewallIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M10.3 2.2a1 1 0 00-1.6 0l-5 4a1 1 0 00-.4.8v5c0 4.1 3.5 7.4 7 8a1 1 0 00.6 0c3.5-.6 7-3.9 7-8v-5a1 1 0 00-.4-.8l-5-4z" />
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
  firewall: FirewallIcon,
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
  { id: 'firewall', label: 'Firewall' },
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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

  const handleDelete = () => {
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleteModalOpen(false);
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

  const getGlowColor = (status: string) => {
    switch (status) {
      case 'online':
      case 'running':
        return 'shadow-[0_0_8px_rgba(16,185,129,0.6)]';
      case 'starting':
        return 'shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-pulse';
      case 'stopping':
      case 'updating':
        return 'shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse';
      default:
        return 'shadow-[0_0_6px_rgba(107,114,128,0.4)]';
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/30 bg-dark-900/30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-dark-850 hover:bg-dark-800 border border-dark-750/30 text-dark-300 hover:text-primary-400 transition-all duration-200 shadow-md hover:border-primary-500/20 active:scale-95"
            aria-label="Back to dashboard"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`status-dot ${getStatusColor(server.status)} ${getGlowColor(server.status)}`} />
              <h1 className="text-lg font-bold text-dark-50">{server.name}</h1>
              <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${
                server.status === 'running' || server.status === 'online'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                  : server.status === 'starting'
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25 shadow-[0_0_8px_rgba(6,182,212,0.2)] animate-pulse'
                  : server.status === 'stopping' || server.status === 'updating'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/25 shadow-[0_0_8px_rgba(245,158,11,0.2)] animate-pulse'
                  : 'bg-error-500/10 text-error-400 border-error-500/25 shadow-[0_0_8px_rgba(239,68,68,0.15)]'
              }`}>
                {server.status === 'running' || server.status === 'online' ? 'Online' : server.status}
              </span>
              <span className="text-[9px] font-black tracking-widest text-primary-400 px-2 py-0.5 rounded border border-primary-500/25 bg-primary-500/10 uppercase">
                {server.preset}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-dark-400 font-semibold font-mono tracking-wider">
              <span className="flex items-center gap-1 bg-dark-900/50 px-2 py-0.5 rounded border border-dark-800/40">
                <span className="text-dark-600">PORT:</span>
                <span className="text-primary-400">{server.ports.gamePort}</span>
              </span>
              <span className="flex items-center gap-1 bg-dark-900/50 px-2 py-0.5 rounded border border-dark-800/40">
                <span className="text-dark-600">SLOTS:</span>
                <span className="text-warning-400">{server.maxPlayers}</span>
              </span>
              {isActive && liveStats && (
                <span className="flex items-center gap-1 bg-dark-900/50 px-2 py-0.5 rounded border border-dark-800/40 animate-fade-in">
                  <span className="text-dark-600">UPTIME:</span>
                  <span className="text-success-400">{formatUptime(liveStats.uptimeSeconds)}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isActive ? (
            <>
              <button
                onClick={handleRestart}
                className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-dark-200 hover:text-dark-100 bg-dark-800 hover:bg-dark-750 border border-dark-700/50 hover:border-dark-600 rounded-lg transition-all duration-200 active:scale-95"
              >
                Restart
              </button>
              <button
                onClick={handleStop}
                className="btn-danger px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-md active:scale-95 transition-all duration-200"
              >
                Stop Server
              </button>
            </>
          ) : (
            <button
              onClick={handleStart}
              className="btn-success px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-md active:scale-95 transition-all duration-200"
              disabled={server.status === 'starting'}
            >
              {server.status === 'starting' ? 'Starting...' : 'Start Server'}
            </button>
          )}
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-error-400 hover:text-error-300 hover:bg-error-500/10 border border-error-500/20 hover:border-error-500/30 rounded-lg transition-all duration-200 active:scale-95"
          >
            Delete Server
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
          <OverviewTab key={server.id} server={server} stats={liveStats} />
        </div>
        <div className={activeServerTab === 'config' ? 'h-full block' : 'hidden'}>
          <ConfigEditor key={server.id} serverId={server.id} />
        </div>
        <div className={activeServerTab === 'rcon' ? 'h-full block' : 'hidden'}>
          <RconConsole key={server.id} serverId={server.id} />
        </div>
        <div className={activeServerTab === 'players' ? 'h-full block' : 'hidden'}>
          <PlayersTab key={server.id} serverId={server.id} />
        </div>
        <div className={activeServerTab === 'backups' ? 'h-full block' : 'hidden'}>
          <BackupsTab key={server.id} serverId={server.id} />
        </div>
        <div className={activeServerTab === 'logs' ? 'h-full block' : 'hidden'}>
          <LogsTab key={server.id} serverId={server.id} />
        </div>
        <div className={activeServerTab === 'mods' ? 'h-full block' : 'hidden'}>
          <ModsTab key={server.id} serverId={server.id} />
        </div>
        <div className={activeServerTab === 'scheduler' ? 'h-full block' : 'hidden'}>
          <SchedulerTab key={server.id} serverId={server.id} />
        </div>
        <div className={activeServerTab === 'firewall' ? 'h-full block' : 'hidden'}>
          <FirewallTab key={server.id} serverId={server.id} />
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsDeleteModalOpen(false)} 
          />
          
          {/* Modal Content */}
          <div className="relative glass-card max-w-sm w-full border border-error-500/20 bg-dark-900/60 p-6 shadow-2xl rounded-xl space-y-6 animate-scale-in">
            {/* Warning Icon & Title */}
            <div className="flex items-center gap-3 text-error-400">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-error-500/10 border border-error-500/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-error-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wider">Confirm Server Deletion</h2>
            </div>
            
            {/* Body text */}
            <p className="text-xs text-dark-300 leading-relaxed">
              Are you sure you want to delete server <strong className="text-dark-100 font-bold">"{server.name}"</strong>? This will remove all configuration settings. This action cannot be undone.
            </p>
            
            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="btn-ghost px-4 py-2 text-xs font-semibold rounded-lg text-dark-400 hover:text-dark-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="bg-error-500/10 border border-error-500/20 hover:bg-error-500/20 text-error-400 hover:text-error-300 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                Delete Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Overview Tab ───────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ server: any; stats: any }> = ({ server, stats }) => {
  const { showNotification, installStates, setInstallState } = useAppStore();
  const [steamcmdInstalled, setSteamcmdInstalled] = useState<boolean | null>(null);

  const [publicIp, setPublicIp] = useState('Fetching...');
  const [localIp, setLocalIp] = useState('Fetching...');
  
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [extendedInfo, setExtendedInfo] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(server.branch || 'public');
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [autoStartEnabled, setAutoStartEnabled] = useState(server.autoStart ?? false);

  const logEndRef = useRef<HTMLDivElement>(null);

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
    speed: 0,
    eta: null,
  };

  const fetchDetails = useCallback(async () => {
    try {
      const installed = await tauriCommands.checkServerInstalled(server.installPath);
      setIsInstalled(installed);
      
      const details = await tauriCommands.getServerExtendedDetails(server.id);
      setExtendedInfo(details);
      setSelectedBranch(details.branch);
      
      const autoUpdateVal = await tauriCommands.getSetting(`auto_update_enabled_${server.id}`);
      setAutoUpdateEnabled(autoUpdateVal === 'true');
    } catch (e) {
      console.error("Failed to fetch extended server details:", e);
    } finally {
      setIsLoadingDetails(false);
    }
  }, [server.id, server.installPath]);

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
    fetchDetails();
  }, [fetchDetails]);

  // Auto-scroll the log console to bottom when it changes
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [installState.log]);

  // Detect when installation finishes to show the modal
  const lastInstallStatus = useRef(installState.status);
  useEffect(() => {
    if (lastInstallStatus.current !== 'finished' && installState.status === 'finished') {
      setShowCompletionModal(true);
      fetchDetails();
    }
    lastInstallStatus.current = installState.status;
  }, [installState.status, fetchDetails]);

  const dismissCompletionModal = () => {
    setShowCompletionModal(false);
    setInstallState(server.id, { status: '' });
  };

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
      log: `Downloading Palworld Dedicated Server via SteamCMD (Branch: ${selectedBranch})...\nThis may take several minutes.\n`,
      speed: 0,
      eta: null,
    });
    try {
      showNotification('info', 'Starting Palworld server installation...');
      const result = await tauriCommands.installPalworldServer(server.installPath, selectedBranch);
      setInstallState(server.id, (prev) => ({
        log: prev.log + result + '\n✓ Installation finished successfully!',
      }));
      showNotification('success', 'Server installed successfully via SteamCMD');
      fetchDetails();
    } catch (e: any) {
      setInstallState(server.id, (prev) => ({
        log: prev.log + `\n✗ Error: ${e}`,
      }));
      showNotification('error', `Installation failed: ${e}`);
    } finally {
      setInstallState(server.id, {
        isInstalling: false,
      });
    }
  };

  const handleUpdateServer = async () => {
    setInstallState(server.id, {
      isInstalling: true,
      progress: 0,
      status: 'updating',
      log: `Checking and updating Palworld Dedicated Server via SteamCMD (Branch: ${selectedBranch})...\n`,
      speed: 0,
      eta: null,
    });
    try {
      showNotification('info', 'Starting server update...');
      const result = await tauriCommands.updatePalworldServer(server.installPath, selectedBranch);
      setInstallState(server.id, (prev) => ({
        log: prev.log + result + '\n✓ Update finished successfully!',
      }));
      showNotification('success', 'Server updated successfully');
      fetchDetails();
    } catch (e: any) {
      setInstallState(server.id, (prev) => ({
        log: prev.log + `\n✗ Error: ${e}`,
      }));
      showNotification('error', `Update failed: ${e}`);
    } finally {
      setInstallState(server.id, {
        isInstalling: false,
      });
    }
  };

  const handleValidateFiles = async () => {
    setInstallState(server.id, {
      isInstalling: true,
      progress: 0,
      status: 'validating',
      log: `Validating Palworld Dedicated Server files (Branch: ${selectedBranch})...\n`,
      speed: 0,
      eta: null,
    });
    try {
      showNotification('info', 'Starting file validation...');
      const result = await tauriCommands.installPalworldServer(server.installPath, selectedBranch);
      setInstallState(server.id, (prev) => ({
        log: prev.log + result + '\n✓ Validation finished successfully!',
      }));
      showNotification('success', 'Server files validated successfully');
      fetchDetails();
    } catch (e: any) {
      setInstallState(server.id, (prev) => ({
        log: prev.log + `\n✗ Error: ${e}`,
      }));
      showNotification('error', `Validation failed: ${e}`);
    } finally {
      setInstallState(server.id, {
        isInstalling: false,
      });
    }
  };

  const handleBranchChange = async (newBranch: string) => {
    try {
      setSelectedBranch(newBranch);
      await tauriCommands.updateServerBranch(server.id, newBranch);
      showNotification('info', `Branch updated to ${newBranch}. Validating files...`);
      
      // Auto validate files on branch change
      setInstallState(server.id, {
        isInstalling: true,
        progress: 0,
        status: 'changing branch',
        log: `Changing branch to ${newBranch} and validating server files...\n`,
        speed: 0,
        eta: null,
      });
      
      const result = await tauriCommands.installPalworldServer(server.installPath, newBranch);
      setInstallState(server.id, (prev) => ({
        log: prev.log + result + `\n✓ Re-validation on branch ${newBranch} successful!`,
      }));
      showNotification('success', `Server files successfully validated on branch: ${newBranch}`);
      fetchDetails();
    } catch (err: any) {
      showNotification('error', `Failed to change branch / validate: ${err}`);
      setInstallState(server.id, { isInstalling: false });
    }
  };

  const handleOpenFolder = async () => {
    try {
      await tauriCommands.openFolder(server.installPath);
    } catch (e: any) {
      showNotification('error', `Failed to open folder: ${e}`);
    }
  };

  const isActive = server.status === 'running' || server.status === 'online';

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      {/* Live Stats */}
      <div className="grid grid-cols-4 gap-4">
        {isActive && stats ? (
          <>
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
                {(stats.cpuUsage || 0).toFixed(1)}%
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
          </>
        ) : (
          <div className="col-span-4 glass-card p-5 flex flex-col items-center justify-center bg-dark-900/10 border-dashed border-dark-800/40">
            <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-lg ${
              server.status === 'starting'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-cyan-950/20 animate-pulse'
                : server.status === 'stopping' || server.status === 'updating'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-amber-950/20 animate-pulse'
                : 'bg-error-500/10 text-error-400 border border-error-500/30 shadow-error-950/20'
            }`}>
              {server.status === 'starting' && '● Starting Server'}
              {server.status === 'stopping' && '● Stopping Server'}
              {server.status === 'updating' && '● Updating Server'}
              {server.status !== 'starting' && server.status !== 'stopping' && server.status !== 'updating' && '● Server Offline'}
            </span>
          </div>
        )}
      </div>

      {/* SteamCMD Installation Panel */}
      {!isActive && (
        <div className="glass-card p-5 space-y-4 relative z-20">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-dark-200">
                  Server Update & Installation (SteamCMD)
                </h3>
                {isInstalled === true && (
                  <span className="text-[10px] text-success-400 font-bold bg-success-500/10 px-2 py-0.5 rounded border border-success-500/20 uppercase tracking-wider">
                    🟢 Installed
                  </span>
                )}
                {isInstalled === false && (
                  <span className="text-[10px] text-error-400 font-bold bg-error-500/10 px-2 py-0.5 rounded border border-error-500/20 uppercase tracking-wider">
                    🔴 Not Installed
                  </span>
                )}
              </div>
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

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-dark-800/60 pt-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <label className="text-xs text-dark-400 font-semibold uppercase tracking-wider">Beta Branch:</label>
                <CustomSelect
                  options={[
                    { value: 'public', label: 'Public Release' },
                    { value: 'experimental', label: 'Experimental Beta' },
                    { value: 'preview', label: 'Preview Branch' },
                    { value: 'development', label: 'Developer Beta' },
                  ]}
                  value={selectedBranch}
                  onChange={handleBranchChange}
                  disabled={installState.isInstalling || steamcmdInstalled === false}
                  className="w-48"
                />
              </div>

               <div className="flex items-center gap-2 bg-dark-900/40 px-3 py-1.5 rounded-lg border border-dark-800/60">
                <input
                  type="checkbox"
                  id={`auto-update-toggle-${server.id}`}
                  checked={autoUpdateEnabled}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setAutoUpdateEnabled(checked);
                    try {
                      await tauriCommands.setSetting(`auto_update_enabled_${server.id}`, checked ? 'true' : 'false');
                      showNotification('success', checked ? 'Auto-Update enabled' : 'Auto-Update disabled');
                    } catch (err: any) {
                      showNotification('error', `Failed to save setting: ${err}`);
                    }
                  }}
                  className="w-3.5 h-3.5 accent-primary-500 rounded bg-dark-950 border-dark-700 cursor-pointer"
                />
                <label htmlFor={`auto-update-toggle-${server.id}`} className="text-xs font-bold text-dark-300 cursor-pointer select-none">
                  Auto-Update Server
                </label>
              </div>

              <div className="flex items-center gap-2 bg-dark-900/40 px-3 py-1.5 rounded-lg border border-dark-800/60">
                <input
                  type="checkbox"
                  id={`auto-start-toggle-${server.id}`}
                  checked={autoStartEnabled}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setAutoStartEnabled(checked);
                    try {
                      await tauriCommands.updateServerAutoStart(server.id, checked);
                      showNotification('success', checked ? 'Auto-Start enabled' : 'Auto-Start disabled');
                    } catch (err: any) {
                      showNotification('error', `Failed to update auto-start setting: ${err}`);
                    }
                  }}
                  className="w-3.5 h-3.5 accent-primary-500 rounded bg-dark-950 border-dark-700 cursor-pointer"
                />
                <label htmlFor={`auto-start-toggle-${server.id}`} className="text-xs font-bold text-dark-300 cursor-pointer select-none">
                  Auto-Start Server
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {isInstalled ? (
                <>
                  <button
                    onClick={handleUpdateServer}
                    disabled={installState.isInstalling || steamcmdInstalled === false}
                    className="btn-primary text-xs flex items-center gap-2"
                  >
                    Update Server
                  </button>
                  <button
                    onClick={handleValidateFiles}
                    disabled={installState.isInstalling || steamcmdInstalled === false}
                    className="btn-ghost text-xs border border-dark-700/50 hover:border-dark-600 flex items-center gap-2 text-dark-200"
                    title="Verify files integrity"
                  >
                    Validate Files
                  </button>
                  <button
                    onClick={handleInstallServer}
                    disabled={installState.isInstalling || steamcmdInstalled === false}
                    className="btn-ghost text-xs border border-dark-700/50 hover:border-dark-600 flex items-center gap-2 text-error-400 hover:text-error-300"
                    title="Re-download all server files"
                  >
                    Reinstall
                  </button>
                </>
              ) : (
                <button
                  onClick={handleInstallServer}
                  disabled={installState.isInstalling || steamcmdInstalled === false}
                  className="btn-primary text-xs flex items-center gap-2"
                >
                  Install Server (SteamCMD)
                </button>
              )}
              <button
                onClick={handleOpenFolder}
                className="btn-ghost text-xs border border-dark-700/50 hover:border-dark-600 flex items-center gap-2 text-dark-400 hover:text-dark-200"
              >
                Open Install Folder
              </button>
            </div>
          </div>

          {installState.isInstalling && installState.progress !== null && (
            <div className="mt-4 space-y-3 animate-fade-in p-4 rounded-xl bg-dark-950/40 border border-dark-800/60">
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

              <div className="flex justify-between items-center text-[10px] text-dark-500 font-mono">
                <div>
                  {installState.speed > 0 && (
                    <span>SPEED: <strong className="text-dark-300">{formatBytes(installState.speed)}/s</strong></span>
                  )}
                  {installState.eta !== null && installState.eta > 0 && (
                    <span className="ml-4">ETA: <strong className="text-dark-300">{formatUptime(installState.eta)}</strong></span>
                  )}
                </div>
                {installState.bytesTotal > 0 && (
                  <span>
                    {(installState.bytesDownloaded / (1024 * 1024)).toFixed(1)} MB / {(installState.bytesTotal / (1024 * 1024)).toFixed(1)} MB
                  </span>
                )}
              </div>
            </div>
          )}

          {installState.log && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider mb-1">
                Installation Log Output
              </div>
              <div className="relative rounded-lg overflow-hidden border border-dark-800 bg-dark-950/80">
                <pre className="console-output text-[11px] h-36 overflow-y-auto whitespace-pre-wrap font-mono p-3 leading-relaxed text-dark-300">
                  {installState.log}
                  <div ref={logEndRef} />
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Server Details Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Server Information */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
            Server Information
          </h3>
          
          {isLoadingDetails ? (
            <div className="space-y-4 py-2 animate-pulse">
              <div className="h-4 bg-dark-800/60 rounded w-2/3"></div>
              <div className="h-4 bg-dark-800/60 rounded w-1/2"></div>
              <div className="h-4 bg-dark-800/60 rounded w-5/6"></div>
              <div className="h-4 bg-dark-800/60 rounded w-3/4"></div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Status</span>
                <span className="text-xs text-dark-200 font-mono capitalize">{server.status}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Installation Status</span>
                <span className={`text-xs font-semibold ${isInstalled ? 'text-success-400' : 'text-error-400'}`}>
                  {isInstalled ? 'Installed' : 'Not Installed'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Preset</span>
                <span className="text-xs text-dark-200 font-mono">{server.preset}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Beta Branch</span>
                <span className="text-[10px] font-bold text-primary-400 bg-primary-500/10 px-2.5 py-0.5 rounded border border-primary-500/20 uppercase tracking-wider">
                  {extendedInfo?.branch || 'Public'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Build Number</span>
                <span className="text-xs text-dark-200 font-mono">{extendedInfo?.buildId || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Steam App ID</span>
                <span className="text-xs text-dark-200 font-mono">2394010</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Created Date</span>
                <span className="text-xs text-dark-200 font-mono">
                  {new Date(server.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Last Started</span>
                <span className="text-xs text-dark-200 font-mono">
                  {server.lastStarted ? new Date(server.lastStarted).toLocaleString() : 'Never'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Disk Space</span>
                <span className="text-xs text-dark-200 font-mono" title="Free / Total">
                  {extendedInfo ? `${formatBytes(extendedInfo.diskFreeBytes)} free / ${formatBytes(extendedInfo.diskTotalBytes)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Total Installed Size</span>
                <span className="text-xs text-dark-200 font-mono">
                  {extendedInfo ? formatBytes(extendedInfo.installSizeBytes) : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Save Folder Size</span>
                <span className="text-xs text-dark-200 font-mono">
                  {extendedInfo ? formatBytes(extendedInfo.saveSizeBytes) : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Mod Count</span>
                <span className="text-xs text-dark-200 font-mono">{extendedInfo?.modCount ?? 0} mods</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">Install Path</span>
                <span className="text-xs text-dark-200 font-mono truncate max-w-[220px]" title={server.installPath}>
                  {server.installPath}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Network & Config Card */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
            Network & Status Configuration
          </h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center h-7">
              <span className="text-xs text-dark-500">Local Address</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-dark-200 font-mono">{localIp}:{server.ports.gamePort}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${localIp}:${server.ports.gamePort}`);
                    showNotification('success', 'Local Address copied to clipboard!');
                  }}
                  className="p-1 rounded text-dark-400 hover:text-primary-400 hover:bg-dark-800/60 transition-colors"
                  title="Copy to clipboard"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                    <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v1H7a3 3 0 00-3 3v6H3a2 2 0 01-2-2V7a2 2 0 012-2h2z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center h-7">
              <span className="text-xs text-dark-500">Public Address</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-dark-200 font-mono">{publicIp}:{server.ports.gamePort}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${publicIp}:${server.ports.gamePort}`);
                    showNotification('success', 'Public Address copied to clipboard!');
                  }}
                  className="p-1 rounded text-dark-400 hover:text-primary-400 hover:bg-dark-800/60 transition-colors"
                  title="Copy to clipboard"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                    <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v1H7a3 3 0 00-3 3v6H3a2 2 0 01-2-2V7a2 2 0 012-2h2z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-dark-500">Game Port</span>
              <span className="text-xs text-dark-200 font-mono">{server.ports.gamePort}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-dark-500">RCON Port</span>
              <span className="text-xs text-dark-200 font-mono">{server.ports.rconPort}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-dark-500">REST API Port</span>
              <span className="text-xs text-dark-200 font-mono">{server.restApiConfig.port}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-dark-500">Max Players</span>
              <span className="text-xs text-dark-200 font-mono">{server.maxPlayers}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-dark-500">Public visibility</span>
              <span className="text-xs text-dark-200 font-mono">{server.isPublic ? 'Yes' : 'No'}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-xs text-dark-500">RCON Status</span>
              {isLoadingDetails ? (
                <span className="text-xs text-dark-500">Checking...</span>
              ) : extendedInfo?.rconStatus === 'connected' ? (
                <span className="text-xs text-success-400 font-medium bg-success-500/10 px-2.5 py-0.5 rounded border border-success-500/20 uppercase tracking-wider">🟢 Connected</span>
              ) : extendedInfo?.rconStatus === 'disabled' ? (
                <span className="text-xs text-dark-400 font-medium bg-dark-800 px-2.5 py-0.5 rounded border border-dark-700/60 uppercase tracking-wider">⚪ Disabled</span>
              ) : (
                <span className="text-xs text-error-400 font-medium bg-error-500/10 px-2.5 py-0.5 rounded border border-error-500/20 uppercase tracking-wider">🔴 Offline</span>
              )}
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-dark-500">REST API Status</span>
              {isLoadingDetails ? (
                <span className="text-xs text-dark-500">Checking...</span>
              ) : extendedInfo?.restApiStatus === 'active' ? (
                <span className="text-xs text-success-400 font-medium bg-success-500/10 px-2.5 py-0.5 rounded border border-success-500/20 uppercase tracking-wider">🟢 Active</span>
              ) : (
                <span className="text-xs text-dark-400 font-medium bg-dark-800 px-2.5 py-0.5 rounded border border-dark-700/60 uppercase tracking-wider">⚪ Disabled</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Completion Dialog Success Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-dark-950/85 backdrop-blur-md" 
            onClick={dismissCompletionModal} 
          />
          
          {/* Content Card */}
          <div className="relative glass-card border border-success-500/30 bg-dark-900/80 p-8 rounded-2xl shadow-2xl max-w-md w-full space-y-6 text-center animate-scale-in">
            {/* Checked Icon */}
            <div className="w-16 h-16 rounded-full bg-success-500/10 border border-success-500/20 text-success-400 mx-auto flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-8 h-8">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            
            {/* Title */}
            <div>
              <h2 className="text-md font-black uppercase text-gradient-cyan tracking-wider">
                Installation Completed
              </h2>
              <p className="text-xs text-dark-400 mt-2 leading-relaxed">
                Palworld Dedicated Server has been successfully installed/updated on your machine.
              </p>
            </div>

            {/* Stats Table */}
            <div className="bg-dark-950/50 border border-dark-800 rounded-xl p-4 space-y-2.5 text-xs text-left">
              <div className="flex justify-between">
                <span className="text-dark-500">Branch</span>
                <span className="text-primary-400 font-bold uppercase tracking-wider">{extendedInfo?.branch || selectedBranch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-500">Build Number</span>
                <span className="text-dark-200 font-mono font-bold">{extendedInfo?.buildId || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-500">Disk Space Used</span>
                <span className="text-dark-200 font-mono font-bold">{extendedInfo ? formatBytes(extendedInfo.installSizeBytes) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-500">Target Folder</span>
                <span className="text-dark-300 font-mono truncate max-w-[200px]" title={server.installPath}>
                  {server.installPath}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenFolder}
                className="flex-1 btn-ghost border border-dark-700/60 hover:border-dark-600 rounded-xl py-3 text-xs font-bold text-dark-200"
              >
                Open Folder
              </button>
              <button
                onClick={() => {
                  dismissCompletionModal();
                  tauriCommands.startServer(server.id).catch(console.error);
                }}
                className="flex-1 bg-gradient-to-r from-success-600 to-emerald-500 hover:from-success-500 hover:to-emerald-400 text-white rounded-xl py-3 text-xs font-black uppercase tracking-wider shadow-lg shadow-success-900/20 active:scale-[0.98] transition-all"
              >
                Start Server
              </button>
            </div>
            
            <button
              onClick={dismissCompletionModal}
              className="text-xs text-dark-500 hover:text-dark-300 transition-colors uppercase tracking-wider font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
