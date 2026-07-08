import React, { useRef, useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands } from '../../lib/tauri';

export const RconConsole: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { rconConnected, setRconConnected, showNotification } = useAppStore();
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<{ type: 'cmd' | 'response' | 'error'; text: string; time: string }[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isConnected = rconConnected[serverId] ?? false;

  const scrollToBottom = () => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  };

  useEffect(scrollToBottom, [history]);

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

  // Quick command buttons
  const quickCommands = [
    { label: 'Players', cmd: 'ShowPlayers' },
    { label: 'Save', cmd: 'Save' },
    { label: 'Info', cmd: 'Info' },
    { label: 'Shutdown 30', cmd: 'Shutdown 30 Server_restarting_in_30_seconds' },
  ];

  return (
    <div className="flex flex-col h-full p-4">
      {/* Connection bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`status-dot ${isConnected ? 'status-online' : 'status-offline'}`} />
          <span className="text-xs font-medium text-dark-300">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <button onClick={handleDisconnect} className="btn-danger text-xs py-1.5 px-3">
              Disconnect
            </button>
          ) : (
            <button onClick={handleConnect} className="btn-primary text-xs py-1.5 px-3">
              Connect
            </button>
          )}
        </div>
      </div>

      {/* Quick commands */}
      {isConnected && (
        <div className="flex items-center gap-2 mb-3">
          {quickCommands.map((qc) => (
            <button
              key={qc.cmd}
              onClick={() => {
                addLine('cmd', `> ${qc.cmd}`);
                tauriCommands.rconSendCommand(serverId, qc.cmd).then((result) => {
                  if (result.success) addLine('response', result.message || '(no output)');
                  else addLine('error', result.message);
                });
              }}
              className="px-2.5 py-1 text-[10px] font-medium text-dark-400 bg-dark-800/50 border border-dark-700/30 rounded-md hover:text-primary-400 hover:border-primary-500/30 transition-colors"
            >
              {qc.label}
            </button>
          ))}
        </div>
      )}

      {/* Console output */}
      <div
        ref={outputRef}
        className="console-output flex-1 overflow-y-auto min-h-0"
        onClick={() => inputRef.current?.focus()}
      >
        {history.length === 0 ? (
          <div className="text-dark-600 text-xs">
            {isConnected
              ? 'Type a command below or use quick commands above...'
              : 'Click "Connect" to start an RCON session'}
          </div>
        ) : (
          history.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-dark-600 text-[10px] shrink-0 font-mono">
                {line.time}
              </span>
              <span
                className={`text-xs ${
                  line.type === 'cmd'
                    ? 'text-primary-400 font-medium'
                    : line.type === 'error'
                    ? 'text-error-400'
                    : 'text-dark-300'
                }`}
              >
                {line.text}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-primary-500 text-sm font-mono">{'>'}</span>
        <input
          ref={inputRef}
          id="rcon-input"
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isConnected}
          className="input-field font-mono text-xs flex-1"
          placeholder={isConnected ? 'Enter RCON command...' : 'Connect to send commands'}
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={!isConnected || !command.trim()}
          className="btn-primary text-xs py-2"
        >
          Send
        </button>
      </div>
    </div>
  );
};
