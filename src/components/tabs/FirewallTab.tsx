import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands } from '../../lib/tauri';

export const FirewallTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification, servers, setServers } = useAppStore();
  const server = servers.find((s) => s.id === serverId);
  const isServerRunning = server?.status === 'running' || server?.status === 'online';

  const [isAllocating, setIsAllocating] = useState(false);
  const [isConfiguringFirewall, setIsConfiguringFirewall] = useState(false);

  const [portsAvailability, setPortsAvailability] = useState({
    gamePort: true,
    queryPort: true,
    rconPort: true,
    restApiPort: true,
  });

  const [firewallStatus, setFirewallStatus] = useState({
    gamePortAllowed: false,
    queryPortAllowed: false,
    rconPortAllowed: false,
    restApiPortAllowed: false,
  });

  const checkPorts = useCallback(async () => {
    if (!server) return;
    try {
      const gameAvailable = await tauriCommands.checkPortAvailable(server.ports.gamePort);
      const queryAvailable = await tauriCommands.checkPortAvailable(server.ports.queryPort || 27015);
      const rconAvailable = await tauriCommands.checkPortAvailable(server.ports.rconPort);
      const restAvailable = await tauriCommands.checkPortAvailable(server.ports.restApiPort);

      setPortsAvailability({
        gamePort: gameAvailable,
        queryPort: queryAvailable,
        rconPort: rconAvailable,
        restApiPort: restAvailable,
      });

      const fw = await tauriCommands.checkFirewallStatus(server.name);
      setFirewallStatus(fw);
    } catch (e) {
      console.error('Failed to check port availability or firewall rules:', e);
    }
  }, [server?.ports.gamePort, server?.ports.queryPort, server?.ports.rconPort, server?.ports.restApiPort, server?.name]);

  useEffect(() => {
    checkPorts();
    const interval = setInterval(checkPorts, 10000);
    return () => clearInterval(interval);
  }, [checkPorts]);

  if (!server) return null;

  const handleAutoAllocateAll = async () => {
    setIsAllocating(true);
    try {
      const ports = await tauriCommands.allocatePorts(serverId);

      // Get current config
      const config = await tauriCommands.getServerConfig(serverId);
      config.publicPort = ports.gamePort;
      config.queryPort = ports.queryPort;
      config.rconPort = ports.rconPort;
      config.restApiPort = ports.restApiPort;

      // Save config to file and DB
      await tauriCommands.saveServerConfig(serverId, config);

      // Auto Firewall Port Allocation
      try {
        await tauriCommands.openFirewallPorts(
          server.name,
          ports.gamePort,
          ports.queryPort,
          ports.rconPort,
          ports.restApiPort
        );
        showNotification(
          'success',
          `Successfully allocated ports and updated Windows Firewall rules! Game: ${ports.gamePort}, Query: ${ports.queryPort}, RCON: ${ports.rconPort}, REST API: ${ports.restApiPort}`
        );
      } catch (fwErr) {
        showNotification(
          'success',
          `Successfully allocated and saved all ports! Game: ${ports.gamePort}, Query: ${ports.queryPort}, RCON: ${ports.rconPort}, REST API: ${ports.restApiPort}. (Firewall requires manual update: ${fwErr})`
        );
      }

      // Notify if restart is needed
      if (isServerRunning) {
        showNotification('warning', 'Ports modified. Please restart the server to apply the changes.');
      }

      // Update store state
      const updatedServers = await tauriCommands.getServers();
      setServers(updatedServers);
      await checkPorts();
    } catch (e: any) {
      showNotification('error', `Failed to auto-allocate ports: ${e}`);
    } finally {
      setIsAllocating(false);
    }
  };

  const handleAllocateIndividual = async (key: 'gamePort' | 'queryPort' | 'rconPort' | 'restApiPort') => {
    setIsAllocating(true);
    try {
      const ports = await tauriCommands.allocatePorts(serverId);
      const config = await tauriCommands.getServerConfig(serverId);

      let allocatedVal = 0;
      if (key === 'gamePort') {
        allocatedVal = ports.gamePort;
        config.publicPort = ports.gamePort;
      } else if (key === 'queryPort') {
        allocatedVal = ports.queryPort;
        config.queryPort = ports.queryPort;
      } else if (key === 'rconPort') {
        allocatedVal = ports.rconPort;
        config.rconPort = ports.rconPort;
      } else if (key === 'restApiPort') {
        allocatedVal = ports.restApiPort;
        config.restApiPort = ports.restApiPort;
      }

      await tauriCommands.saveServerConfig(serverId, config);
      showNotification('success', `Assigned new ${key === 'gamePort' ? 'Game Port' : key === 'queryPort' ? 'Query Port' : key === 'rconPort' ? 'RCON Port' : 'REST API Port'}: ${allocatedVal}`);

      if (isServerRunning) {
        showNotification('warning', 'Port modified. Please restart the server to apply changes.');
      }

      const updatedServers = await tauriCommands.getServers();
      setServers(updatedServers);
      await checkPorts();
    } catch (e: any) {
      showNotification('error', `Failed to assign port: ${e}`);
    } finally {
      setIsAllocating(false);
    }
  };

  const handleConfigureFirewall = async () => {
    setIsConfiguringFirewall(true);
    try {
      await tauriCommands.openFirewallPorts(
        server.name,
        server.ports.gamePort,
        server.ports.queryPort || 27015,
        server.ports.rconPort,
        server.ports.restApiPort
      );
      showNotification('success', 'Windows Defender Firewall rules configured successfully!');
      await checkPorts();
    } catch (e: any) {
      showNotification('error', `Firewall configuration failed: ${e}`);
    } finally {
      setIsConfiguringFirewall(false);
    }
  };

  return (
    <div className="p-6 overflow-y-auto h-full flex flex-col space-y-6 select-none">
      {/* Tab Header Actions */}
      <div className="flex items-center justify-between border-b border-dark-800/40 pb-4">
        <div>
          <h2 className="text-base font-bold text-dark-100">Firewall & Ports — {server.name}</h2>
          <p className="text-[11px] text-dark-500 mt-1">
            Detect port conflicts, allocate free ports, and manage Windows Defender Firewall rules for this server.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAutoAllocateAll}
            disabled={isAllocating}
            className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:border-primary-500/50 font-black text-xs px-4 py-2 rounded-xl uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50"
          >
            {isAllocating ? 'Allocating...' : 'Auto-Allocate All Ports'}
          </button>
          <button
            onClick={handleConfigureFirewall}
            disabled={isConfiguringFirewall}
            className="bg-success-500/10 hover:bg-success-500/20 text-success-400 border border-success-500/30 hover:border-success-500/50 font-black text-xs px-4 py-2 rounded-xl uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50"
          >
            {isConfiguringFirewall ? 'Opening Rules...' : 'Open Windows Firewall'}
          </button>
        </div>
      </div>

      {/* Main Port Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Game Port */}
        <div className="glass-card p-5 border border-dark-750/30 bg-dark-900/40 rounded-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-dark-500 uppercase tracking-wider">Game Port (UDP)</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    portsAvailability.gamePort
                      ? 'text-success-400 bg-success-500/10 border-success-500/20'
                      : 'text-error-400 bg-error-500/10 border-error-500/20'
                  }`}
                >
                  {portsAvailability.gamePort ? 'Free' : 'In Use'}
                </span>
                <span
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    firewallStatus.gamePortAllowed
                      ? 'text-success-400 bg-success-500/10 border-success-500/20'
                      : 'text-warning-400 bg-warning-500/15 border-warning-500/20'
                  }`}
                >
                  {firewallStatus.gamePortAllowed ? '🛡️ Allowed' : '⚠️ Blocked'}
                </span>
              </div>
            </div>
            <div className="text-2xl font-black text-dark-200 font-mono tracking-tight">
              {server.ports.gamePort}
            </div>
            <p className="text-[10px] leading-relaxed text-dark-500">
              The primary port used by players to connect to the Palworld game server. Default is 8211.
            </p>
          </div>
          <button
            onClick={() => handleAllocateIndividual('gamePort')}
            disabled={isAllocating}
            className="w-full bg-dark-950/60 hover:bg-dark-950 text-dark-300 hover:text-dark-100 border border-dark-800 font-black text-[10px] py-2 rounded-lg uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50"
          >
            Assign Free Port
          </button>
        </div>

        {/* Query Port */}
        <div className="glass-card p-5 border border-dark-750/30 bg-dark-900/40 rounded-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-dark-500 uppercase tracking-wider">Query Port (UDP)</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    portsAvailability.queryPort
                      ? 'text-success-400 bg-success-500/10 border-success-500/20'
                      : 'text-error-400 bg-error-500/10 border-error-500/20'
                  }`}
                >
                  {portsAvailability.queryPort ? 'Free' : 'In Use'}
                </span>
                <span
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    firewallStatus.queryPortAllowed
                      ? 'text-success-400 bg-success-500/10 border-success-500/20'
                      : 'text-warning-400 bg-warning-500/15 border-warning-500/20'
                  }`}
                >
                  {firewallStatus.queryPortAllowed ? '🛡️ Allowed' : '⚠️ Blocked'}
                </span>
              </div>
            </div>
            <div className="text-2xl font-black text-dark-200 font-mono tracking-tight">
              {server.ports.queryPort || 27015}
            </div>
            <p className="text-[10px] leading-relaxed text-dark-500">
              Port used for Steam server query. Default is 27015. Change to avoid conflicts with Deadlock or other games.
            </p>
          </div>
          <button
            onClick={() => handleAllocateIndividual('queryPort')}
            disabled={isAllocating}
            className="w-full bg-dark-950/60 hover:bg-dark-950 text-dark-300 hover:text-dark-100 border border-dark-800 font-black text-[10px] py-2 rounded-lg uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50"
          >
            Assign Free Port
          </button>
        </div>

        {/* RCON Port */}
        <div className="glass-card p-5 border border-dark-750/30 bg-dark-900/40 rounded-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-dark-500 uppercase tracking-wider">RCON Port (TCP)</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    portsAvailability.rconPort
                      ? 'text-success-400 bg-success-500/10 border-success-500/20'
                      : 'text-error-400 bg-error-500/10 border-error-500/20'
                  }`}
                >
                  {portsAvailability.rconPort ? 'Free' : 'In Use'}
                </span>
                <span
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    firewallStatus.rconPortAllowed
                      ? 'text-success-400 bg-success-500/10 border-success-500/20'
                      : 'text-warning-400 bg-warning-500/15 border-warning-500/20'
                  }`}
                >
                  {firewallStatus.rconPortAllowed ? '🛡️ Allowed' : '⚠️ Blocked'}
                </span>
              </div>
            </div>
            <div className="text-2xl font-black text-dark-200 font-mono tracking-tight">
              {server.ports.rconPort}
            </div>
            <p className="text-[10px] leading-relaxed text-dark-500">
              Port used for remote console administration to run commands and kick/ban players. Default is 25575.
            </p>
          </div>
          <button
            onClick={() => handleAllocateIndividual('rconPort')}
            disabled={isAllocating}
            className="w-full bg-dark-950/60 hover:bg-dark-950 text-dark-300 hover:text-dark-100 border border-dark-800 font-black text-[10px] py-2 rounded-lg uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50"
          >
            Assign Free Port
          </button>
        </div>

        {/* REST API Port */}
        <div className="glass-card p-5 border border-dark-750/30 bg-dark-900/40 rounded-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-dark-500 uppercase tracking-wider">REST API Port (TCP)</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    portsAvailability.restApiPort
                      ? 'text-success-400 bg-success-500/10 border-success-500/20'
                      : 'text-error-400 bg-error-500/10 border-error-500/20'
                  }`}
                >
                  {portsAvailability.restApiPort ? 'Free' : 'In Use'}
                </span>
                <span
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    firewallStatus.restApiPortAllowed
                      ? 'text-success-400 bg-success-500/10 border-success-500/20'
                      : 'text-warning-400 bg-warning-500/15 border-warning-500/20'
                  }`}
                >
                  {firewallStatus.restApiPortAllowed ? '🛡️ Allowed' : '⚠️ Blocked'}
                </span>
              </div>
            </div>
            <div className="text-2xl font-black text-dark-200 font-mono tracking-tight">
              {server.ports.restApiPort}
            </div>
            <p className="text-[10px] leading-relaxed text-dark-500">
              Port used by web REST APIs to query server stats and player counts. Default is 8212.
            </p>
          </div>
          <button
            onClick={() => handleAllocateIndividual('restApiPort')}
            disabled={isAllocating}
            className="w-full bg-dark-950/60 hover:bg-dark-950 text-dark-300 hover:text-dark-100 border border-dark-800 font-black text-[10px] py-2 rounded-lg uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50"
          >
            Assign Free Port
          </button>
        </div>
      </div>

      {/* Guide Banner */}
      <div className="glass-card p-4 border border-info-500/10 bg-info-500/5 rounded-xl flex items-start gap-3.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-info-400 mt-0.5 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-info-400 uppercase tracking-wider">Firewall Configuration Notice</h4>
          <p className="text-[11px] leading-relaxed text-dark-400">
            For players to connect externally, you must configure port forwarding on your router in addition to opening ports in the Windows Firewall. Direct local detection checks local socket binding readiness on the host machine.
          </p>
        </div>
      </div>
    </div>
  );
};
