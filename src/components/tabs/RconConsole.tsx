import React, { useRef, useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands } from '../../lib/tauri';
import { RunningPal } from '../ui/RunningPal';

interface LibraryCommand {
  name: string;
  syntax: string;
  description: string;
  instant: boolean;
  params?: { name: string; placeholder: string; type: 'text' | 'number' }[];
}

export const RconConsole: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { rconConnected, setRconConnected, showNotification } = useAppStore();
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<{ type: 'cmd' | 'response' | 'error'; text: string; time: string }[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Announcement and Auto Features States
  const [announcementText, setAnnouncementText] = useState('');
  const [autoAnnounceEnabled, setAutoAnnounceEnabled] = useState(false);
  const [autoAnnounceInterval, setAutoAnnounceInterval] = useState(10); // Minutes
  const [autoAnnounceMessage, setAutoAnnounceMessage] = useState('Welcome to our server! Be sure to save your progress.');

  // Command Builder States
  const [activeBuilderCmd, setActiveBuilderCmd] = useState<LibraryCommand | null>(null);
  const [builderValues, setBuilderValues] = useState<Record<string, string>>({});
  const [sidebarTab, setSidebarTab] = useState<'library' | 'guide'>('library');

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const server = useAppStore((state) => state.servers.find((s) => s.id === serverId));
  const isServerRunning = server?.status === 'running';
  const isConnected = rconConnected[serverId] ?? false;

  const [autoConnect, setAutoConnect] = useState(() => localStorage.getItem(`rcon_autoconnect_${serverId}`) !== 'false');
  const autoConnectAttempted = useRef(false);

  useEffect(() => {
    autoConnectAttempted.current = false;
  }, [serverId]);

  useEffect(() => {
    if (isServerRunning && !isConnected && autoConnect && !autoConnectAttempted.current) {
      autoConnectAttempted.current = true;
      const timer = setTimeout(() => {
        handleConnect();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [serverId, isServerRunning, isConnected, autoConnect]);

  const handleToggleAutoConnect = async () => {
    const newVal = !autoConnect;
    setAutoConnect(newVal);
    localStorage.setItem(`rcon_autoconnect_${serverId}`, String(newVal));
    if (newVal) {
      if (isServerRunning && !isConnected) {
        await handleConnect();
      }
    } else {
      if (isConnected) {
        await handleDisconnect();
      }
    }
  };

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







  const commandLibrary: LibraryCommand[] = [
    { name: 'Show Players', syntax: 'ShowPlayers', description: 'Returns list of connected players.', instant: true },
    { name: 'Save World', syntax: 'Save', description: 'Force save server data to disk.', instant: true },
    { name: 'Server Info', syntax: 'Info', description: 'Shows Palworld server version information.', instant: true },
    { 
      name: 'Broadcast', 
      syntax: 'Broadcast <Message>', 
      description: 'Send an announcement message to all players.', 
      instant: false,
      params: [{ name: 'Message Text', placeholder: 'Message', type: 'text' }]
    },
    { 
      name: 'Kick Player', 
      syntax: 'KickPlayer <SteamID>', 
      description: 'Kicks a player by their SteamID from the server.', 
      instant: false,
      params: [{ name: 'Player SteamID', placeholder: 'SteamID', type: 'text' }]
    },
    { 
      name: 'Ban Player', 
      syntax: 'BanPlayer <SteamID>', 
      description: 'Permanently bans a player by their SteamID.', 
      instant: false,
      params: [{ name: 'Player SteamID', placeholder: 'SteamID', type: 'text' }]
    },
    { 
      name: 'Unban Player', 
      syntax: 'UnBanPlayer <SteamID>', 
      description: 'Removes a ban for the specified SteamID.', 
      instant: false,
      params: [{ name: 'Player SteamID', placeholder: 'SteamID', type: 'text' }]
    },
    { 
      name: 'Teleport to Player', 
      syntax: 'TeleportToPlayer <SteamID>', 
      description: 'Teleports the admin character to the player.', 
      instant: false,
      params: [{ name: 'Player SteamID', placeholder: 'SteamID', type: 'text' }]
    },
    { 
      name: 'Teleport Player to Me', 
      syntax: 'TeleportToMe <SteamID>', 
      description: 'Teleports the specified player to the admin.', 
      instant: false,
      params: [{ name: 'Player SteamID', placeholder: 'SteamID', type: 'text' }]
    },
    { 
      name: 'Shutdown Server', 
      syntax: 'Shutdown <Seconds> <Message>', 
      description: 'Shuts down server after countdown with warning.', 
      instant: false,
      params: [
        { name: 'Delay (Seconds)', placeholder: 'Seconds', type: 'number' },
        { name: 'Warning Message', placeholder: 'Message', type: 'text' }
      ]
    },
    { name: 'Immediate Exit', syntax: 'DoExit', description: 'Gracefully saves and stops the server immediately.', instant: true },
  ];

  const scrollToBottom = () => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  };

  useEffect(scrollToBottom, [history]);

  // Client-side Auto Announcement loop
  useEffect(() => {
    if (!isConnected || !autoAnnounceEnabled || !autoAnnounceMessage.trim()) return;

    const intervalMs = autoAnnounceInterval * 60 * 1000;
    const timer = setInterval(() => {
      const formattedMsg = autoAnnounceMessage.trim().replace(/\s+/g, '_');
      const cmd = `Broadcast ${formattedMsg}`;
      addLine('cmd', `[Auto-Announce] > ${cmd}`);
      
      tauriCommands.rconSendCommand(serverId, cmd).then((result) => {
        if (result.success) {
          addLine('response', `[Auto-Announce] ${result.message || '✓ Broadcast sent'}`);
        } else {
          addLine('error', `[Auto-Announce] Error: ${result.message}`);
        }
      }).catch((err) => {
        addLine('error', `[Auto-Announce] Error: ${err}`);
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isConnected, autoAnnounceEnabled, autoAnnounceInterval, autoAnnounceMessage, serverId]);

  const addLine = (type: 'cmd' | 'response' | 'error', text: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setHistory((prev) => [...prev.slice(-200), { type, text, time }]);
  };

  const handleConnect = async () => {
    try {
      const result = await tauriCommands.rconConnect(serverId);
      if (result.success) {
        setRconConnected(serverId, true);
        addLine('response', '✓ Connected to RCON');
        showNotification('success', 'RCON connected');
      } else {
        addLine('error', `✗ ${result.message}`);
        showNotification('error', result.message);
      }
    } catch (e: any) {
      addLine('error', `✗ Connection failed: ${e}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await tauriCommands.rconDisconnect(serverId);
      setRconConnected(serverId, false);
      addLine('response', '✓ Disconnected from RCON');
    } catch (_) {}
  };

  const handleSend = async () => {
    const cmd = command.trim();
    if (!cmd) return;

    addLine('cmd', `> ${cmd}`);
    setCmdHistory((prev) => [cmd, ...prev.slice(0, 50)]);
    setHistoryIndex(-1);
    setCommand('');

    try {
      const result = await tauriCommands.rconSendCommand(serverId, cmd);
      if (result.success) {
        addLine('response', result.message || '(no output)');
      } else {
        addLine('error', result.message);
      }
    } catch (e: any) {
      addLine('error', `Error: ${e}`);
    }
  };

  const handleSendAnnouncement = async () => {
    const text = announcementText.trim();
    if (!text) return;
    const formattedText = text.replace(/\s+/g, '_');
    const cmd = `Broadcast ${formattedText}`;
    addLine('cmd', `> ${cmd}`);
    setAnnouncementText('');
    try {
      const result = await tauriCommands.rconSendCommand(serverId, cmd);
      if (result.success) {
        addLine('response', result.message || '✓ Broadcast sent');
      } else {
        addLine('error', result.message);
      }
    } catch (err: any) {
      addLine('error', `Error: ${err}`);
    }
  };

  const handleBroadcastAndSave = async () => {
    addLine('cmd', `> Broadcast Warning:_Saving_world_data...`);
    try {
      const result1 = await tauriCommands.rconSendCommand(serverId, 'Broadcast Warning:_Saving_world_data...');
      if (!result1.success) {
        addLine('error', result1.message);
      }
      
      setTimeout(async () => {
        addLine('cmd', `> Save`);
        const result2 = await tauriCommands.rconSendCommand(serverId, 'Save');
        if (result2.success) {
          addLine('response', result2.message || '✓ World data saved successfully.');
          showNotification('success', 'Broadcast sent & saved successfully');
        } else {
          addLine('error', result2.message);
        }
      }, 500);
    } catch (err: any) {
      addLine('error', `Error: ${err}`);
    }
  };

  const handleCommandClick = (cmd: LibraryCommand) => {
    if (cmd.instant) {
      addLine('cmd', `> ${cmd.syntax}`);
      tauriCommands.rconSendCommand(serverId, cmd.syntax).then((result) => {
        if (result.success) {
          addLine('response', result.message || '(no output)');
        } else {
          addLine('error', result.message);
        }
      }).catch((err) => {
        addLine('error', `Error: ${err}`);
      });
    } else {
      const initialVals: Record<string, string> = {};
      if (cmd.params) {
        cmd.params.forEach(p => {
          initialVals[p.name] = '';
        });
      }
      setBuilderValues(initialVals);
      setActiveBuilderCmd(cmd);
    }
  };

  const handleExecuteBuilder = async () => {
    if (!activeBuilderCmd) return;
    
    let cmdString = activeBuilderCmd.syntax;
    if (activeBuilderCmd.params) {
      let valid = true;
      activeBuilderCmd.params.forEach(p => {
        let val = builderValues[p.name]?.trim() || '';
        if (!val) {
          showNotification('error', `${p.name} is required`);
          valid = false;
        }
        if (p.name.toLowerCase().includes('message')) {
          val = val.replace(/\s+/g, '_');
        }
        cmdString = cmdString.replace(`<${p.placeholder}>`, val);
      });
      if (!valid) return;
    }

    addLine('cmd', `> ${cmdString}`);
    setActiveBuilderCmd(null);

    try {
      const result = await tauriCommands.rconSendCommand(serverId, cmdString);
      if (result.success) {
        addLine('response', result.message || '(no output)');
      } else {
        addLine('error', result.message);
      }
    } catch (err: any) {
      addLine('error', `Error: ${err}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0 && historyIndex < cmdHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommand(cmdHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(cmdHistory[newIndex]);
      } else {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  return (
    <div className="flex gap-6 p-6 h-full overflow-hidden select-none">
      {/* LEFT COLUMN: Terminal Console */}
      <div className="flex-1 flex flex-col glass-card border border-dark-750/30 bg-dark-900/60 p-5 rounded-xl min-w-0">
        {/* Header Control */}
        <div className="flex items-center justify-between pb-4 border-b border-dark-850/60 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${
              isConnected 
                ? 'bg-success-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                : 'bg-error-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
            }`} />
            <span className="text-xs font-black uppercase tracking-widest text-dark-300">
              {isConnected ? 'RCON Session Active' : 'RCON Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider select-none">
                Auto-Connect
              </span>
              <button
                onClick={handleToggleAutoConnect}
                disabled={!isServerRunning}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                  autoConnect ? 'bg-primary-500' : 'bg-dark-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoConnect ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <button
              onClick={isConnected ? handleDisconnect : handleConnect}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 active:scale-95 border ${
                isConnected
                  ? 'bg-error-500/10 text-error-400 border-error-500/30 hover:bg-error-500/20'
                  : 'bg-primary-500/10 text-primary-400 border-primary-500/30 hover:bg-primary-500/20'
              }`}
            >
              {isConnected ? 'Disconnect' : 'Establish Connection'}
            </button>
          </div>
        </div>

        {/* Terminal logs output */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto min-h-0 bg-dark-950/70 border border-dark-850 rounded-xl p-4 font-mono space-y-2 relative focus:outline-none custom-scrollbar"
          onClick={() => inputRef.current?.focus()}
        >
          {history.length === 0 ? (
            !server?.rconConfig.enabled ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-3.5 text-dark-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 text-warning-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-xs font-black uppercase tracking-wider text-dark-300">
                  RCON is Disabled
                </p>
                <p className="text-[11px] text-dark-500 max-w-xs leading-relaxed">
                  RCON must be enabled in your server configuration to execute scheduled tasks, check player lists, or send warning broadcasts.
                </p>
                <button
                  onClick={handleEnableRcon}
                  disabled={isEnabling}
                  className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 hover:text-primary-300 border border-primary-500/30 hover:border-primary-500/50 font-black px-5 py-2.5 rounded-xl text-[10px] uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50"
                >
                  {isEnabling ? 'Enabling RCON...' : isServerRunning ? 'Enable RCON & Restart Server' : 'Enable RCON'}
                </button>
              </div>
            ) : isConnected ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-success-500/10 border border-success-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5 text-success-400 animate-pulse">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="text-xs font-black uppercase tracking-wider text-success-400">
                    Terminal Online
                  </p>
                  <p className="text-[11px] text-dark-400 leading-relaxed">
                    RCON session established. Ready to accept command inputs below or from the sidebar library.
                  </p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-5">
                <RunningPal size={88} />
                <div className="space-y-1.5 max-w-sm">
                  <p className="text-xs font-black uppercase tracking-wider text-dark-300">
                    RCON Stream Offline
                  </p>
                  <p className="text-[11px] text-dark-500 leading-relaxed">
                    Establish an RCON connection to pipe the server's live console stream and run administration commands.
                  </p>
                </div>
                <button
                  onClick={handleConnect}
                  disabled={!isServerRunning}
                  className="bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/30 hover:border-primary-500/50 text-primary-400 hover:text-primary-300 font-black px-5 py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all duration-200 active:scale-95 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
                  Establish Connection
                </button>
              </div>
            )
          ) : (
            history.map((line, i) => (
              <div key={i} className="flex gap-3 leading-relaxed">
                <span className="text-dark-600 text-[10px] shrink-0 font-mono mt-0.5">
                  [{line.time}]
                </span>
                <span
                  className={`text-xs ${
                    line.type === 'cmd'
                      ? 'text-cyan-400 font-bold'
                      : line.type === 'error'
                      ? 'text-error-400 font-semibold'
                      : 'text-dark-200'
                  }`}
                >
                  {line.text}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Console command input */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-dark-850/60">
          <span className="text-primary-400 text-sm font-black font-mono select-none">{'>'}</span>
          <input
            ref={inputRef}
            id="rcon-input"
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isServerRunning}
            className="flex-1 bg-dark-950/40 border border-dark-800 focus:border-primary-500/50 rounded-xl px-4 py-2.5 font-mono text-xs text-dark-100 placeholder-dark-600 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={isServerRunning ? 'Execute command (auto-connects if offline)...' : 'Start server to enable RCON terminal...'}
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!isServerRunning || !command.trim()}
            className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 hover:text-primary-300 border border-primary-500/30 hover:border-primary-500/50 font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Run
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: Sidebar Controls */}
      <div className="w-80 shrink-0 flex flex-col gap-5 overflow-y-auto custom-scrollbar select-none">
        
        {/* Quick Announcements & Action Trigger */}
        <div className="glass-card border border-dark-750/30 bg-dark-900/60 p-5 rounded-xl space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-gradient-cyan">
            Announcements & Save
          </h3>
          
          {/* Send Announcement Segment */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Send Announcement</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                disabled={!isServerRunning}
                placeholder="Message (use _ for spaces)..."
                className="flex-1 bg-dark-950/40 border border-dark-800 focus:border-primary-500/50 rounded-lg px-3 py-1.5 text-xs text-dark-100 placeholder-dark-600 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSendAnnouncement}
                disabled={!isServerRunning || !announcementText.trim()}
                className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>

          {/* Broadcast & Save Button */}
          <button
            onClick={handleBroadcastAndSave}
            disabled={!isServerRunning}
            className="w-full bg-gradient-to-r from-success-600/10 to-emerald-500/10 hover:from-success-600/20 hover:to-emerald-500/20 border border-success-500/25 hover:border-success-500/40 text-success-400 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h-2v5.586L7.707 10.293z" />
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6 4H8v2h4v-2z" clipRule="evenodd" />
            </svg>
            Broadcast & Save
          </button>

          {/* Auto Announcement config */}
          <div className="border-t border-dark-800/60 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="auto-announce-toggle" className="text-[10px] font-bold text-dark-400 uppercase tracking-wider cursor-pointer">
                Auto Announcement
              </label>
              <input
                type="checkbox"
                id="auto-announce-toggle"
                checked={autoAnnounceEnabled}
                onChange={(e) => setAutoAnnounceEnabled(e.target.checked)}
                disabled={!isServerRunning}
                className="w-3.5 h-3.5 accent-primary-500 rounded bg-dark-950 border-dark-700 cursor-pointer disabled:opacity-50"
              />
            </div>
            
            {autoAnnounceEnabled && (
              <div className="space-y-2.5 animate-slide-in">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-dark-500 font-bold uppercase tracking-wider">Interval:</span>
                  <select
                    value={autoAnnounceInterval}
                    onChange={(e) => setAutoAnnounceInterval(Number(e.target.value))}
                    className="bg-dark-950 border border-dark-800 rounded px-2 py-0.5 text-xs text-dark-200"
                  >
                    <option value={1}>1 Min</option>
                    <option value={5}>5 Min</option>
                    <option value={10}>10 Min</option>
                    <option value={15}>15 Min</option>
                    <option value={30}>30 Min</option>
                  </select>
                </div>
                <textarea
                  value={autoAnnounceMessage}
                  onChange={(e) => setAutoAnnounceMessage(e.target.value)}
                  placeholder="Automated message text..."
                  rows={2}
                  className="w-full bg-dark-950/40 border border-dark-800 focus:border-primary-500/50 rounded-lg p-2 text-xs text-dark-200 placeholder-dark-600 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Predefined Commands Library OR Parameter Builder */}
        {activeBuilderCmd ? (
          <div className="glass-card border border-primary-500/35 bg-dark-900/80 p-5 rounded-xl space-y-4 animate-scale-in">
            <div className="flex justify-between items-center pb-2 border-b border-dark-800/60">
              <h3 className="text-xs font-black uppercase tracking-wider text-gradient-cyan">
                Command Builder
              </h3>
              <button
                onClick={() => setActiveBuilderCmd(null)}
                className="text-[10px] text-dark-500 hover:text-dark-300 uppercase tracking-widest font-black"
              >
                Back
              </button>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs font-mono font-bold text-primary-400">{activeBuilderCmd.name}</div>
              <div className="text-[10px] text-dark-400 leading-relaxed">{activeBuilderCmd.description}</div>
            </div>

            <div className="space-y-3 pt-2">
              {activeBuilderCmd.params?.map((p) => (
                <div key={p.name} className="space-y-1">
                  <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                    {p.name}
                  </label>
                  <input
                    type={p.type === 'number' ? 'number' : 'text'}
                    value={builderValues[p.name] || ''}
                    onChange={(e) => setBuilderValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                    placeholder={p.placeholder}
                    className="w-full bg-dark-950/50 border border-dark-800 focus:border-primary-500/50 rounded-lg px-3 py-1.5 text-xs text-dark-100 placeholder-dark-600 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleExecuteBuilder}
              className="w-full bg-gradient-to-r from-primary-600 to-cyan-500 hover:from-primary-500 hover:to-cyan-400 text-white py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-lg shadow-cyan-950/20"
            >
              Run Command
            </button>
          </div>
        ) : (
          <div className="glass-card border border-dark-750/30 bg-dark-900/60 p-5 rounded-xl space-y-3 flex flex-col min-h-0">
            <div className="flex items-center gap-1 border-b border-dark-800/40 pb-2 mb-1">
              <button
                onClick={() => setSidebarTab('library')}
                className={`flex-1 py-1.5 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  sidebarTab === 'library'
                    ? 'bg-primary-500/10 border border-primary-500/20 text-primary-400'
                    : 'text-dark-400 hover:text-dark-200 border border-transparent'
                }`}
              >
                Commands
              </button>
              <button
                onClick={() => setSidebarTab('guide')}
                className={`flex-1 py-1.5 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  sidebarTab === 'guide'
                    ? 'bg-primary-500/10 border border-primary-500/20 text-primary-400'
                    : 'text-dark-400 hover:text-dark-200 border border-transparent'
                }`}
              >
                Config Guide
              </button>
            </div>

            {sidebarTab === 'guide' ? (
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 custom-scrollbar max-h-[300px] text-xs text-dark-300">
                <div className="space-y-1.5">
                  <h4 className="font-bold text-[10px] uppercase text-primary-400 tracking-wider">1. RCON Prerequisites</h4>
                  <p className="text-[10px] leading-relaxed text-dark-400">
                    To enable RCON, open the <span className="text-dark-200 font-bold">Config Editor</span> tab and ensure:
                  </p>
                  <ul className="list-disc pl-4 text-[10px] space-y-1 text-dark-400 font-mono">
                    <li>RCONEnabled = <span className="text-success-400">True</span></li>
                    <li>AdminPassword = <span className="text-warning-400">"your_password"</span></li>
                    <li>RCONPort = <span className="text-cyan-400">25575</span></li>
                  </ul>
                  <p className="text-[9px] text-warning-400/80 leading-normal italic bg-warning-500/5 p-2 rounded border border-warning-500/15">
                    ⚠️ Palworld automatically disables RCON if the Admin Password is empty.
                  </p>
                </div>
                <div className="space-y-1.5 border-t border-dark-800/40 pt-3">
                  <h4 className="font-bold text-[10px] uppercase text-primary-400 tracking-wider">2. Authentication Failures</h4>
                  <p className="text-[10px] leading-relaxed text-dark-400">
                    If you get an authentication failed error:
                  </p>
                  <ul className="list-decimal pl-4 text-[10px] space-y-1 text-dark-400">
                    <li>Verify your Admin Password in Settings.</li>
                    <li>Passwords containing spaces or special characters can sometimes fail to parse correctly.</li>
                    <li>Restart the server after modifying password settings.</li>
                  </ul>
                </div>
                <div className="space-y-1.5 border-t border-dark-800/40 pt-3">
                  <h4 className="font-bold text-[10px] uppercase text-primary-400 tracking-wider">3. Connection Issues</h4>
                  <p className="text-[10px] leading-relaxed text-dark-400">
                    If connection times out:
                  </p>
                  <ul className="list-decimal pl-4 text-[10px] space-y-1 text-dark-400 font-mono">
                    <li>The server might still be starting up (takes 10-30 seconds to open port).</li>
                    <li>Ensure RCONPort is open in your local/cloud firewall (TCP).</li>
                  </ul>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-dark-500 leading-relaxed">
                  Click instant commands to run them immediately, or click parameter commands to pre-fill.
                </p>
                
                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {commandLibrary.map((cmd) => (
                    <button
                      key={cmd.syntax}
                      onClick={() => handleCommandClick(cmd)}
                      className="w-full p-2.5 text-left bg-dark-950/35 border border-dark-850 hover:border-primary-500/30 rounded-lg hover:bg-primary-500/5 transition-all text-xs group"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-dark-200 group-hover:text-primary-400 font-mono transition-colors">
                          {cmd.name}
                        </span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                          cmd.instant 
                            ? 'bg-success-500/5 text-success-400 border-success-500/20' 
                            : 'bg-warning-500/5 text-warning-400 border-warning-500/20'
                        }`}>
                          {cmd.instant ? 'Instant' : 'Builder'}
                        </span>
                      </div>
                      <div className="text-[10px] text-dark-500 mt-0.5 leading-normal">
                        {cmd.description}
                      </div>
                      <div className="text-[9px] font-mono text-dark-600 mt-1 bg-dark-950/70 px-1.5 py-0.5 rounded border border-dark-800 group-hover:text-dark-400 transition-colors">
                        {cmd.syntax}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
