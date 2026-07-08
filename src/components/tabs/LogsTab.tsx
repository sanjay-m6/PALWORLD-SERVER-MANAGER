import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';

export const LogsTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { serverLogs, clearLogs } = useAppStore();
  const outputRef = useRef<HTMLDivElement>(null);

  const logs = serverLogs[serverId] || [];

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [logs.length]);

  const levelColor = (level: string) => {
    switch (level) {
      case 'error': return 'console-line-error';
      case 'warning': return 'console-line-warning';
      case 'chat': return 'console-line-chat';
      default: return 'console-line-info';
    }
  };

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-400">
            Server Logs
          </span>
          <span className="text-[10px] text-dark-600">
            ({logs.length} entries)
          </span>
        </div>
        <button
          onClick={() => clearLogs(serverId)}
          className="btn-ghost text-xs py-1 px-2"
        >
          Clear
        </button>
      </div>

      {/* Log output */}
      <div
        ref={outputRef}
        className="console-output flex-1 overflow-y-auto min-h-0 space-y-0.5"
      >
        {logs.length === 0 ? (
          <div className="text-dark-600 text-xs">
            No log entries yet. Start the server to see live logs.
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <span className="text-dark-600 font-mono text-[10px] shrink-0 w-16">
                {log.timestamp}
              </span>
              <span className={`font-mono text-[10px] shrink-0 w-14 uppercase ${levelColor(log.level)}`}>
                [{log.level}]
              </span>
              <span className={levelColor(log.level)}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
