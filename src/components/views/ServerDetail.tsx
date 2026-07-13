import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore, type ServerTab } from '../../stores/useAppStore';
import { open } from '@tauri-apps/plugin-dialog';
import { tauriCommands, getStatusColor, formatUptime, formatBytes } from '../../lib/tauri';
import { useI18nStore } from '../../lib/i18n';
import { RconConsole } from '../tabs/RconConsole';
import { ConfigEditor } from '../tabs/ConfigEditor';
import { BackupsTab } from '../tabs/BackupsTab';
import { LogsTab } from '../tabs/LogsTab';
import { PlayersTab } from '../tabs/PlayersTab';
import { SchedulerTab } from '../tabs/SchedulerTab';
import { ModsTab } from '../tabs/ModsTab';
import { FirewallTab } from '../tabs/FirewallTab';
import { CustomSelect } from '../ui/CustomSelect';
import { RunningPal } from '../ui/RunningPal';

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

const tabs: { id: ServerTab; labelKey: string; defaultLabel: string }[] = [
  { id: 'overview', labelKey: 'nav.overview', defaultLabel: 'Overview' },
  { id: 'config', labelKey: 'nav.config', defaultLabel: 'Config' },
  { id: 'rcon', labelKey: 'nav.rcon', defaultLabel: 'RCON' },
  { id: 'players', labelKey: 'nav.players', defaultLabel: 'Players' },
  { id: 'backups', labelKey: 'nav.backups', defaultLabel: 'Backups' },
  { id: 'mods', labelKey: 'nav.mods', defaultLabel: 'Mod Manager' },
  { id: 'logs', labelKey: 'nav.logs', defaultLabel: 'Logs' },
  { id: 'scheduler', labelKey: 'nav.scheduler', defaultLabel: 'Scheduler' },
  { id: 'firewall', labelKey: 'nav.firewall', defaultLabel: 'Firewall' },
];

