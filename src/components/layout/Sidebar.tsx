import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { getStatusColor, tauriCommands } from '../../lib/tauri';
import { useI18nStore } from '../../lib/i18n';
import { open } from '@tauri-apps/plugin-dialog';

// SVG Icons
const DashboardIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path d="M3 4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4zM11 4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM11 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  </svg>
);

const AddIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
);

const ServerIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.533 1.533 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.533 1.533 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
);

const DiscordIcon = () => (
  <svg viewBox="0 0 127.14 96.36" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
    <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.52,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.07,54.65,123.56,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
  </svg>
);

const LamballLogo: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <div className={`relative flex items-center justify-center transition-all duration-300 ${collapsed ? 'w-8 h-8' : 'w-9 h-9'}`}>
    <div className="relative w-full h-full select-none hover:scale-110 transition-transform duration-300 cursor-pointer">
      <svg viewBox="0 0 100 100" className="w-full h-full animate-pal-body origin-bottom" xmlns="http://www.w3.org/2000/svg">
        {/* Ambient Shadow underneath */}
        <ellipse cx="50" cy="88" rx="20" ry="3.5" fill="rgba(0, 0, 0, 0.25)" />
        {/* Left Horn */}
        <path d="M 33 26 C 24 18, 17 28, 25 35 C 28 32, 31 30, 35 29 Z" fill="#ECC94B" stroke="#0f172a" strokeWidth="2.2" strokeLinejoin="round" />
        {/* Right Horn */}
        <path d="M 67 26 C 76 18, 83 28, 75 35 C 72 32, 69 30, 65 29 Z" fill="#ECC94B" stroke="#0f172a" strokeWidth="2.2" strokeLinejoin="round" />
        {/* Left Ear */}
        <path d="M 26 38 C 17 40, 15 48, 24 47 Z" fill="#475569" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
        {/* Right Ear */}
        <path d="M 74 38 C 83 40, 85 48, 76 47 Z" fill="#475569" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
        {/* Wool Body */}
        <path d="M 50 25 A 11 11 0 0 1 65 28 A 11 11 0 0 1 74 38 A 11 11 0 0 1 75 52 A 11 11 0 0 1 65 67 A 11 11 0 0 1 50 70 A 11 11 0 0 1 35 67 A 11 11 0 0 1 25 52 A 11 11 0 0 1 26 38 A 11 11 0 0 1 35 28 Z" fill="#FFFFFF" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round" />
        {/* Dark Face Panel */}
        <rect x="36" y="38" width="28" height="24" rx="12" fill="#334155" stroke="#0f172a" strokeWidth="2" />
        {/* Eyes */}
        <ellipse cx="43" cy="48" rx="2.5" ry="4" fill="#FFFFFF" />
        <ellipse cx="43.5" cy="48.5" rx="1" ry="1.75" fill="#000000" />
        <ellipse cx="57" cy="48" rx="2.5" ry="4" fill="#FFFFFF" />
        <ellipse cx="56.5" cy="48.5" rx="1" ry="1.75" fill="#000000" />
        {/* Blushing Cheeks */}
        <ellipse cx="40" cy="54" rx="2.5" ry="1.5" fill="#F43F5E" opacity="0.6" />
        <ellipse cx="60" cy="54" rx="2.5" ry="1.5" fill="#F43F5E" opacity="0.6" />
        {/* Mouth */}
        <path d="M 48 53 Q 50 56 52 53" stroke="#FFFFFF" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  </div>
);
export const Sidebar: React.FC = () => {
  const { t } = useI18nStore();
  const {
    currentView,
    setCurrentView,
    servers,
    selectedServerId,
    setSelectedServerId,
    setActiveServerTab,
    sidebarCollapsed,
    toggleSidebar,
    appVersion,
    setServers,
    showNotification,
  } = useAppStore();

  // Local States for Server Quick Actions Context Menu & Modals
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; server: any } | null>(null);

  // Clone Modal States
  const [cloningServer, setCloningServer] = useState<any | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneInstallPath, setCloneInstallPath] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  // Delete Modal States
  const [serverToDelete, setServerToDelete] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [backupFirst, setBackupFirst] = useState(true);

  // Listen to window click to close context menu
  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, server: any) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      server
    });
  };

  const handleServerClick = (id: number) => {
    setSelectedServerId(id);
    setActiveServerTab('overview');
    setCurrentView('server-detail');
  };

  const handleStartServer = async (serverId: number) => {
    try {
      showNotification('info', 'Starting server...');
      await tauriCommands.startServer(serverId);
      showNotification('success', 'Server starting...');
      const updated = await tauriCommands.getServers();
      setServers(updated);
    } catch (e: any) {
      showNotification('error', `Start failed: ${e}`);
    }
  };

  const handleStopServer = async (serverId: number) => {
    try {
      showNotification('info', 'Stopping server...');
      await tauriCommands.stopServer(serverId, false);
      showNotification('success', 'Server stopped');
      const updated = await tauriCommands.getServers();
      setServers(updated);
    } catch (e: any) {
      showNotification('error', `Stop failed: ${e}`);
    }
  };

  const handleCloneServerPrompt = (server: any) => {
    setCloningServer(server);
    setCloneName(`${server.name} - Clone`);
    setCloneInstallPath(`${server.installPath.replace(/\s+/g, '_')}_clone`);
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
    if (!cloningServer) return;
    if (!cloneName.trim()) {
      showNotification('error', 'Please enter a name for the clone');
      return;
    }
    if (!cloneInstallPath.trim()) {
      showNotification('error', 'Please enter/select a destination path');
      return;
    }
    if (/\s/.test(cloneInstallPath)) {
      showNotification('error', 'Spaces are not allowed in the destination path due to SteamCMD limitations. Please remove spaces or use underscores (_).');
      return;
    }

    setIsCloning(true);
    try {
      showNotification('info', `Cloning server "${cloningServer.name}" to "${cloneName}"...`);
      const newServer = await tauriCommands.cloneServer(cloningServer.id, cloneName.trim(), cloneInstallPath.trim());
      showNotification('success', `Successfully cloned server to "${newServer.name}"! Please check the Config tab to review the PalWorldSettings.ini configurations (ports, server name, passwords).`);
      
      // Refresh servers in the store
      const updated = await tauriCommands.getServers();
      setServers(updated);
      
      // Select the cloned server
      setSelectedServerId(newServer.id);
      setActiveServerTab('overview');
      setCurrentView('server-detail');
    } catch (err: any) {
      showNotification('error', `Failed to clone server: ${err}`);
    } finally {
      setIsCloning(false);
      setCloningServer(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!serverToDelete) return;
    try {
      await tauriCommands.deleteServer(
        serverToDelete.id,
        serverToDelete.isRemote ? false : backupFirst,
        serverToDelete.isRemote ? false : deleteFiles
      );
      showNotification(
        'success',
        serverToDelete.isRemote
          ? 'Server connection removed'
          : deleteFiles
          ? 'Server and installation files deleted'
          : 'Server profile deleted'
      );
      
      const updated = await tauriCommands.getServers();
      setServers(updated);
      
      // If the currently selected server is the one deleted, clear selection
      if (selectedServerId === serverToDelete.id) {
        setSelectedServerId(null);
        setCurrentView('dashboard');
      }
    } catch (e: any) {
      showNotification('error', `Delete failed: ${e}`);
    } finally {
      setIsDeleteModalOpen(false);
      setServerToDelete(null);
    }
  };

  return (
    <>
      <aside
        className={`flex flex-col h-full border-r border-dark-800/80 bg-dark-950/40 backdrop-blur-md transition-all duration-300 ${
          sidebarCollapsed ? 'w-14' : 'w-56'
        }`}
      >
        {/* Branding Header */}
        <div className={`flex items-center border-b border-dark-800/40 select-none transition-all duration-300 overflow-hidden ${
          sidebarCollapsed ? 'justify-center p-3 h-14' : 'px-4 py-3 h-14 gap-3'
        }`}>
          <LamballLogo collapsed={sidebarCollapsed} />
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-black uppercase tracking-widest bg-gradient-to-r from-cyan-400 to-primary-400 bg-clip-text text-transparent">
                Palworld
              </span>
              <span className="text-[8px] text-dark-500 font-bold uppercase tracking-wider">
                Server Manager
              </span>
            </div>
          )}
        </div>
        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {/* Dashboard */}
          <button
            id="nav-dashboard"
            onClick={() => {
              setCurrentView('dashboard');
              setSelectedServerId(null);
            }}
            className={`group relative flex items-center w-full rounded-lg text-sm font-semibold transition-all duration-200 overflow-hidden ${
              sidebarCollapsed ? 'justify-center p-2.5 has-tooltip' : 'px-3.5 py-2.5 gap-3'
            } ${
              currentView === 'dashboard'
                ? 'text-primary-400 bg-primary-500/5 border border-primary-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_0_10px_-2px_rgba(59,130,246,0.15)] nav-item-active'
                : 'text-dark-400 hover:text-dark-100 hover:bg-dark-800/40 border border-transparent nav-item-hover'
            }`}
          >
            <span className="nav-indicator-line" />
            <div className="transition-transform duration-200 group-hover:scale-110 group-active:scale-95">
              <DashboardIcon />
            </div>
            {!sidebarCollapsed && <span>{t('nav.dashboard')}</span>}
            {sidebarCollapsed && <span className="sidebar-tooltip">{t('nav.dashboard')}</span>}
          </button>

          {/* Create Server */}
          <button
            id="nav-create-server"
            onClick={() => setCurrentView('create-server')}
            className={`group relative flex items-center w-full rounded-lg text-sm font-semibold transition-all duration-200 overflow-hidden ${
              sidebarCollapsed ? 'justify-center p-2.5 has-tooltip' : 'px-3.5 py-2.5 gap-3'
            } ${
              currentView === 'create-server'
                ? 'text-primary-400 bg-primary-500/5 border border-primary-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_0_10px_-2px_rgba(59,130,246,0.15)] nav-item-active'
                : 'text-dark-400 hover:text-dark-100 hover:bg-dark-800/40 border border-transparent nav-item-hover'
            }`}
          >
            <span className="nav-indicator-line" />
            <div className="transition-transform duration-200 group-hover:scale-110 group-active:scale-95">
              <AddIcon />
            </div>
            {!sidebarCollapsed && <span>{t('nav.createServer')}</span>}
            {sidebarCollapsed && <span className="sidebar-tooltip">{t('nav.createServer')}</span>}
          </button>

          {/* Settings */}
          <button
            id="nav-settings"
            onClick={() => {
              setCurrentView('settings');
              setSelectedServerId(null);
            }}
            className={`group relative flex items-center w-full rounded-lg text-sm font-semibold transition-all duration-200 overflow-hidden ${
              sidebarCollapsed ? 'justify-center p-2.5 has-tooltip' : 'px-3.5 py-2.5 gap-3'
            } ${
              currentView === 'settings'
                ? 'text-primary-400 bg-primary-500/5 border border-primary-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_0_10px_-2px_rgba(59,130,246,0.15)] nav-item-active'
                : 'text-dark-400 hover:text-dark-100 hover:bg-dark-800/40 border border-transparent nav-item-hover'
            }`}
          >
            <span className="nav-indicator-line" />
            <div className="transition-transform duration-200 group-hover:scale-110 group-active:scale-95">
              <SettingsIcon />
            </div>
            {!sidebarCollapsed && <span>{t('nav.settings')}</span>}
            {sidebarCollapsed && <span className="sidebar-tooltip">{t('nav.settings')}</span>}
          </button>

          {/* Server List */}
          {servers.length > 0 && (
            <div className="pt-3 mt-3 border-t border-dark-800/40">
              {!sidebarCollapsed ? (
                <span className="px-3.5 text-[9px] font-bold text-dark-500 uppercase tracking-widest block mb-2">
                  Servers
                </span>
              ) : (
                <div className="border-b border-dark-800/40 mb-2 pb-2" />
              )}
              <div className="space-y-1">
                {servers.map((server) => (
                  <button
                    key={server.id}
                    id={`nav-server-${server.id}`}
                    onClick={() => handleServerClick(server.id)}
                    onContextMenu={(e) => handleContextMenu(e, server)}
                    className={`group relative flex items-center w-full rounded-lg text-sm transition-all duration-200 overflow-hidden ${
                      sidebarCollapsed ? 'justify-center p-2.5 has-tooltip' : 'px-3.5 py-2.5 gap-3'
                    } ${
                      selectedServerId === server.id
                        ? 'text-primary-400 bg-primary-500/5 border border-primary-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_0_10px_-2px_rgba(59,130,246,0.15)] nav-item-active'
                        : 'text-dark-400 hover:text-dark-100 hover:bg-dark-800/40 border border-transparent nav-item-hover'
                    }`}
                  >
                    <span className="nav-indicator-line" />
                    <div className="relative transition-transform duration-200 group-hover:scale-110 group-active:scale-95 shrink-0">
                      <ServerIcon />
                      <span
                        className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-dark-950 ${getStatusColor(server.status)} ${
                          server.status === 'running' || server.status === 'online' ? 'pulse-status-green' : ''
                        }`}
                      />
                    </div>
                    {!sidebarCollapsed && (
                      <>
                        <span className="truncate font-semibold">{server.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setContextMenu({
                              x: rect.left,
                              y: rect.bottom,
                              server
                            });
                          }}
                          className="opacity-0 group-hover:opacity-100 ml-auto p-1 rounded hover:bg-dark-800 text-dark-400 hover:text-dark-200 transition-all duration-150 shrink-0"
                          title="Server Options"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                      </>
                    )}
                    {sidebarCollapsed && <span className="sidebar-tooltip">{server.name}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Footer Info */}
        <div className="border-t border-dark-800/40 flex flex-col bg-dark-950/20">
          {!sidebarCollapsed ? (
            <div className="px-4 py-3.5 text-[10px] text-dark-500 select-none">
              <div className="font-bold text-dark-400 tracking-wide">Palworld Server Manager</div>
              <div className="flex items-center justify-between gap-1.5 mt-2">
                <div className="flex items-center gap-1 font-mono">
                  <span>v{appVersion || '...'}</span>
                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[8px] text-dark-600 font-bold uppercase tracking-wider">Prod</span>
                </div>
                <button
                  onClick={() => window.open('https://discord.gg/gSNpPXhecV', '_blank')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/20 text-[#5865F2] hover:text-[#7289da] text-[8px] font-black uppercase tracking-wider transition-all duration-200 shadow-md shadow-[#5865F2]/5 hover:scale-[1.03] active:scale-95"
                  title="Join our Discord"
                >
                  <DiscordIcon />
                  <span>Discord</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-3 gap-2">
              <button
                onClick={() => window.open('https://discord.gg/gSNpPXhecV', '_blank')}
                className="flex items-center justify-center p-1.5 rounded-lg text-[#5865F2] hover:bg-[#5865F2]/10 transition-all hover:scale-110 active:scale-95 has-tooltip relative"
                title="Join our Discord"
              >
                <DiscordIcon />
                <span className="sidebar-tooltip">Join Discord</span>
              </button>
              <div className="text-[9px] text-dark-600 font-bold font-mono select-none" title={`v${appVersion || '...'}`}>
                v{appVersion || '...'}
              </div>
            </div>
          )}
        </div>

        {/* Collapse Toggle */}
        <div className="p-2 border-t border-dark-800/40 bg-dark-950/30">
          <button
            id="sidebar-toggle"
            onClick={toggleSidebar}
            className="flex items-center justify-center w-full py-2 rounded-lg text-dark-500 hover:text-dark-300 hover:bg-dark-800/40 transition-all hover:scale-105 active:scale-95"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`}
            >
              <path
                fillRule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </aside>

      {/* Options Dropdown Menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            zIndex: 1000,
          }}
          className="w-48 rounded-lg border border-dark-800/40 bg-dark-950/85 backdrop-blur-md p-1.5 shadow-xl animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[9px] font-bold text-dark-500 uppercase tracking-widest border-b border-dark-800/40 mb-1.5 truncate">
            {contextMenu.server.name}
          </div>

          {contextMenu.server.status === 'running' || contextMenu.server.status === 'online' ? (
            <button
              onClick={() => {
                handleStopServer(contextMenu.server.id);
                setContextMenu(null);
              }}
              disabled={contextMenu.server.status === 'stopping' || contextMenu.server.status === 'starting'}
              className="flex items-center w-full gap-2 px-2.5 py-2 text-xs font-bold text-error-400 hover:text-error-300 hover:bg-error-500/10 rounded transition-all duration-150 active:scale-95 disabled:opacity-50"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-error-500 animate-pulse" />
              Stop Server
            </button>
          ) : (
            <button
              onClick={() => {
                handleStartServer(contextMenu.server.id);
                setContextMenu(null);
              }}
              disabled={contextMenu.server.status === 'starting' || contextMenu.server.status === 'stopping' || contextMenu.server.status === 'updating' || contextMenu.server.status === 'restarting'}
              className="flex items-center w-full gap-2 px-2.5 py-2 text-xs font-bold text-success-400 hover:text-success-300 hover:bg-success-500/10 rounded transition-all duration-150 active:scale-95 disabled:opacity-50"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
              Start Server
            </button>
          )}

          <button
            onClick={() => {
              handleCloneServerPrompt(contextMenu.server);
              setContextMenu(null);
            }}
            className="flex items-center w-full gap-2 px-2.5 py-2 text-xs font-bold text-primary-400 hover:text-primary-300 hover:bg-primary-500/10 rounded transition-all duration-150 active:scale-95"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-primary-400">
              <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
              <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
            </svg>
            Clone Server
          </button>

          <button
            onClick={() => {
              setServerToDelete(contextMenu.server);
              setIsDeleteModalOpen(true);
              setContextMenu(null);
            }}
            className="flex items-center w-full gap-2 px-2.5 py-2 text-xs font-bold text-error-400 hover:text-error-300 hover:bg-error-500/10 rounded transition-all duration-150 active:scale-95"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-error-400">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {contextMenu.server.isRemote ? 'Remove Connection' : 'Delete Server'}
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && serverToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsDeleteModalOpen(false)} 
          />
          <div className="relative glass-card max-w-sm w-full border border-error-500/20 bg-dark-900/60 p-6 shadow-2xl rounded-xl space-y-6 animate-scale-in">
            <div className="flex items-center gap-3 text-error-400">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-error-500/10 border border-error-500/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-error-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wider">
                {serverToDelete.isRemote ? 'Remove Connection' : 'Confirm Server Deletion'}
              </h2>
            </div>
            
            <p className="text-xs text-dark-300 leading-relaxed">
              {serverToDelete.isRemote ? (
                <>Are you sure you want to remove the connection to <strong className="text-dark-100 font-bold">"{serverToDelete.name}"</strong>? This will only remove this profile from the application. The remote server will not be affected.</>
              ) : (
                <>Are you sure you want to delete server <strong className="text-dark-100 font-bold">"{serverToDelete.name}"</strong>? This will remove all configuration settings. This action cannot be undone.</>
              )}
            </p>

            {!serverToDelete.isRemote && (
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
                {serverToDelete.isRemote ? 'Remove' : 'Delete Server'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      {cloningServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm transition-opacity" 
            onClick={() => setCloningServer(null)} 
          />
          
          <div className="relative glass-card max-w-md w-full border border-cyan-500/20 bg-dark-900/60 p-6 shadow-2xl rounded-xl space-y-6 animate-scale-in">
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
                  We will copy the entire original server folder, keeping configurations but skipping player save data for a fresh start.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setCloningServer(null)}
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
                    <span>Cloning...</span>
                  </>
                ) : (
                  <span>Clone Server</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
