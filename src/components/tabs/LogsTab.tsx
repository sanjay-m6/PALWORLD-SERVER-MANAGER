import React, { useRef, useEffect, useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands } from '../../lib/tauri';

export const LogsTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { serverLogs, clearLogs, showNotification, addLogLine, rconConnected, setRconConnected } = useAppStore();
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warning' | 'error' | 'chat'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [cleanView, setCleanView] = useState(true);
  
  const [command, setCommand] = useState('');
  const [executingCmd, setExecutingCmd] = useState(false);
  const [connectingRcon, setConnectingRcon] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const logs = serverLogs[serverId] || [];
  const server = useAppStore((state) => state.servers.find((s) => s.id === serverId));
  const isServerRunning = server?.status === 'running' || server?.status === 'online';
  const isRconConnected = rconConnected[serverId] ?? false;

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [logs.length, autoScroll]);

  // Connect RCON
  const handleConnectRcon = async () => {
    setConnectingRcon(true);
    try {
      const result = await tauriCommands.rconConnect(serverId);
      if (result.success) {
        setRconConnected(serverId, true);
        showNotification('success', 'RCON connected successfully');
      } else {
        showNotification('error', result.message || 'RCON connection failed');
      }
    } catch (e: any) {
      showNotification('error', `RCON connection failed: ${e}`);
    } finally {
      setConnectingRcon(false);
    }
  };

  // Disconnect RCON
  const handleDisconnectRcon = async () => {
    try {
      await tauriCommands.rconDisconnect(serverId);
      setRconConnected(serverId, false);
      showNotification('success', 'RCON disconnected');
    } catch (e: any) {
      console.error(e);
    }
  };

  // Clean Unreal Engine logging noise
  const cleanLogMessage = (message: string) => {
    // Strip Unreal Engine timestamps e.g. [2026.07.13-12.24.05:123][  0]
    let cleaned = message.replace(/^\[\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3}\]\[\s*\d+\]/, '').trim();
    // Strip LogPal: Display:, LogInit:, LogNet: etc.
    cleaned = cleaned.replace(/^(Log[a-zA-Z]+):\s*(Display|Warning|Error|Log):\s*/, '').trim();
    cleaned = cleaned.replace(/^(Log[a-zA-Z]+):\s*/, '').trim();
    return cleaned;
  };

  // Send RCON command
  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || executingCmd) return;

    const cmdText = command.trim();
    setCommand('');

    const newHistory = [cmdText, ...cmdHistory.filter(h => h !== cmdText)].slice(0, 50);
    setCmdHistory(newHistory);
    setHistoryIndex(-1);

    addLogLine(serverId, {
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level: 'chat',
      message: `> ${cmdText}`,
    });

    if (!isRconConnected) {
      addLogLine(serverId, {
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
        level: 'error',
        message: 'Error: RCON connection is not active. Click the connect button above.',
      });
      return;
    }

    setExecutingCmd(true);
    try {
      const response = await tauriCommands.rconSendCommand(serverId, cmdText);
      if (response.success) {
        addLogLine(serverId, {
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level: 'info',
          message: response.message || 'Command executed successfully',
        });
      } else {
        addLogLine(serverId, {
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level: 'error',
          message: response.message || 'Command execution failed',
        });
      }
    } catch (err: any) {
      addLogLine(serverId, {
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
        level: 'error',
        message: `RCON Error: ${err.message || err}`,
      });
    } finally {
      setExecutingCmd(false);
      setTimeout(() => {
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
        inputRef.current?.focus();
      }, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex < cmdHistory.length) {
        setHistoryIndex(nextIndex);
        setCommand(cmdHistory[nextIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = historyIndex - 1;
      if (nextIndex >= 0) {
        setHistoryIndex(nextIndex);
        setCommand(cmdHistory[nextIndex]);
      } else {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  // Level counts
  const infoCount = logs.filter(l => l.level === 'info').length;
  const warningCount = logs.filter(l => l.level === 'warning').length;
  const errorCount = logs.filter(l => l.level === 'error').length;
  const chatCount = logs.filter(l => l.level === 'chat').length;

  // Filtered log lines
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.level.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  const levelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-error-400 bg-error-500/10 border-error-500/20';
      case 'warning': return 'text-warning-400 bg-warning-500/10 border-warning-500/20';
      case 'chat': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
      default: return 'text-primary-400 bg-primary-500/10 border-primary-500/20';
    }
  };

  const lineTextColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-300/90';
      case 'warning': return 'text-amber-200/90';
      case 'chat': return 'text-emerald-300/90';
      default: return 'text-dark-200/90';
    }
  };

  const handleExport = () => {
    if (logs.length === 0) {
      showNotification('warning', 'No logs available to export');
      return;
    }
    const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\r\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `palworld_server_${serverId}_logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('success', 'Server logs exported successfully');
  };

  return (
    <div className="flex flex-col h-full p-5 space-y-4">
      {/* Control Panel: Filters & Search */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-3 items-center justify-between border-dark-800/40">
        
        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search console logs..."
            className="input-field text-xs pl-8 py-2 bg-dark-950/60 border-dark-800/80 hover:border-dark-700/60 focus:border-primary-500/40 transition-colors"
          />
          <svg className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-dark-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              className="absolute right-2.5 top-2.5 text-dark-500 hover:text-dark-300 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Level Filters */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <button
            onClick={() => setLevelFilter('all')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
              levelFilter === 'all'
                ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
                : 'bg-dark-950/30 border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            All ({logs.length})
          </button>
          <button
            onClick={() => setLevelFilter('info')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
              levelFilter === 'info'
                ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
                : 'bg-dark-950/30 border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            Info ({infoCount})
          </button>
          <button
            onClick={() => setLevelFilter('warning')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
              levelFilter === 'warning'
                ? 'bg-warning-500/10 border-warning-500/30 text-warning-400'
                : 'bg-dark-950/30 border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            Warning ({warningCount})
          </button>
          <button
            onClick={() => setLevelFilter('error')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
              levelFilter === 'error'
                ? 'bg-error-500/10 border-error-500/30 text-error-400'
                : 'bg-dark-950/30 border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            Error ({errorCount})
          </button>
          <button
            onClick={() => setLevelFilter('chat')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
              levelFilter === 'chat'
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-dark-950/30 border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            Input/Commands ({chatCount})
          </button>
        </div>

        {/* Action Toggles */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-dark-400 uppercase tracking-wider cursor-pointer select-none">
            <input
              type="checkbox"
              checked={cleanView}
              onChange={(e) => setCleanView(e.target.checked)}
              className="w-3.5 h-3.5 accent-primary-500 rounded bg-dark-950 border-dark-700 cursor-pointer"
            />
            Clean Console Output
          </label>
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-dark-400 uppercase tracking-wider cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-3.5 h-3.5 accent-primary-500 rounded bg-dark-950 border-dark-700 cursor-pointer"
            />
            Auto-Scroll
          </label>
          <button
            onClick={handleExport}
            disabled={logs.length === 0}
            className="bg-dark-900/60 border border-dark-800 hover:bg-dark-800 text-dark-200 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50"
            title="Download full log file"
          >
            Export
          </button>
          <button
            onClick={() => clearLogs(serverId)}
            disabled={logs.length === 0}
            className="bg-error-500/10 border border-error-500/20 hover:bg-error-500/20 text-error-400 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log Output Console */}
      <div className="relative flex-1 flex flex-col min-h-0 bg-dark-950/90 rounded-xl border border-dark-900 shadow-2xl p-4 font-mono">
        {/* Terminal Header */}
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-dark-900/60 text-[10px] text-dark-500 uppercase font-bold tracking-wider">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isServerRunning ? 'bg-emerald-500 animate-pulse' : 'bg-dark-600'}`}></span>
            <span>Live Console Stream</span>
            {isServerRunning && (
              <button
                onClick={isRconConnected ? handleDisconnectRcon : handleConnectRcon}
                disabled={connectingRcon}
                className={`ml-2 text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider transition-all duration-200 border ${
                  isRconConnected 
                    ? 'bg-success-500/10 text-success-400 border-success-500/20 hover:bg-success-500/20' 
                    : 'bg-warning-500/10 text-warning-400 border-warning-500/20 hover:bg-warning-500/20'
                }`}
              >
                {connectingRcon ? 'Connecting...' : isRconConnected ? '● RCON Active' : '○ RCON Offline'}
              </button>
            )}
          </div>
          <span>PalServer.log</span>
        </div>

        {/* Scrollable output area */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-2 select-text selection:bg-primary-500/30 scrollbar-thin scrollbar-thumb-dark-800 scrollbar-track-transparent"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <svg className="w-8 h-8 text-dark-600 mb-2 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="text-dark-500 text-xs font-semibold">No matching log entries found.</p>
              <p className="text-dark-600 text-[10px] mt-1">If the server just started, it may take a few seconds to discover and tail the log file.</p>
            </div>
          ) : (
            filteredLogs.map((log, i) => {
              const displayMessage = cleanView ? cleanLogMessage(log.message) : log.message;
              if (cleanView && !displayMessage.trim()) return null; // Skip empty output lines in clean mode
              
              const isCommand = log.level === 'chat' && displayMessage.startsWith('>');
              
              return (
                <div key={i} className="flex gap-3 hover:bg-dark-900/20 py-0.5 px-1 rounded transition-colors group">
                  {!cleanView && (
                    <>
                      <span className="text-dark-600 text-[10px] select-none shrink-0 w-16">
                        {log.timestamp}
                      </span>
                      <span className={`text-[9px] font-bold select-none shrink-0 px-1.5 py-0.5 rounded border uppercase flex items-center justify-center min-w-[62px] h-5 ${levelColor(log.level)}`}>
                        {log.level}
                      </span>
                    </>
                  )}
                  <span className={`text-xs break-all leading-relaxed whitespace-pre-wrap font-mono ${
                    isCommand 
                      ? 'text-primary-400 font-bold' 
                      : lineTextColor(log.level)
                  }`}>
                    {displayMessage}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Terminal Input Bar */}
        {isServerRunning && (
          <form onSubmit={handleSendCommand} className="flex items-center gap-2 border-t border-dark-900/60 pt-3 mt-1.5 shrink-0">
            <span className="text-primary-400 font-bold font-mono select-none pl-1">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={executingCmd}
              placeholder={
                isRconConnected 
                  ? "Type server command and press Enter (e.g., ShowPlayers, Info, Broadcast)..." 
                  : "RCON connection required to execute server commands. Connect RCON above."
              }
              className="flex-1 bg-transparent border-0 outline-none ring-0 text-xs text-dark-100 placeholder-dark-600 font-mono focus:ring-0 focus:outline-none"
            />
            {executingCmd && (
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
              </span>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
