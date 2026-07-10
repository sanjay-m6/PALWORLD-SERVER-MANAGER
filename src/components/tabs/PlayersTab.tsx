import React, { useEffect, useState, useCallback, useRef } from 'react';
import { tauriCommands } from '../../lib/tauri';
import { useAppStore, type Player } from '../../stores/useAppStore';

type PlayersSubTab = 'online' | 'banlist' | 'whitelist';

export const PlayersTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification, rconConnected } = useAppStore();
  const [activeSubTab, setActiveSubTab] = useState<PlayersSubTab>('online');

  // Online Players State
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);

  // Ban List State
  const [bannedIds, setBannedIds] = useState<string[]>([]);
  const [isLoadingBans, setIsLoadingBans] = useState(false);
  const [newBanId, setNewBanId] = useState('');

  // Whitelist State
  const [whitelistIds, setWhitelistIds] = useState<string[]>([]);
  const [isLoadingWhitelist, setIsLoadingWhitelist] = useState(false);
  const [newWhitelistId, setNewWhitelistId] = useState('');

  const server = useAppStore((state) => state.servers.find((s) => s.id === serverId));
  const isServerRunning = server?.status === 'running';
  const isConnected = rconConnected[serverId] ?? false;

  const [autoConnect, setAutoConnect] = useState(() => localStorage.getItem(`rcon_autoconnect_${serverId}`) !== 'false');
  const autoConnectAttempted = useRef(false);

  useEffect(() => {
    autoConnectAttempted.current = false;
  }, [serverId]);

  useEffect(() => {
    const handleStorageChange = () => {
      const val = localStorage.getItem(`rcon_autoconnect_${serverId}`) !== 'false';
      setAutoConnect(val);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [serverId]);

  useEffect(() => {
    if (isServerRunning && !isConnected && autoConnect && !autoConnectAttempted.current) {
      autoConnectAttempted.current = true;
      tauriCommands.rconConnect(serverId).catch(() => {});
    }
  }, [serverId, isServerRunning, isConnected, autoConnect]);

  const [isEnabling, setIsEnabling] = useState(false);

  const handleEnableRcon = async () => {
    setIsEnabling(true);
    try {
      const config = await tauriCommands.getServerConfig(serverId);
      config.rconEnabled = true;
      await tauriCommands.saveServerConfig(serverId, config);
      showNotification('success', 'RCON enabled in configuration. Restarting server to apply...');
      
      if (isServerRunning) {
        await tauriCommands.restartServer(serverId);
        showNotification('success', 'Server is restarting to enable RCON.');
      } else {
        showNotification('success', 'RCON enabled. Start the server to connect.');
      }
      
      const servers = await tauriCommands.getServers();
      useAppStore.getState().setServers(servers);
    } catch (e: any) {
      showNotification('error', `Failed to enable RCON: ${e}`);
    } finally {
      setIsEnabling(false);
    }
  };



  // --- Actions ---
  const loadPlayers = useCallback(async () => {
    if (!isServerRunning) return;
    setIsLoadingPlayers(true);
    try {
      const data = await tauriCommands.getPlayerList(serverId);
      setPlayers(data || []);
    } catch (e: any) {
      showNotification('error', `Failed to get players: ${e}`);
    } finally {
      setIsLoadingPlayers(false);
    }
  }, [serverId, isServerRunning, showNotification]);

  const loadBanList = useCallback(async () => {
    setIsLoadingBans(true);
    try {
      const data = await tauriCommands.getBanList(serverId);
      setBannedIds(data || []);
    } catch (e: any) {
      showNotification('error', `Failed to load ban list: ${e}`);
    } finally {
      setIsLoadingBans(false);
    }
  }, [serverId, showNotification]);

  const loadWhitelist = useCallback(async () => {
    setIsLoadingWhitelist(true);
    try {
      const data = await tauriCommands.getWhitelist(serverId);
      setWhitelistIds(data || []);
    } catch (e: any) {
      showNotification('error', `Failed to load whitelist: ${e}`);
    } finally {
      setIsLoadingWhitelist(false);
    }
  }, [serverId, showNotification]);

  // Effects
  useEffect(() => {
    if (activeSubTab === 'online') {
      loadPlayers();
      if (isServerRunning) {
        const interval = setInterval(loadPlayers, 15000);
        return () => clearInterval(interval);
      }
    } else if (activeSubTab === 'banlist') {
      loadBanList();
    } else if (activeSubTab === 'whitelist') {
      loadWhitelist();
    }
  }, [serverId, activeSubTab, isServerRunning, loadPlayers, loadBanList, loadWhitelist]);

  const handleKick = async (steamId: string, name: string) => {
    if (!confirm(`Kick player "${name}"?`)) return;
    try {
      await tauriCommands.kickPlayer(serverId, steamId);
      showNotification('success', `Kicked ${name}`);
      await loadPlayers();
    } catch (e: any) {
      showNotification('error', `Kick failed: ${e}`);
    }
  };

  const handleBan = async (steamId: string, name: string) => {
    if (!confirm(`Ban player "${name}"? They will not be able to rejoin.`)) return;
    try {
      if (isServerRunning) {
        await tauriCommands.banPlayer(serverId, steamId);
      }
      await tauriCommands.addToBanList(serverId, steamId);
      showNotification('success', `Banned ${name || steamId}`);
      
      if (activeSubTab === 'online') {
        await loadPlayers();
      } else {
        await loadBanList();
      }
    } catch (e: any) {
      showNotification('error', `Ban failed: ${e}`);
    }
  };

  const handleAddManualBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBanId.trim()) return;
    try {
      if (isServerRunning) {
        await tauriCommands.banPlayer(serverId, newBanId.trim());
      }
      await tauriCommands.addToBanList(serverId, newBanId.trim());
      showNotification('success', `Added ${newBanId.trim()} to Ban List`);
      setNewBanId('');
      await loadBanList();
    } catch (e: any) {
      showNotification('error', `Failed to ban: ${e}`);
    }
  };

  const handleUnban = async (steamId: string) => {
    if (!confirm(`Unban player with Steam ID: ${steamId}?`)) return;
    try {
      await tauriCommands.removeBan(serverId, steamId);
      showNotification('success', `Removed ban for ${steamId}`);
      await loadBanList();
    } catch (e: any) {
      showNotification('error', `Unban failed: ${e}`);
    }
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = newWhitelistId.trim();
    if (!id || whitelistIds.includes(id)) return;
    const updated = [...whitelistIds, id];
    try {
      await tauriCommands.setWhitelist(serverId, updated);
      setWhitelistIds(updated);
      setNewWhitelistId('');
      showNotification('success', `Added ${id} to Whitelist`);
    } catch (e: any) {
      showNotification('error', `Failed to update whitelist: ${e}`);
    }
  };

  const handleRemoveWhitelist = async (steamId: string) => {
    if (!confirm(`Remove ${steamId} from Whitelist?`)) return;
    const updated = whitelistIds.filter((id) => id !== steamId);
    try {
      await tauriCommands.setWhitelist(serverId, updated);
      setWhitelistIds(updated);
      showNotification('success', `Removed ${steamId} from Whitelist`);
    } catch (e: any) {
      showNotification('error', `Failed to update whitelist: ${e}`);
    }
  };

  return (
    <div className="p-5 overflow-y-auto h-full flex flex-col space-y-4">
      {/* Sub-tabs Navigation */}
      <div className="flex items-center gap-1.5 border-b border-dark-800/40 pb-3">
        {(['online', 'banlist', 'whitelist'] as PlayersSubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              activeSubTab === tab
                ? 'bg-primary-500/10 border border-primary-500/20 text-primary-400'
                : 'text-dark-400 hover:text-dark-200 border border-transparent'
            }`}
          >
            {tab === 'online' && 'Online Players'}
            {tab === 'banlist' && 'Ban List'}
            {tab === 'whitelist' && 'Whitelist'}
          </button>
        ))}
      </div>

      {/* Content Blocks */}
      {activeSubTab === 'online' && (
        <div className="space-y-4 flex-1">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-dark-200">
                Online Players
              </h3>
              <span className="text-[10px] font-bold text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded-full">
                {players.length}
              </span>
            </div>
            {isServerRunning && (
              <button onClick={loadPlayers} className="btn-ghost text-xs py-1.5 px-3">
                {isLoadingPlayers ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>

          {!isServerRunning ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center">
                <p className="text-dark-400 text-sm mb-2">Server Offline</p>
                <p className="text-dark-600 text-xs">Start the server to monitor players</p>
              </div>
            </div>
          ) : !server?.rconConfig.enabled ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center">
                <p className="text-warning-400 text-sm mb-2">RCON is Disabled</p>
                <p className="text-dark-600 text-xs mb-4">RCON must be enabled in the configuration to view players.</p>
                <button
                  onClick={handleEnableRcon}
                  disabled={isEnabling}
                  className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 hover:text-primary-300 border border-primary-500/30 hover:border-primary-500/50 font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50"
                >
                  {isEnabling ? 'Enabling RCON...' : 'Enable RCON & Restart Server'}
                </button>
              </div>
            </div>
          ) : !isConnected && isLoadingPlayers ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center">
                <p className="text-dark-400 text-sm mb-2">Connecting to RCON...</p>
              </div>
            </div>
          ) : !isConnected ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center">
                <p className="text-error-400 text-sm mb-2">RCON Connection Failed</p>
                <p className="text-dark-600 text-xs">Ensure RCON is enabled in server configuration</p>
                <button onClick={loadPlayers} className="mt-3 btn-primary text-xs py-1.5 px-3">
                  Retry Connection
                </button>
              </div>
            </div>
          ) : players.length === 0 ? (
            <div className="text-center py-12 text-dark-500 text-sm">
              No players online
            </div>
          ) : (
            <div className="space-y-2">
              {players.map((player) => (
                <div key={player.steamId} className="glass-card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-xs font-bold text-primary-400">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-dark-200">
                        {player.name}
                      </div>
                      <div className="text-[10px] text-dark-500 font-mono">
                        Steam: {player.steamId} | UID: {player.playerUid}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleKick(player.steamId, player.name)}
                      className="btn-ghost text-[10px] py-1 px-2 text-warning-400 hover:text-warning-300"
                    >
                      Kick
                    </button>
                    <button
                      onClick={() => handleBan(player.steamId, player.name)}
                      className="btn-ghost text-[10px] py-1 px-2 text-error-400 hover:text-error-300"
                    >
                      Ban
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'banlist' && (
        <div className="space-y-4 flex-1">
          {/* Add Ban Form */}
          <form onSubmit={handleAddManualBan} className="glass-card p-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Ban Steam ID
              </label>
              <input
                type="text"
                value={newBanId}
                onChange={(e) => setNewBanId(e.target.value)}
                className="input-field text-xs font-mono"
                placeholder="76561198000000000"
              />
            </div>
            <button type="submit" className="btn-primary text-xs py-2 px-4 h-[34px]">
              Ban Player
            </button>
          </form>

          {/* Ban List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider">
              Banned Steam IDs ({bannedIds.length})
            </h3>
            {isLoadingBans ? (
              <div className="text-center py-6 text-dark-500 text-xs">Loading ban list...</div>
            ) : bannedIds.length === 0 ? (
              <div className="text-center py-8 text-dark-600 text-xs glass-card border-dashed">
                No banned players found in banlist.txt
              </div>
            ) : (
              <div className="space-y-1.5">
                {bannedIds.map((steamId) => (
                  <div key={steamId} className="glass-card p-3 flex items-center justify-between">
                    <span className="text-xs font-mono text-dark-200">{steamId}</span>
                    <button
                      onClick={() => handleUnban(steamId)}
                      className="btn-ghost text-[10px] py-1 px-2 text-success-400 hover:text-success-300"
                    >
                      Unban
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'whitelist' && (
        <div className="space-y-4 flex-1">
          {/* Add Whitelist Form */}
          <form onSubmit={handleAddWhitelist} className="glass-card p-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Allow Steam ID (Whitelist)
              </label>
              <input
                type="text"
                value={newWhitelistId}
                onChange={(e) => setNewWhitelistId(e.target.value)}
                className="input-field text-xs font-mono"
                placeholder="76561198000000000"
              />
            </div>
            <button type="submit" className="btn-primary text-xs py-2 px-4 h-[34px]">
              Add Player
            </button>
          </form>

          {/* Whitelist Items */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider">
              Allowed Steam IDs ({whitelistIds.length})
            </h3>
            {isLoadingWhitelist ? (
              <div className="text-center py-6 text-dark-500 text-xs">Loading whitelist...</div>
            ) : whitelistIds.length === 0 ? (
              <div className="text-center py-8 text-dark-600 text-xs glass-card border-dashed">
                Whitelist is empty. Whitelisting is disabled by default unless configured.
              </div>
            ) : (
              <div className="space-y-1.5">
                {whitelistIds.map((steamId) => (
                  <div key={steamId} className="glass-card p-3 flex items-center justify-between">
                    <span className="text-xs font-mono text-dark-200">{steamId}</span>
                    <button
                      onClick={() => handleRemoveWhitelist(steamId)}
                      className="btn-ghost text-[10px] py-1 px-2 text-error-400 hover:text-error-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