const formatStageName = (stage?: string) => {
  if (!stage) return 'Preparing';
  const spaced = stage.replace(/([A-Z])/g, ' $1');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export const ServerDetail: React.FC = () => {
  const { t } = useI18nStore();
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
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneInstallPath, setCloneInstallPath] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [backupFirst, setBackupFirst] = useState(true);

  // Mod compatibility warning states
  const [showModWarningModal, setShowModWarningModal] = useState(false);
  const [outdatedModsList, setOutdatedModsList] = useState<any[]>([]);
  const [pendingStartAction, setPendingStartAction] = useState<(() => Promise<void>) | null>(null);

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

  useEffect(() => {
    if (server?.isRemote && !['overview', 'rcon', 'players'].includes(activeServerTab)) {
      setActiveServerTab('overview');
    }
  }, [server?.isRemote, activeServerTab, setActiveServerTab]);

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

  const checkModCompatibilityAndRun = async (action: () => Promise<void>) => {
    try {
      const compats = await tauriCommands.checkModCompatibility(server.id);
      const outdated = compats.filter((m: any) => m.status === 'outdated');
      if (outdated.length > 0) {
        setOutdatedModsList(outdated);
        setPendingStartAction(() => action);
        setShowModWarningModal(true);
      } else {
        await action();
      }
    } catch (e) {
      // Fallback: start server anyway if compatibility check fails
      await action();
    }
  };

  const handleStart = async () => {
    checkModCompatibilityAndRun(async () => {
      try {
        await tauriCommands.startServer(server.id);
        showNotification('success', 'Server starting...');
        setActiveServerTab('logs');
        const updated = await tauriCommands.getServers();
        setServers(updated);
      } catch (e: any) {
        showNotification('error', `Start failed: ${e}`);
      }
    });
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
    checkModCompatibilityAndRun(async () => {
      try {
        await tauriCommands.restartServer(server.id);
        showNotification('success', 'Server restarting...');
        setActiveServerTab('logs');
        const updated = await tauriCommands.getServers();
        setServers(updated);
      } catch (e: any) {
        showNotification('error', `Restart failed: ${e}`);
      }
    });
  };

  const handleDelete = () => {
    setDeleteFiles(false);
    setBackupFirst(true);
    setIsDeleteModalOpen(true);
  };

  const handleClone = () => {
    setCloneName(`${server.name} - Clone`);
    setCloneInstallPath(`${server.installPath}_clone`);
    setIsCloneModalOpen(true);
  };

  const handleBrowseClonePath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: cloneInstallPath || undefined,
      });
      if (selected && typeof selected === 'string') {
        setCloneInstallPath(selected);
      }
    } catch (err) {
      console.error('Failed to open directory dialog:', err);
    }
  };

  const handleExecuteClone = async () => {
    if (!cloneName.trim()) {
      showNotification('error', 'Please enter a name for the clone');
      return;
    }
    if (!cloneInstallPath.trim()) {
      showNotification('error', 'Please enter/select a destination path');
      return;
    }

    setIsCloning(true);
    try {
      showNotification('info', `Cloning server "${server.name}" to "${cloneName}"...`);
      const newServer = await tauriCommands.cloneServer(server.id, cloneName.trim(), cloneInstallPath.trim());
      showNotification('success', `Successfully cloned server to "${newServer.name}"!`);
      
      // Refresh servers in the store
      const updated = await tauriCommands.getServers();
      setServers(updated);
      
      // Close the modal and redirect to dashboard
      setIsCloneModalOpen(false);
      setCurrentView('dashboard');
    } catch (err: any) {
      showNotification('error', `Failed to clone server: ${err}`);
    } finally {
      setIsCloning(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleteModalOpen(false);
    try {
      await tauriCommands.deleteServer(
        server.id,
        server.isRemote ? false : backupFirst,
        server.isRemote ? false : deleteFiles
      );
      showNotification('success', server.isRemote ? 'Server connection removed' : deleteFiles ? 'Server and installation files deleted' : 'Server profile deleted');
      const updated = await tauriCommands.getServers();
      setServers(updated);
      setCurrentView('dashboard');
    } catch (e: any) {
      showNotification('error', `Delete failed: ${e}`);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Are you sure you want to clear the server cache? This will delete temporary logs, crash dumps, and SteamCMD appcache to resolve startup issues and free up disk space. Your game save data will NOT be affected.')) return;
    try {
      await tauriCommands.clearServerCache(server.id);
      showNotification('success', 'Server cache cleared successfully.');
    } catch (e: any) {
      showNotification('error', `Failed to clear cache: ${e}`);
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
          {server.isRemote ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-400 bg-primary-500/10 border border-primary-500/20 rounded-lg">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 10-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0z" />
              </svg>
              Remote Connection
            </span>
          ) : isActive ? (
            <>
              <button
                onClick={handleRestart}
                className="group flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-dark-200 hover:text-dark-100 bg-dark-800 hover:bg-dark-750 border border-dark-700/50 hover:border-dark-600 rounded-lg transition-all duration-200 active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 transition-transform duration-700 ease-out group-hover:rotate-[360deg]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Restart
              </button>
              <button
                onClick={handleStop}
                className="btn-danger group animate-danger-hover flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-md active:scale-95 transition-all duration-200"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 animate-warning-shake">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
                </svg>
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
          {!server.isRemote && (
            <button
              onClick={handleClearCache}
              disabled={server.status === 'starting' || server.status === 'running'}
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-warning-400 hover:text-warning-300 hover:bg-warning-500/10 border border-warning-500/25 hover:border-warning-500/40 rounded-lg transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              title="Clear crash dumps, temporary logs, and SteamCMD cache to avoid crash loops and free up disk space"
            >
              Clear Cache
            </button>
          )}
          <button
            onClick={handleClone}
            className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/25 hover:border-cyan-500/40 rounded-lg transition-all duration-200 active:scale-95"
            title="Clone this server instance config, ports and saves"
          >
            Clone Server
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-error-400 hover:text-error-300 hover:bg-error-500/10 border border-error-500/20 hover:border-error-500/30 rounded-lg transition-all duration-200 active:scale-95"
          >
            {server.isRemote ? 'Remove Connection' : 'Delete Server'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-6 border-b border-dark-700/30 bg-dark-900/20">
        {(server.isRemote ? tabs.filter(t => ['overview', 'rcon', 'players'].includes(t.id)) : tabs).map((tab) => {
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
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {(server.status === 'starting' || server.status === 'stopping' || server.status === 'restarting' || server.status === 'updating') && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-dark-950/85 backdrop-blur-md animate-fade-in">
            <RunningPal
              size={96}
              variant={
                server.status === 'stopping' ? 'stopping' :
                server.status === 'restarting' ? 'restarting' :
                'running'
              }
              label={
                server.status === 'starting' ? 'Booting server nodes...' :
                server.status === 'stopping' ? 'Terminating server process...' :
                server.status === 'restarting' ? 'Rebooting system service...' :
                'Downloading server updates...'
              }
            />
            <p className="text-[9px] tracking-widest text-dark-500 uppercase font-bold mt-2.5 font-mono">
              Please stand by. Spawning desktop console.
            </p>
          </div>
        )}

        <div className={activeServerTab === 'overview' ? 'h-full block' : 'hidden'}>
          <OverviewTab key={server.id} server={server} stats={liveStats} onStart={handleStart} onClearCache={handleClearCache} />
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
              <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wider">
                {server.isRemote ? 'Remove Connection' : 'Confirm Server Deletion'}
              </h2>
            </div>
            
            {/* Body text */}
            <p className="text-xs text-dark-300 leading-relaxed">
              {server.isRemote ? (
                <>Are you sure you want to remove the connection to <strong className="text-dark-100 font-bold">"{server.name}"</strong>? This will only remove this profile from the application. The remote server will not be affected.</>
              ) : (
                <>Are you sure you want to delete server <strong className="text-dark-100 font-bold">"{server.name}"</strong>? This will remove all configuration settings. This action cannot be undone.</>
              )}
            </p>

            {/* Options */}
            {!server.isRemote && (
              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={backupFirst}
                    onChange={(e) => setBackupFirst(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/20"
                  />
                  <span className="text-xs text-dark-300 group-hover:text-dark-200 transition-colors selection:bg-transparent">
                    Create a backup before deleting configuration
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={deleteFiles}
                    onChange={(e) => setDeleteFiles(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-error-500/30 bg-dark-800 text-error-500 focus:ring-error-500/20"
                  />
                  <span className="text-xs text-dark-300 group-hover:text-error-400/90 transition-colors selection:bg-transparent">
                    Delete server installation directory & files from disk (Cannot be undone)
                  </span>
                </label>
              </div>
            )}

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
                {server.isRemote ? 'Remove' : 'Delete Server'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outdated Mods Warning Modal */}
      {showModWarningModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-dark-950/85 backdrop-blur-md" 
            onClick={() => setShowModWarningModal(false)} 
          />
          
          {/* Content Card */}
          <div className="relative glass-card border border-error-500/30 bg-dark-900/80 p-8 rounded-2xl shadow-2xl max-w-md w-full space-y-6 text-center animate-scale-in">
            {/* Warning Icon */}
            <div className="w-16 h-16 rounded-full bg-error-500/10 border border-error-500/20 text-error-400 mx-auto flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            {/* Title */}
            <div className="space-y-2">
              <h2 className="text-md font-black uppercase text-error-400 tracking-wider">
                Outdated Mods Detected!
              </h2>
              <p className="text-xs text-dark-400 leading-relaxed">
                The following mods were updated prior to the last server game update. Running them on a multiplayer server can cause connection crashes or disconnects.
              </p>
            </div>

            {/* List of outdated mods */}
            <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-dark-950/40 border border-dark-800 rounded-xl text-left custom-scrollbar">
              {outdatedModsList.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-[10px] text-dark-300">
                  <span className="font-semibold truncate">{m.name}</span>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-error-500/10 text-error-400 border border-error-500/20 flex-shrink-0 uppercase">
                    Outdated
                  </span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  setShowModWarningModal(false);
                  try {
                    for (const m of outdatedModsList) {
                      await tauriCommands.toggleMod(server.id, m.name, m.isLogicMod, false, m.isWorkshopMod);
                    }
                    showNotification('success', 'Outdated mods disabled.');
                    if (pendingStartAction) {
                      await pendingStartAction();
                    }
                  } catch (err) {
                    showNotification('error', `Failed to disable mods: ${err}`);
                  }
                }}
                className="w-full bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white rounded-xl py-3 text-xs font-black uppercase tracking-wider shadow-lg active:scale-[0.98] transition-all"
              >
                Disable Mods & Continue
              </button>
              <button
                onClick={async () => {
                  setShowModWarningModal(false);
                  if (pendingStartAction) {
                    await pendingStartAction();
                  }
                }}
                className="w-full bg-dark-800 hover:bg-dark-750 text-dark-200 border border-dark-700/60 rounded-xl py-2.5 text-xs font-bold transition-all"
              >
                Start Anyway (At Your Own Risk)
              </button>
              <button
                onClick={() => setShowModWarningModal(false)}
                className="w-full text-xs text-dark-500 hover:text-dark-300 font-bold uppercase tracking-wider transition-colors pt-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Clone Confirmation Modal */}
      {isCloneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsCloneModalOpen(false)} 
          />
          
          {/* Modal Content */}
          <div className="relative glass-card max-w-md w-full border border-cyan-500/20 bg-dark-900/60 p-6 shadow-2xl rounded-xl space-y-6 animate-scale-in">
            {/* Title */}
            <div className="flex items-center gap-3 text-cyan-400">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-cyan-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                </svg>
              </div>
              <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wider">
                Clone Server Instance
              </h2>
            </div>
            
            {/* Body */}
            <div className="space-y-4 pt-1">
              <div>
                <label className="text-[10px] text-dark-400 font-bold uppercase tracking-wider block mb-1.5">New Server Name</label>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  className="input-field text-xs bg-dark-950 border-dark-800"
                  placeholder="e.g. My Cloned Server"
                  disabled={isCloning}
                />
              </div>

              <div>
                <label className="text-[10px] text-dark-400 font-bold uppercase tracking-wider block mb-1.5">Destination Directory</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cloneInstallPath}
                    onChange={(e) => setCloneInstallPath(e.target.value)}
                    className="input-field text-xs bg-dark-950 border-dark-800 flex-1"
                    placeholder="C:\PalworldServers\MyClone"
                    disabled={isCloning}
                  />
                  <button
                    onClick={handleBrowseClonePath}
                    disabled={isCloning}
                    className="btn-ghost text-xs px-3 border border-dark-700/50 hover:bg-dark-800 font-semibold flex items-center justify-center gap-1.5"
                  >
                    Browse
                  </button>
                </div>
                <p className="text-[9px] text-dark-500 mt-1">
                  We will copy the save files and configs from the original server directory to this destination.
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setIsCloneModalOpen(false)}
                className="btn-ghost px-4 py-2 text-xs font-semibold rounded-lg text-dark-400 hover:text-dark-200 transition-colors"
                disabled={isCloning}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteClone}
                disabled={isCloning}
                className="bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
              >
                {isCloning ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                    Cloning...
                  </>
                ) : (
                  'Clone Instance'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Overview Tab ───────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ server: any; stats: any; onStart?: () => void; onClearCache?: () => void }> = ({ server, stats, onStart, onClearCache }) => {
  const { showNotification, installStates, setInstallState, setServers } = useAppStore();
  const [steamcmdInstalled, setSteamcmdInstalled] = useState<boolean | null>(null);
  const [isInstallingSteamcmd, setIsInstallingSteamcmd] = useState(false);
  const [showSteamcmdModal, setShowSteamcmdModal] = useState(false);

  const [publicIp, setPublicIp] = useState('Fetching...');
  const [localIp, setLocalIp] = useState('Fetching...');
  
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [extendedInfo, setExtendedInfo] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(server.branch || 'public');
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [autoStartEnabled, setAutoStartEnabled] = useState(server.autoStart ?? false);
  const [autoRestartEnabled, setAutoRestartEnabled] = useState(server.autoRestart ?? true);
  const [runAsAdminEnabled, setRunAsAdminEnabled] = useState(server.runAsAdmin ?? false);
  const [optimizeRamEnabled, setOptimizeRamEnabled] = useState(server.optimizeRam ?? true);

  useEffect(() => {
    setAutoStartEnabled(server.autoStart ?? false);
    setAutoRestartEnabled(server.autoRestart ?? true);
    setRunAsAdminEnabled(server.runAsAdmin ?? false);
    setOptimizeRamEnabled(server.optimizeRam ?? true);
  }, [server.autoStart, server.autoRestart, server.runAsAdmin, server.optimizeRam]);

  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

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
    stage: 'Preparing',
    speedBps: 0,
    avgSpeedBps: 0,
    peakSpeedBps: 0,
    diskWriteSpeedBps: 0,
    diskReadSpeedBps: 0,
    cdnServer: '',
    elapsedSeconds: 0,
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

      const activeState = await tauriCommands.getActiveInstallationState(server.id);
      if (activeState) {
        setInstallState(server.id, {
          isInstalling: activeState.isInstalling,
          stage: activeState.stage,
          progress: activeState.progress,
          status: activeState.status,
          bytesDownloaded: activeState.bytesDownloaded,
          bytesTotal: activeState.bytesTotal,
          log: activeState.log,
          speed: activeState.speedBps,
          speedBps: activeState.speedBps,
          avgSpeedBps: activeState.avgSpeedBps,
          peakSpeedBps: activeState.peakSpeedBps,
          diskWriteSpeedBps: activeState.diskWriteSpeedBps,
          diskReadSpeedBps: activeState.diskReadSpeedBps,
          eta: activeState.etaSeconds,
          cdnServer: activeState.cdnServer,
          elapsedSeconds: activeState.elapsedSeconds,
        });
      }
    } catch (e) {
      console.error("Failed to fetch extended server details:", e);
    } finally {
      setIsLoadingDetails(false);
    }
  }, [server.id, server.installPath, setInstallState]);

  const runDiag = async () => {
    setIsRunningDiag(true);
    try {
      const res = await tauriCommands.runInstallationDiagnostics(server.id);
      setDiagnostics(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRunningDiag(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await tauriCommands.getServerInstallationHistory(server.id);
      setHistory(res);
    } catch (err) {
      console.error(err);
    }
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
    fetchDetails();
  }, [fetchDetails]);

  useEffect(() => {
    if (server.id) {
      runDiag();
      fetchHistory();
    }
  }, [server.id, installState.isInstalling]);

  // Auto-scroll the log console to bottom when it changes
  useEffect(() => {
    if (logEndRef.current) {
      const container = logEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [installState.log]);

  // Local timer to update elapsed seconds second-by-second when installing
  useEffect(() => {
    if (!installState.isInstalling) {
      setElapsedTime(0);
      return;
    }

    setElapsedTime(installState.elapsedSeconds || 0);

    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [installState.isInstalling]);

  // Sync with authoritative backend ticks
  useEffect(() => {
    if (installState.isInstalling && installState.elapsedSeconds !== undefined) {
      setElapsedTime(installState.elapsedSeconds);
    }
  }, [installState.elapsedSeconds, installState.isInstalling]);

  // Detect when installation finishes to show the modal
  const lastInstallStage = useRef(installState.stage);
  useEffect(() => {
    if (lastInstallStage.current !== 'completed' && installState.stage === 'completed') {
      setShowCompletionModal(true);
      fetchDetails();
    }
    lastInstallStage.current = installState.stage;
  }, [installState.stage, fetchDetails]);

  const dismissCompletionModal = () => {
    setShowCompletionModal(false);
    setInstallState(server.id, { stage: 'Preparing' as any, status: '' });
  };

  const handleWipeSaves = async () => {
    if (wipeConfirmText !== 'WIPE') return;
    setIsWiping(true);
    try {
      await tauriCommands.wipeServer(server.id, true, false);
      showNotification('success', 'Server save games wiped successfully!');
      setIsWipeModalOpen(false);
      setWipeConfirmText('');
      fetchDetails();
    } catch (e: any) {
      showNotification('error', `Wipe failed: ${e}`);
    } finally {
      setIsWiping(false);
    }
  };

  const handleResetConfig = async () => {
    if (resetConfirmText !== 'RESET') return;
    setIsWiping(true);
    try {
      await tauriCommands.wipeServer(server.id, false, true);
      showNotification('success', 'Server configurations reset to default successfully!');
      setIsResetModalOpen(false);
      setResetConfirmText('');
      const updated = await tauriCommands.getServers();
      setServers(updated);
      fetchDetails();
    } catch (e: any) {
      showNotification('error', `Reset failed: ${e}`);
    } finally {
      setIsWiping(false);
    }
  };

  const handleInstallSteamcmd = async () => {
    setIsInstallingSteamcmd(true);
    try {
      showNotification('info', 'Installing SteamCMD...');
      await tauriCommands.installSteamcmd();
      showNotification('success', 'SteamCMD installed successfully');
      setSteamcmdInstalled(true);
      setShowSteamcmdModal(true);
    } catch (e: any) {
      showNotification('error', `Failed to install SteamCMD: ${e}`);
    } finally {
      setIsInstallingSteamcmd(false);
    }
  };

  const handleInstallServer = async () => {
    setInstallState(server.id, {
      isInstalling: true,
      progress: 0,
      status: 'Preparing',
      log: `Starting Palworld Dedicated Server Installation (Branch: ${selectedBranch})...\n`,
      speed: 0,
      eta: null,
      stage: 'Preparing',
      speedBps: 0,
      avgSpeedBps: 0,
      peakSpeedBps: 0,
      diskWriteSpeedBps: 0,
      diskReadSpeedBps: 0,
      cdnServer: 'Connecting...',
      elapsedSeconds: 0,
    });
    try {
      showNotification('info', 'Starting Palworld server installation...');
      await tauriCommands.startServerInstallation(server.id, selectedBranch);
    } catch (e: any) {
      setInstallState(server.id, { isInstalling: false });
      showNotification('error', `Failed to start installation: ${e}`);
    }
  };

  const handleUpdateServer = async () => {
    setInstallState(server.id, {
      isInstalling: true,
      progress: 0,
      status: 'Preparing',
      log: `Starting server update (Branch: ${selectedBranch})...\n`,
      speed: 0,
      eta: null,
      stage: 'Preparing',
      speedBps: 0,
      avgSpeedBps: 0,
      peakSpeedBps: 0,
      diskWriteSpeedBps: 0,
      diskReadSpeedBps: 0,
      cdnServer: 'Connecting...',
      elapsedSeconds: 0,
    });
    try {
      showNotification('info', 'Starting Palworld server update...');
      await tauriCommands.startServerInstallation(server.id, selectedBranch);
    } catch (e: any) {
      setInstallState(server.id, { isInstalling: false });
      showNotification('error', `Failed to start update: ${e}`);
    }
  };

  const handleValidateFiles = async () => {
    setInstallState(server.id, {
      isInstalling: true,
      progress: 0,
      status: 'Preparing',
      log: `Starting file validation (Branch: ${selectedBranch})...\n`,
      speed: 0,
      eta: null,
      stage: 'Preparing',
      speedBps: 0,
      avgSpeedBps: 0,
      peakSpeedBps: 0,
      diskWriteSpeedBps: 0,
      diskReadSpeedBps: 0,
      cdnServer: 'Connecting...',
      elapsedSeconds: 0,
    });
    try {
      showNotification('info', 'Starting file validation...');
      await tauriCommands.startServerInstallation(server.id, selectedBranch);
    } catch (e: any) {
      setInstallState(server.id, { isInstalling: false });
      showNotification('error', `Failed to start validation: ${e}`);
    }
  };

  const handleCancelInstallation = async () => {
    try {
      showNotification('info', 'Cancelling server installation...');
      await tauriCommands.cancelServerInstallation(server.id);
      showNotification('success', 'Installation cancelled successfully');
      setInstallState(server.id, { isInstalling: false });
      fetchDetails();
    } catch (e: any) {
      showNotification('error', `Failed to cancel: ${e}`);
    }
  };

  const handleBranchChange = async (newBranch: string) => {
    try {
      setSelectedBranch(newBranch);
      await tauriCommands.updateServerBranch(server.id, newBranch);
      showNotification('info', `Branch updated to ${newBranch}. Validating files...`);
      
      setInstallState(server.id, {
        isInstalling: true,
        progress: 0,
        status: 'Preparing',
        log: `Changing branch to ${newBranch} and validating server files...\n`,
        speed: 0,
        eta: null,
        stage: 'Preparing',
        speedBps: 0,
        avgSpeedBps: 0,
        peakSpeedBps: 0,
        diskWriteSpeedBps: 0,
        diskReadSpeedBps: 0,
        cdnServer: 'Connecting...',
        elapsedSeconds: 0,
      });
      await tauriCommands.startServerInstallation(server.id, newBranch);
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

  const getDiagStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'online': case 'excellent': case 'healthy': case 'ok': case 'ready': case 'configured':
        return 'text-success-400 border-success-500/20 bg-success-500/5';
      case 'poor': case 'low':
        return 'text-warning-400 border-warning-500/20 bg-warning-500/5';
      default:
        return 'text-error-400 border-error-500/20 bg-error-500/5';
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
            {(server.status === 'starting' || server.status === 'stopping' || server.status === 'restarting' || server.status === 'updating') ? (
              <RunningPal
                size={88}
                variant={
                  server.status === 'stopping' ? 'stopping' :
                  server.status === 'restarting' ? 'restarting' :
                  'running'
                }
                label={
                  server.status === 'starting' ? 'Starting Server...' :
                  server.status === 'stopping' ? 'Stopping Server...' :
                  server.status === 'restarting' ? 'Restarting Server...' :
                  'Updating Server...'
                }
              />
            ) : (
              <span className="px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-lg bg-error-500/10 text-error-400 border border-error-500/30 shadow-error-950/20">
                ● Server Offline
              </span>
            )}
          </div>
        )}
      </div>

      {server.status === 'crashed' && !server.isRemote && (
        <div className="glass-card p-5 border border-error-500/25 bg-error-500/5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-full bg-error-500/10 border border-error-500/20 text-error-400 flex items-center justify-center shrink-0">
              ⚠️
            </span>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-error-400 uppercase tracking-wider">Server Crash Detected</h4>
              <p className="text-xs text-dark-400 leading-relaxed">
                The server has crashed or failed to start. Deleting cached logs, crash dumps, and SteamCMD cache files can resolve file locking conflicts, recover disk space, and prevent crash-loops.
              </p>
            </div>
          </div>
          <button
            onClick={onClearCache}
            className="w-full md:w-auto bg-gradient-to-r from-warning-600 to-amber-500 hover:from-warning-500 hover:to-amber-400 text-white rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg shadow-warning-950/20 active:scale-95 transition-all shrink-0"
          >
            Clear Cache & Fix
          </button>
        </div>
      )}

      {/* SteamCMD Installation Panel */}
      {!isActive && (
        <div className="glass-card p-6 space-y-6 relative z-20 overflow-hidden border border-dark-800/80 bg-dark-900/20">
          {isInstallingSteamcmd ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <RunningPal size={88} />
              <div className="space-y-1.5 text-center">
                <h4 className="text-xs font-black text-gradient-cyan uppercase tracking-widest animate-pulse">
                  Installing SteamCMD...
                </h4>
                <p className="text-[11px] text-dark-500 max-w-xs leading-relaxed mx-auto">
                  Downloading official SteamCMD binaries from Valve and setting up local runner environment. Please hold on.
                </p>
              </div>
            </div>
          ) : steamcmdInstalled === null ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] text-dark-500 font-bold uppercase tracking-wider">Checking SteamCMD...</span>
            </div>
          ) : !steamcmdInstalled ? (
            <div className="space-y-6">
              {/* Header row */}
              <div className="flex items-center justify-between border-b border-dark-800/60 pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-xs font-black uppercase text-dark-100 tracking-wider">
                      Server Installation & Updates
                    </h3>
                    <span className="text-[10px] text-error-400 font-extrabold bg-error-500/10 px-2.5 py-0.5 rounded border border-error-500/20 uppercase tracking-wider">
                      SteamCMD Missing
                    </span>
                  </div>
                  <p className="text-xs text-dark-500 mt-1">
                    Download, update, and validate server files using high-speed SteamCMD streaming.
                  </p>
                </div>
              </div>
              
              {/* Warning Banner */}
              <div className="bg-error-500/5 border border-error-500/10 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-1.5 text-center md:text-left">
                  <h4 className="text-xs font-black uppercase tracking-wider text-error-400 flex items-center justify-center md:justify-start gap-2">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    SteamCMD Setup Required
                  </h4>
                  <p className="text-[11px] text-dark-400 leading-relaxed max-w-xl">
                    SteamCMD utility is not installed on your system. This utility is required to download, update, and validate your Palworld Dedicated Server files directly from Valve's official repository.
                  </p>
                </div>
                <button
                  onClick={handleInstallSteamcmd}
                  className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 hover:text-primary-300 border border-primary-500/30 hover:border-primary-500/50 font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-widest transition-all duration-200 active:scale-95 shrink-0 flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
                  Install SteamCMD
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header row */}
              <div className="flex items-center justify-between border-b border-dark-800/60 pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-xs font-black uppercase text-dark-100 tracking-wider">
                      Server Installation & Updates
                    </h3>
                    {isInstalled === true ? (
                      <span className="text-[10px] text-success-400 font-extrabold bg-success-500/10 px-2.5 py-0.5 rounded border border-success-500/20 uppercase tracking-wider">
                        Installed
                      </span>
                    ) : (
                      <span className="text-[10px] text-error-400 font-extrabold bg-error-500/10 px-2.5 py-0.5 rounded border border-error-500/20 uppercase tracking-wider animate-pulse">
                        Not Installed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-dark-500 mt-1">
                    Download, update, and validate server files using high-speed SteamCMD streaming.
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs text-dark-400 font-medium">SteamCMD Status:</span>
                  <span className="text-xs text-success-400 font-bold bg-success-500/10 px-3 py-1 rounded-full border border-success-500/20">
                    Ready
                  </span>
                </div>
              </div>

              {/* Config Controls Row (Hidden when installing) */}
              {!installState.isInstalling && (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-dark-400 font-bold uppercase tracking-wider">Beta Branch:</label>
                      <CustomSelect
                        options={[
                          { value: 'public', label: 'Public Release' },
                          { value: 'experimental', label: 'Experimental Beta' },
                          { value: 'preview', label: 'Preview Branch' },
                          { value: 'development', label: 'Developer Beta' },
                        ]}
                        value={selectedBranch}
                        onChange={handleBranchChange}
                        disabled={installState.isInstalling}
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

                    <div className="flex items-center gap-2 bg-dark-900/40 px-3 py-1.5 rounded-lg border border-dark-800/60">
                      <input
                        type="checkbox"
                        id={`auto-restart-toggle-${server.id}`}
                        checked={autoRestartEnabled}
                        onChange={async (e) => {
                          const checked = e.target.checked;
                          setAutoRestartEnabled(checked);
                          try {
                            await tauriCommands.updateServerAutoRestart(server.id, checked);
                            showNotification('success', checked ? 'Auto-Restart on Crash enabled' : 'Auto-Restart on Crash disabled');
                          } catch (err: any) {
                            showNotification('error', `Failed to update auto-restart setting: ${err}`);
                          }
                        }}
                        className="w-3.5 h-3.5 accent-primary-500 rounded bg-dark-950 border-dark-700 cursor-pointer"
                      />
                      <label htmlFor={`auto-restart-toggle-${server.id}`} className="text-xs font-bold text-dark-300 cursor-pointer select-none">
                        Auto-Restart on Crash
                      </label>
                    </div>

                    <div className="flex items-center gap-2 bg-dark-900/40 px-3 py-1.5 rounded-lg border border-dark-800/60" title="Run the server executable elevated with administrator privileges (triggers UAC check)">
                      <input
                        type="checkbox"
                        id={`run-as-admin-toggle-${server.id}`}
                        checked={runAsAdminEnabled}
                        onChange={async (e) => {
                          const checked = e.target.checked;
                          setRunAsAdminEnabled(checked);
                          try {
                            await tauriCommands.updateServerRunAsAdmin(server.id, checked);
                            showNotification('success', checked ? 'Run as Admin enabled' : 'Run as Admin disabled');
                          } catch (err: any) {
                            showNotification('error', `Failed to update run as admin setting: ${err}`);
                          }
                        }}
                        className="w-3.5 h-3.5 accent-primary-500 rounded bg-dark-950 border-dark-700 cursor-pointer"
                      />
                      <label htmlFor={`run-as-admin-toggle-${server.id}`} className="text-xs font-bold text-dark-300 cursor-pointer select-none">
                        Run Server as Admin
                      </label>
                    </div>

                    <div className="flex items-center gap-2 bg-dark-900/40 px-3 py-1.5 rounded-lg border border-dark-800/60" title="Enable custom garbage collection (Engine.ini Tuning) and launch performance flags to reduce RAM overhead">
                      <input
                        type="checkbox"
                        id={`optimize-ram-toggle-${server.id}`}
                        checked={optimizeRamEnabled}
                        onChange={async (e) => {
                          const checked = e.target.checked;
                          setOptimizeRamEnabled(checked);
                          try {
                            await tauriCommands.updateServerOptimizeRam(server.id, checked);
                            showNotification('success', checked ? 'RAM Optimization enabled' : 'RAM Optimization disabled');
                          } catch (err: any) {
                            showNotification('error', `Failed to update RAM optimization: ${err}`);
                          }
                        }}
                        className="w-3.5 h-3.5 accent-primary-500 rounded bg-dark-950 border-dark-700 cursor-pointer"
                      />
                      <label htmlFor={`optimize-ram-toggle-${server.id}`} className="text-xs font-bold text-dark-300 cursor-pointer select-none">
                        Optimize Server RAM
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isInstalled ? (
                      <>
                        <button
                          onClick={handleUpdateServer}
                          disabled={installState.isInstalling}
                          className="bg-gradient-to-r from-primary-600 to-cyan-500 hover:from-primary-500 hover:to-cyan-400 text-white rounded-lg px-4 py-2 text-xs font-bold shadow-lg shadow-primary-950/20 active:scale-95 transition-all"
                        >
                          Update Server
                        </button>
                        <button
                          onClick={handleValidateFiles}
                          disabled={installState.isInstalling}
                          className="btn-ghost text-xs border border-dark-700/60 hover:border-dark-600 rounded-lg px-4 py-2 text-dark-200"
                          title="Verify files integrity"
                        >
                          Validate Files
                        </button>
                        <button
                          onClick={onClearCache}
                          disabled={installState.isInstalling || isActive}
                          className="btn-ghost text-xs border border-warning-500/20 hover:border-warning-500/35 text-warning-400 rounded-lg px-4 py-2 hover:bg-warning-500/10 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
                          title="Clear crash dumps, temporary logs, and SteamCMD cache"
                        >
                          Clear Cache
                        </button>
                        <button
                          onClick={handleInstallServer}
                          disabled={installState.isInstalling}
                          className="btn-ghost text-xs border border-dark-700/60 hover:border-dark-600 rounded-lg px-4 py-2 text-error-400 hover:text-error-300"
                          title="Re-download all server files"
                        >
                          Reinstall
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleInstallServer}
                        disabled={installState.isInstalling}
                        className="bg-gradient-to-r from-primary-600 to-cyan-500 hover:from-primary-500 hover:to-cyan-400 text-white rounded-lg px-6 py-2.5 text-xs font-bold shadow-lg shadow-primary-950/20 active:scale-95 transition-all"
                      >
                        Install Server (SteamCMD)
                      </button>
                    )}
                    <button
                      onClick={handleOpenFolder}
                      className="btn-ghost text-xs border border-dark-700/60 hover:border-dark-600 rounded-lg px-4 py-2 text-dark-400 hover:text-dark-200"
                    >
                      Open Install Folder
                    </button>
                  </div>
                </div>
              )}

          {/* Active Installation Dashboard */}
          {installState.isInstalling && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-dark-800/40">
              
              {/* Left Column: Progress circle, Timeline, Performance stats */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* Circular Progress Panel */}
                <div className="glass-card p-5 flex items-center gap-5 border border-dark-800/60 bg-dark-950/30">
                  <div className="relative flex items-center justify-center h-24 w-24">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="#11131a"
                        strokeWidth="6"
                        fill="transparent"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="url(#progress-gradient)"
                        strokeWidth="6"
                        fill="transparent"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 - ((installState.progress || 0) / 100) * 2 * Math.PI * 40}`}
                        className="transition-all duration-300 ease-out"
                      />
                      <defs>
                        <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#22d3ee" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-lg font-black text-dark-100 font-mono">
                        {installState.progress !== null ? `${installState.progress.toFixed(0)}%` : '—'}
                      </span>
                      <span className="text-[8px] text-dark-500 font-bold uppercase tracking-wider">
                        {formatStageName(installState.stage)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex-1 space-y-1">
                    <div className="text-xs font-bold text-dark-200">
                      {installState.status || 'Processing installation...'}
                    </div>
                    <div className="text-[10px] text-dark-400 font-mono flex flex-col gap-0.5">
                      {installState.bytesTotal > 0 && (
                        <span>
                          {formatBytes(installState.bytesDownloaded)} / {formatBytes(installState.bytesTotal)}
                        </span>
                      )}
                      {installState.eta !== null && installState.eta > 0 && (
                        <span>
                          Time Remaining: <strong className="text-cyan-400">{formatUptime(installState.eta)}</strong>
                        </span>
                      )}
                      <span>
                        Elapsed Time: <strong className="text-dark-300">{formatUptime(elapsedTime)}</strong>
                      </span>
                    </div>
                    <button
                      onClick={handleCancelInstallation}
                      className="mt-2 text-[10px] font-bold text-error-400 hover:text-error-300 bg-error-500/5 hover:bg-error-500/10 border border-error-500/20 rounded px-2.5 py-1 uppercase tracking-wider active:scale-95 transition-all"
                    >
                      Cancel Installation
                    </button>
                  </div>
                </div>

                {/* Timeline Panel */}
                <div className="glass-card p-5 border border-dark-800/60 space-y-4 hover:border-dark-700/80 transition-all duration-300">
                  <h4 className="text-[10px] font-extrabold text-dark-400 uppercase tracking-wider">
                    Pipeline Stages
                  </h4>
                  
                  <div className="relative pl-8 space-y-6 border-l border-l-dark-800/60 ml-3">
                    {[
                      { key: 'preparing', label: 'Preparing Environment', desc: 'Resolving paths and binaries', match: ['preparing', 'checkingUpdates', 'initializingRuntime'] },
                      { key: 'connecting', label: 'Connecting to Steam', desc: 'Logging in anonymously', match: ['connecting', 'authenticating'] },
                      { key: 'manifest', label: 'Fetching Build Manifest', desc: 'Reading app branch configuration', match: ['fetchingManifest'] },
                      { key: 'allocating', label: 'Allocating Disk Space', desc: 'Reserving target folder space', match: ['allocatingDiskSpace'] },
                      { key: 'downloading', label: 'Downloading', desc: 'Transferring app files', match: ['downloading'] },
                      { key: 'verifying', label: 'Verifying Integrity', desc: 'Checking block checksums', match: ['verifying'] },
                      { key: 'finalizing', label: 'Finalizing Installation', desc: 'Validating build completion', match: ['installing', 'finalizing', 'completed'] },
                    ].map((step, idx) => {
                      const currentStage = (installState.stage || 'preparing').toLowerCase();
                      const curIdx = [
                        ['preparing', 'checkingupdates', 'initializingruntime'],
                        ['connecting', 'authenticating'],
                        ['fetchingmanifest'],
                        ['allocatingdiskspace'],
                        ['downloading'],
                        ['verifying'],
                        ['installing', 'finalizing', 'completed'],
                      ].findIndex(stages => stages.includes(currentStage));
                      
                      const isCompleted = idx < curIdx || currentStage === 'completed';
                      const isActive = idx === curIdx && currentStage !== 'completed';
                      
                      return (
                        <div key={step.key} className="relative flex items-start gap-1">
                          <span 
                            className={`absolute -left-[44px] top-0 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                              isCompleted
                                ? 'bg-success-950 border-success-500 text-success-400'
                                : isActive
                                ? 'bg-primary-950 border-primary-500 text-primary-400 shadow-md shadow-primary-500/20'
                                : 'bg-dark-900 border-dark-800 text-dark-500'
                            } transition-all duration-300`}
                          >
                            {isCompleted ? (
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : isActive ? (
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                              </span>
                            ) : (
                              <span className="font-mono text-[9px]">{idx + 1}</span>
                            )}
                          </span>
                          
                          <div className="space-y-0.5">
                            <div className={`text-xs font-bold transition-colors ${isActive ? 'text-primary-400' : isCompleted ? 'text-dark-300' : 'text-dark-500'}`}>
                              {step.label}
                            </div>
                            <div className="text-[10px] text-dark-500 leading-normal">{step.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Performance Stats Mini-Dashboard */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-card p-3 border border-dark-800/60 bg-dark-950/20 border-l-2 border-l-cyan-500 pl-3">
                    <span className="text-[9px] font-bold text-dark-500 uppercase tracking-wider">Network Speed</span>
                    <div className="text-sm font-black text-cyan-400 font-mono mt-1">
                      {formatBytes(installState.speedBps || 0)}/s
                    </div>
                    <div className="text-[9px] text-dark-500 mt-0.5 font-mono">
                      Peak: {formatBytes(installState.peakSpeedBps || 0)}/s
                    </div>
                  </div>
                  
                  <div className="glass-card p-3 border border-dark-800/60 bg-dark-950/20 border-l-2 border-l-warning-500 pl-3">
                    <span className="text-[9px] font-bold text-dark-500 uppercase tracking-wider">Disk IO</span>
                    <div className="text-sm font-black text-warning-400 font-mono mt-1">
                      W: {formatBytes(installState.diskWriteSpeedBps || 0)}/s
                    </div>
                    <div className="text-[9px] text-dark-500 mt-0.5 font-mono">
                      R: {formatBytes(installState.diskReadSpeedBps || 0)}/s
                    </div>
                  </div>

                  <div className="col-span-2 glass-card p-3 border border-dark-800/60 bg-dark-950/20 flex justify-between items-center text-xs">
                    <span className="text-dark-500">Steam CDN node</span>
                    <span className="font-bold text-dark-300 font-mono text-[10px] truncate max-w-[200px]" title={installState.cdnServer}>
                      {installState.cdnServer || 'Detecting CDN node...'}
                    </span>
                  </div>
                </div>

              </div>

              {/* Right Column: Live Logs console, Diagnostics panel, History list */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Virtualized Console Logs */}
                <div className="glass-card border border-dark-800 bg-dark-950 overflow-hidden flex flex-col h-[320px]">
                  <div className="flex justify-between items-center px-4 py-2 border-b border-dark-800 bg-dark-900/60 text-xs">
                    <span className="text-dark-400 font-bold uppercase tracking-wider font-mono">Terminal Output</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (installState.log) {
                            navigator.clipboard.writeText(installState.log);
                            showNotification('success', 'Console log copied to clipboard');
                          }
                        }}
                        className="text-[10px] text-dark-400 hover:text-dark-200 uppercase tracking-wider font-bold"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => {
                          setInstallState(server.id, { log: '' });
                        }}
                        className="text-[10px] text-error-400 hover:text-error-300 uppercase tracking-wider font-bold"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed text-dark-300 bg-dark-950/80">
                    <pre className="whitespace-pre-wrap word-break-all font-mono">
                      {installState.log}
                      <div ref={logEndRef} />
                    </pre>
                  </div>
                </div>

                {/* Diagnostics Panel */}
                <div className="glass-card p-5 border border-dark-800/80 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-extrabold text-dark-400 uppercase tracking-wider">
                      SteamCMD Pre-Flight Diagnostics
                    </h4>
                    <button
                      onClick={runDiag}
                      disabled={isRunningDiag}
                      className="text-[10px] font-bold text-primary-400 hover:text-primary-300 uppercase tracking-wider"
                    >
                      {isRunningDiag ? 'Running...' : 'Run Diag'}
                    </button>
                  </div>

                  {diagnostics ? (
                    <div className="space-y-2.5 text-xs">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className={`p-2.5 rounded-lg border flex justify-between items-center ${getDiagStatusColor(diagnostics.steamStatus)}`}>
                          <span>Steam Servers</span>
                          <span className="font-bold uppercase text-[10px]">{diagnostics.steamStatus}</span>
                        </div>
                        <div className={`p-2.5 rounded-lg border flex justify-between items-center ${getDiagStatusColor(diagnostics.internetPing)}`}>
                          <span>Network Speed</span>
                          <span className="font-bold uppercase text-[10px]">{diagnostics.internetPing}</span>
                        </div>
                        <div className={`p-2.5 rounded-lg border flex justify-between items-center ${getDiagStatusColor(diagnostics.diskSpace)}`}>
                          <span>Disk Capacity</span>
                          <span className="font-bold uppercase text-[10px]">{diagnostics.diskSpace}</span>
                        </div>
                        <div className={`p-2.5 rounded-lg border flex justify-between items-center ${getDiagStatusColor(diagnostics.writePermissions)}`}>
                          <span>Folder Locks</span>
                          <span className="font-bold uppercase text-[10px]">{diagnostics.writePermissions}</span>
                        </div>
                      </div>

                      {diagnostics.issues && diagnostics.issues.length > 0 && (
                        <div className="bg-error-500/5 border border-error-500/20 rounded-xl p-3.5 space-y-2">
                          <span className="text-[10px] font-extrabold text-error-400 uppercase tracking-wider">Detected Issues</span>
                          {diagnostics.issues.map((issue: any, i: number) => (
                            <div key={i} className="text-xs space-y-1 border-t border-error-500/10 pt-2 first:border-0 first:pt-0">
                              <div className="font-bold text-error-300">{issue.category}: {issue.cause}</div>
                              <div className="text-dark-400 text-[11px] leading-relaxed">{issue.description}</div>
                              <div className="text-success-400 text-[10px] font-semibold">Recommended: {issue.recommendedFix}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-dark-500 animate-pulse text-center py-2">
                      Loading diagnostics indices...
                    </div>
                  )}
                </div>

                {/* History list */}
                {history && history.length > 0 && (
                  <div className="glass-card p-5 border border-dark-850 space-y-3">
                    <h4 className="text-[10px] font-extrabold text-dark-400 uppercase tracking-wider">
                      Installation History Logs
                    </h4>
                    
                    <div className="space-y-3 max-h-[140px] overflow-y-auto pr-1">
                      {history.slice(0, 5).map((entry) => (
                        <div key={entry.id} className="flex justify-between items-start text-xs border-b border-dark-800/40 pb-2.5 last:border-0 last:pb-0 gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-dark-300">
                              {entry.status === 'completed' ? `Build ${entry.version || 'unknown'}` : 'Installation Failed'}
                            </div>
                            {entry.status !== 'completed' && entry.notes && (
                              <div className="text-[10px] text-error-400/80 mt-1 leading-relaxed break-words max-w-sm">
                                {entry.notes}
                              </div>
                            )}
                            <div className="text-[10px] text-dark-500 mt-1">{new Date(entry.createdAt).toLocaleString()}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${entry.status === 'completed' ? 'bg-success-500/10 text-success-400 border border-success-500/20' : 'bg-error-500/10 text-error-400 border border-error-500/20'}`}>
                              {entry.status}
                            </span>
                            <div className="text-[9px] text-dark-400 font-mono mt-1">
                              {formatBytes(entry.downloadedSize)} in {formatUptime(entry.durationSeconds)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
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

      {/* Danger Zone */}
      <div className="glass-card p-5 border border-error-500/10 bg-dark-900/10 space-y-4">
        <h3 className="text-xs font-semibold text-error-400 uppercase tracking-wider flex items-center gap-1.5">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-error-500 shrink-0">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Danger Zone
        </h3>
        <p className="text-[11px] text-dark-450 leading-relaxed">
          Critical operations that can cause permanent data loss or reset your server configurations.
        </p>

        <div className="divide-y divide-dark-800/40">
          {/* Reset Config */}
          <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <div className="pr-4">
              <div className="text-xs font-bold text-dark-200">Reset Server Configuration</div>
              <div className="text-[10px] text-dark-450 mt-1 max-w-lg leading-normal">
                Restores all gameplay, combat, and survival configuration settings back to defaults.
                Your server name, port configurations, and admin passwords will be preserved.
              </div>
            </div>
            <button
              onClick={() => setIsResetModalOpen(true)}
              disabled={isActive || server.status === 'starting' || server.status === 'stopping' || server.status === 'updating'}
              className="bg-warning-500/10 hover:bg-warning-500/20 text-warning-400 hover:text-warning-300 border border-warning-500/20 hover:border-warning-500/40 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none shrink-0"
            >
              Reset Configuration
            </button>
          </div>

          {/* Wipe Saves */}
          <div className="flex items-center justify-between py-3 last:pb-0">
            <div className="pr-4">
              <div className="text-xs font-bold text-error-400">Wipe World & Save Games</div>
              <div className="text-[10px] text-dark-450 mt-1 max-w-lg leading-normal">
                Permanently deletes the entire world state, player progress, structures, and character files.
                All game settings are retained, but player progress begins from scratch.
              </div>
            </div>
            <button
              onClick={() => setIsWipeModalOpen(true)}
              disabled={isActive || server.status === 'starting' || server.status === 'stopping' || server.status === 'updating'}
              className="bg-error-500/10 hover:bg-error-500/20 text-error-400 hover:text-error-300 border border-error-500/20 hover:border-error-500/40 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none shrink-0"
            >
              Wipe Save Data
            </button>
          </div>
        </div>
      </div>

      {/* Reset Configuration Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => { setIsResetModalOpen(false); setResetConfirmText(''); }} />
          <div className="relative glass-card max-w-sm w-full border border-warning-500/20 bg-dark-900/60 p-6 shadow-2xl rounded-xl space-y-5 animate-scale-in">
            <div className="flex items-center gap-3 text-warning-400">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-warning-500/10 border border-warning-500/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wider">Reset Server Configuration</h2>
            </div>
            <p className="text-xs text-dark-300 leading-relaxed">
              This will restore all rule and gameplay configurations to their defaults. 
              Ports, server passwords, and the server name will be preserved.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] text-dark-400 font-bold uppercase tracking-wider">
                Type <span className="text-warning-400 font-mono">RESET</span> to confirm:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="input-field text-xs font-mono text-center w-full bg-dark-950"
                placeholder="RESET"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => { setIsResetModalOpen(false); setResetConfirmText(''); }}
                className="btn-ghost px-4 py-2 text-xs font-semibold rounded-lg text-dark-400 hover:text-dark-200"
              >
                Cancel
              </button>
              <button
                onClick={handleResetConfig}
                disabled={resetConfirmText !== 'RESET' || isWiping}
                className="bg-warning-500/10 border border-warning-500/20 hover:bg-warning-500/20 text-warning-400 hover:text-warning-300 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-all duration-200 disabled:opacity-40"
              >
                {isWiping ? 'Resetting...' : 'Reset Config'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe Save Games Modal */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => { setIsWipeModalOpen(false); setWipeConfirmText(''); }} />
          <div className="relative glass-card max-w-sm w-full border border-error-500/20 bg-dark-900/60 p-6 shadow-2xl rounded-xl space-y-5 animate-scale-in">
            <div className="flex items-center gap-3 text-error-400">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-error-500/10 border border-error-500/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wider">Wipe World & Save Games</h2>
            </div>
            <p className="text-xs text-dark-300 leading-relaxed">
              This will permanently delete all player data, level progress, bases, and guilds on this server. 
              <strong>This action cannot be undone.</strong>
            </p>
            <div className="space-y-2">
              <label className="text-[10px] text-dark-400 font-bold uppercase tracking-wider">
                Type <span className="text-error-400 font-mono">WIPE</span> to confirm:
              </label>
              <input
                type="text"
                value={wipeConfirmText}
                onChange={(e) => setWipeConfirmText(e.target.value)}
                className="input-field text-xs font-mono text-center w-full bg-dark-950 border-error-500/25 focus:border-error-500/40 focus:ring-1 focus:ring-error-500/15"
                placeholder="WIPE"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => { setIsWipeModalOpen(false); setWipeConfirmText(''); }}
                className="btn-ghost px-4 py-2 text-xs font-semibold rounded-lg text-dark-400 hover:text-dark-200"
              >
                Cancel
              </button>
              <button
                onClick={handleWipeSaves}
                disabled={wipeConfirmText !== 'WIPE' || isWiping}
                className="bg-error-500/10 border border-error-500/20 hover:bg-error-500/20 text-error-400 hover:text-error-300 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-all duration-200 disabled:opacity-40"
              >
                {isWiping ? 'Wiping...' : 'Wipe Saves'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  if (onStart) {
                    onStart();
                  } else {
                    tauriCommands.startServer(server.id).catch(console.error);
                  }
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

      {/* SteamCMD Installation Success Modal */}
      {showSteamcmdModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-dark-950/85 backdrop-blur-md" 
            onClick={() => setShowSteamcmdModal(false)} 
          />
          
          {/* Content Card */}
          <div className="relative glass-card border border-success-500/30 bg-dark-900/80 p-8 rounded-2xl shadow-2xl max-w-sm w-full space-y-6 text-center animate-scale-in">
            {/* Checked Icon */}
            <div className="w-16 h-16 rounded-full bg-success-500/10 border border-success-500/20 text-success-400 mx-auto flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-8 h-8">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            
            {/* Title */}
            <div className="space-y-2">
              <h2 className="text-md font-black uppercase text-gradient-cyan tracking-wider">
                SteamCMD Installed!
              </h2>
              <p className="text-xs text-dark-400 leading-relaxed">
                SteamCMD has been successfully downloaded, extracted, and integrated into your server manager.
              </p>
            </div>

            <p className="text-[11px] text-dark-500 italic bg-dark-950/40 py-2.5 px-4 border border-dark-800 rounded-xl">
              You are now ready to install and update your Palworld Dedicated Server.
            </p>

            {/* Action button */}
            <button
              onClick={() => setShowSteamcmdModal(false)}
              className="w-full bg-gradient-to-r from-success-600 to-emerald-500 hover:from-success-500 hover:to-emerald-400 text-white rounded-xl py-3 text-xs font-black uppercase tracking-wider shadow-lg shadow-success-900/20 active:scale-[0.98] transition-all"
            >
              Got it
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
