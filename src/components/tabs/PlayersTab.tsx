import React, { useEffect, useState, useCallback, useRef } from 'react';
import { tauriCommands } from '../../lib/tauri';
import { useAppStore, type Player } from '../../stores/useAppStore';

type PlayersSubTab = 'online' | 'banlist' | 'whitelist';

export const PlayersTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification, rconConnected, activeServerTab } = useAppStore();
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

  // Message / Warning Modal State
  const [isMsgModalOpen, setIsMsgModalOpen] = useState(false);
  const [msgTargetPlayerName, setMsgTargetPlayerName] = useState('');
  const [msgContent, setMsgContent] = useState('');

  // Auto-Refresh State
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10); // default 10 seconds

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
      const timer = setTimeout(() => {
        tauriCommands.rconConnect(serverId).catch(() => {});
      }, 5000);
      return () => clearTimeout(timer);
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
      if (activeServerTab === 'players') {
        loadPlayers();
        if (isServerRunning && autoRefresh) {
          const interval = setInterval(loadPlayers, refreshInterval * 1000);
          return () => clearInterval(interval);
        }
      }
    } else if (activeSubTab === 'banlist') {
      loadBanList();
    } else if (activeSubTab === 'whitelist') {
      loadWhitelist();
    }
  }, [serverId, isServerRunning, activeSubTab, autoRefresh, refreshInterval, loadPlayers, loadBanList, loadWhitelist, activeServerTab]);

  const handleKick = async (player: Player) => {
    const identifier = player.steamId && player.steamId.trim() && player.steamId.trim() !== '0'
      ? player.steamId.trim()
      : player.playerUid.trim();
    if (!confirm(`Kick player "${player.name}"?`)) return;
    try {
      const res = await tauriCommands.kickPlayer(serverId, identifier);
      if (res && res.success === false) {
        showNotification('error', `Kick failed: ${res.message}`);
      } else {
        showNotification('success', `Kicked ${player.name}`);
      }
      await loadPlayers();
    } catch (e: any) {
      showNotification('error', `Kick failed: ${e}`);
    }
  };

  const handleBan = async (player: Player) => {
    const identifier = player.steamId && player.steamId.trim() && player.steamId.trim() !== '0'
      ? player.steamId.trim()
      : player.playerUid.trim();
    if (!confirm(`Ban player "${player.name}"? They will not be able to rejoin.`)) return;
    try {
      if (isServerRunning) {
        const res = await tauriCommands.banPlayer(serverId, identifier);
        if (res && res.success === false) {
          showNotification('error', `Ban failed: ${res.message}`);
          return;
        }
      }
      await tauriCommands.addToBanList(serverId, identifier);
      showNotification('success', `Banned ${player.name || identifier}`);
      
      if (activeSubTab === 'online') {
        await loadPlayers();
      } else {
        await loadBanList();
      }
    } catch (e: any) {
      showNotification('error', `Ban failed: ${e}`);
    }
  };

  const handleMessagePlayer = (name: string) => {
    setMsgTargetPlayerName(name);
    setMsgContent('');
    setIsMsgModalOpen(true);
  };

  const handleSendBroadcast = async () => {
    if (!msgContent.trim()) return;
    setIsMsgModalOpen(false);
    try {
      const formatted = `[To ${msgTargetPlayerName}]: ${msgContent.trim()}`;
      await tauriCommands.broadcastMessage(serverId, formatted);
      showNotification('success', `Message broadcasted: "${formatted}"`);
    } catch (e: any) {
      showNotification('error', `Failed to broadcast message: ${e}`);
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
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-dark-900/40 px-3 py-1.5 rounded-lg border border-dark-800/60">
                  <input
                    type="checkbox"
                    id="auto-refresh-players"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="w-3.5 h-3.5 accent-primary-500 rounded bg-dark-950 border-dark-700 cursor-pointer"
                  />
                  <label htmlFor="auto-refresh-players" className="text-[10px] font-black text-dark-350 cursor-pointer select-none uppercase tracking-wider">
                    Auto-Refresh
                  </label>
                  {autoRefresh && (
                    <select
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(Number(e.target.value))}
                      className="bg-transparent border-0 text-[10px] font-black text-primary-400 focus:outline-none cursor-pointer pl-1.5 uppercase"
                    >
                      <option value={5} className="bg-dark-900">5s</option>
                      <option value={10} className="bg-dark-900">10s</option>
                      <option value={15} className="bg-dark-900">15s</option>
                      <option value={30} className="bg-dark-900">30s</option>
                      <option value={60} className="bg-dark-900">60s</option>
                    </select>
                  )}
                </div>

                <button
                  onClick={loadPlayers}
                  disabled={isLoadingPlayers}
                  className="btn-ghost text-xs py-1.5 px-3 border border-dark-700/50 hover:border-dark-600 rounded-lg text-dark-200"
                >
                  {isLoadingPlayers ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
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
                        {player.steamId && player.steamId.trim() ? `Steam: ${player.steamId} | ` : ''}UID: {player.playerUid}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleMessagePlayer(player.name)}
                      className="bg-primary-500/10 border border-primary-500/20 hover:bg-primary-500/20 text-primary-400 text-[10px] px-2.5 py-1 rounded transition-all font-bold uppercase tracking-wider active:scale-95"
                    >
                      Message
                    </button>
                    <button
                      onClick={() => handleKick(player)}
                      className="bg-warning-500/10 border border-warning-500/20 hover:bg-warning-500/20 text-warning-400 text-[10px] px-2.5 py-1 rounded transition-all font-bold uppercase tracking-wider active:scale-95"
                    >
                      Kick
                    </button>
                    <button
                      onClick={() => handleBan(player)}
                      className="bg-error-500/10 border border-error-500/20 hover:bg-error-500/20 text-error-400 hover:bg-error-500/20 text-[10px] px-2.5 py-1 rounded transition-all font-bold uppercase tracking-wider active:scale-95"
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
                      className="bg-success-500/10 border border-success-500/20 hover:bg-success-500/20 text-success-400 text-[10px] px-2.5 py-1 rounded transition-all font-bold uppercase tracking-wider active:scale-95"
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
                      className="bg-error-500/10 border border-error-500/20 hover:bg-error-500/20 text-error-400 hover:bg-error-500/20 text-[10px] px-2.5 py-1 rounded transition-all font-bold uppercase tracking-wider active:scale-95"
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

      {/* Custom Styled Message Modal */}
      {isMsgModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/80 backdrop-blur-md animate-fade-in p-4">
          <div className="w-full max-w-md bg-dark-900 border border-dark-700/60 rounded-2xl shadow-2xl overflow-hidden transform scale-100 transition-all duration-300">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-800 bg-dark-950/40">
              <h3 className="text-xs font-black uppercase text-dark-100 tracking-wider">
                Broadcast Warning to {msgTargetPlayerName}
              </h3>
              <button
                onClick={() => setIsMsgModalOpen(false)}
                className="text-dark-500 hover:text-dark-300 transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                  Warning Message
                </label>
                <textarea
                  value={msgContent}
                  onChange={(e) => setMsgContent(e.target.value)}
                  className="w-full h-24 bg-dark-950 border border-dark-800 rounded-lg p-3 text-xs font-medium text-dark-100 placeholder-dark-600 focus:outline-none focus:border-primary-500/50 resize-none transition-all"
                  placeholder="Enter message or warning..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendBroadcast();
                    }
                  }}
                />
              </div>

              <div className="bg-primary-500/5 border border-primary-500/10 rounded-lg p-3">
                <p className="text-[10px] text-dark-400 leading-relaxed">
                  Note: The warning will appear as <strong className="text-primary-400 font-mono">[SYSTEM]:[To {msgTargetPlayerName}]: &lt;Message&gt;</strong> on the server in-game chat.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-dark-800/60 bg-dark-950/20">
              <button
                type="button"
                onClick={() => setIsMsgModalOpen(false)}
                className="w-1/2 bg-dark-800 hover:bg-dark-750 text-dark-300 border border-dark-700/60 rounded-lg py-2 text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendBroadcast}
                disabled={!msgContent.trim()}
                className="w-1/2 bg-gradient-to-r from-primary-600 to-cyan-500 hover:from-primary-500 hover:to-cyan-400 text-white rounded-lg py-2 text-xs font-bold shadow-lg shadow-primary-950/20 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                Send Warning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

