import React from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { getStatusColor, APP_VERSION } from '../../lib/tauri';

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

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    servers,
    selectedServerId,
    setSelectedServerId,
    setActiveServerTab,
    sidebarCollapsed,
    toggleSidebar,
  } = useAppStore();

  const handleServerClick = (id: number) => {
    setSelectedServerId(id);
    setActiveServerTab('overview');
    setCurrentView('server-detail');
  };

  return (
    <aside
      className={`flex flex-col h-full border-r border-dark-700/30 bg-dark-900/40 transition-all duration-300 ${
        sidebarCollapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {/* Dashboard */}
        <button
          id="nav-dashboard"
          onClick={() => {
            setCurrentView('dashboard');
            setSelectedServerId(null);
          }}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === 'dashboard'
              ? 'text-primary-400 bg-primary-500/10 border border-primary-500/20'
              : 'text-dark-300 hover:text-dark-100 hover:bg-dark-700/30'
          }`}
        >
          <DashboardIcon />
          {!sidebarCollapsed && <span>Dashboard</span>}
        </button>

        {/* Create Server */}
        <button
          id="nav-create-server"
          onClick={() => setCurrentView('create-server')}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === 'create-server'
              ? 'text-primary-400 bg-primary-500/10 border border-primary-500/20'
              : 'text-dark-300 hover:text-dark-100 hover:bg-dark-700/30'
          }`}
        >
          <AddIcon />
          {!sidebarCollapsed && <span>New Server</span>}
        </button>

        {/* Settings */}
        <button
          id="nav-settings"
          onClick={() => {
            setCurrentView('settings');
            setSelectedServerId(null);
          }}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === 'settings'
              ? 'text-primary-400 bg-primary-500/10 border border-primary-500/20'
              : 'text-dark-300 hover:text-dark-100 hover:bg-dark-700/30'
          }`}
        >
          <SettingsIcon />
          {!sidebarCollapsed && <span>Settings</span>}
        </button>

        {/* Server List */}
        {servers.length > 0 && (
          <div className="pt-3 mt-3 border-t border-dark-700/30">
            {!sidebarCollapsed && (
              <span className="px-3 text-[10px] font-semibold text-dark-500 uppercase tracking-widest">
                Servers
              </span>
            )}
            <div className="mt-2 space-y-0.5">
              {servers.map((server) => (
                <button
                  key={server.id}
                  id={`nav-server-${server.id}`}
                  onClick={() => handleServerClick(server.id)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                    selectedServerId === server.id
                      ? 'text-primary-400 bg-primary-500/10 border border-primary-500/20'
                      : 'text-dark-300 hover:text-dark-100 hover:bg-dark-700/30'
                  }`}
                >
                  <div className="relative">
                    <ServerIcon />
                    <span
                      className={`absolute -top-0.5 -right-0.5 status-dot w-1.5 h-1.5 ${getStatusColor(server.status)}`}
                    />
                  </div>
                  {!sidebarCollapsed && (
                    <span className="truncate">{server.name}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer Info */}
      <div className="border-t border-dark-700/30 flex flex-col">
        {!sidebarCollapsed ? (
          <div className="px-4 py-2.5 text-[10px] text-dark-500 select-none">
            <div className="font-semibold text-dark-400">Palworld Server Manager</div>
            <div className="flex items-center justify-between gap-1.5 mt-1">
              <div className="flex items-center gap-1">
                <span>v{APP_VERSION}</span>
                <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                <span className="text-[9px] text-dark-600">Production</span>
              </div>
              <button
                onClick={() => window.open('https://discord.gg/gSNpPXhecV', '_blank')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/20 text-[#5865F2] hover:text-[#7289da] text-[9px] font-bold uppercase transition-all duration-200"
                title="Join our Discord"
              >
                <DiscordIcon />
                <span>Discord</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-2 gap-1.5">
            <button
              onClick={() => window.open('https://discord.gg/gSNpPXhecV', '_blank')}
              className="flex items-center justify-center p-1 rounded-md text-[#5865F2] hover:bg-[#5865F2]/10 transition-colors"
              title="Join our Discord"
            >
              <DiscordIcon />
            </button>
            <div className="text-[9px] text-dark-500 font-medium select-none" title={`v${APP_VERSION}`}>
              v{APP_VERSION}
            </div>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-dark-700/30">
        <button
          id="sidebar-toggle"
          onClick={toggleSidebar}
          className="flex items-center justify-center w-full py-1.5 rounded-lg text-dark-500 hover:text-dark-300 hover:bg-dark-700/30 transition-colors"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}
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
  );
};
