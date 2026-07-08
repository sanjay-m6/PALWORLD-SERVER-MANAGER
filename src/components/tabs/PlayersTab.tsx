import React, { useEffect, useState } from 'react';
import { tauriCommands } from '../../lib/tauri';
import { useAppStore, type Player } from '../../stores/useAppStore';

export const PlayersTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification, rconConnected } = useAppStore();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isConnected = rconConnected[serverId] ?? false;

  const loadPlayers = async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      const data = await tauriCommands.getPlayerList(serverId);
      setPlayers(data);
    } catch (e: any) {
      showNotification('error', `Failed to get players: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPlayers();
    if (isConnected) {
      const interval = setInterval(loadPlayers, 15000);
      return () => clearInterval(interval);
    }
  }, [serverId, isConnected]);

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
      await tauriCommands.banPlayer(serverId, steamId);
      showNotification('success', `Banned ${name}`);
      await loadPlayers();
    } catch (e: any) {
      showNotification('error', `Ban failed: ${e}`);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-dark-400 text-sm mb-2">RCON not connected</p>
          <p className="text-dark-600 text-xs">Connect to RCON to view players</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 overflow-y-auto h-full space-y-4">
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
        <button onClick={loadPlayers} className="btn-ghost text-xs py-1.5 px-3">
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Player list */}
      {players.length === 0 ? (
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
  );
};
