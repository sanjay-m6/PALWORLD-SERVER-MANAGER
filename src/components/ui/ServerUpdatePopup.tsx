/**
 * ServerUpdatePopup.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive popup that appears when a Palworld server update is detected.
 * Shows server name, version details, and two action buttons:
 *   - "Update Now" (yellow) — triggers the update process immediately
 *   - "Skip" (blue)         — dismisses the popup without updating
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { tauriCommands } from '../../lib/tauri';

interface UpdateInfo {
  serverId: number;
  serverName: string;
  currentVersion: string;
  latestVersion: string;
  releaseTime: string;
}

export const ServerUpdatePopup: React.FC = () => {
  const [updates, setUpdates] = useState<UpdateInfo[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<UpdateInfo>('server-update-available', (event) => {
        const payload = event.payload;
        setUpdates((prev) => {
          // Don't add duplicate popups for the same server
          if (prev.some((u) => u.serverId === payload.serverId)) return prev;
          return [...prev, payload];
        });
      });
      return unlisten;
    };

    const promise = setupListener();
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, []);

  const handleUpdateNow = useCallback(async (update: UpdateInfo) => {
    setUpdatingIds((prev) => new Set(prev).add(update.serverId));
    try {
      await tauriCommands.runServerUpdate(update.serverId);
    } catch (err) {
      console.error('[ServerUpdatePopup] Update failed:', err);
    }
    // Remove from popup list
    setUpdates((prev) => prev.filter((u) => u.serverId !== update.serverId));
    setUpdatingIds((prev) => {
      const next = new Set(prev);
      next.delete(update.serverId);
      return next;
    });
  }, []);

  const handleSkip = useCallback((serverId: number) => {
    setUpdates((prev) => prev.filter((u) => u.serverId !== serverId));
  }, []);

  if (updates.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
      {/* Backdrop — only visible when popup is present */}
      <div
        className="absolute inset-0 bg-dark-950/60 backdrop-blur-sm pointer-events-auto"
        onClick={() => {}} // Block clicks through
      />

      {/* Popup stack */}
      <div className="relative z-10 flex flex-col gap-4 max-h-[80vh] overflow-y-auto pointer-events-auto px-4">
        {updates.map((update) => {
          const isUpdating = updatingIds.has(update.serverId);

          return (
            <div
              key={update.serverId}
              className="relative w-[440px] rounded-2xl border border-dark-700/60 bg-dark-900/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-slide-in"
            >
              {/* Top accent gradient line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-warning-500/80 via-warning-400/60 to-primary-500/40" />

              {/* Content */}
              <div className="p-6">
                {/* Header with icon */}
                <div className="flex items-start gap-4 mb-5">
                  {/* Update Icon */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-warning-500/10 border border-warning-500/25 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-warning-400 animate-bounce" style={{ animationDuration: '2s' }}>
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </div>

                  {/* Title & subtitle */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-dark-50 leading-tight">
                      Server Update Available
                    </h3>
                    <p className="text-xs text-dark-400 mt-1 leading-snug">
                      A new Palworld server update has been detected on Steam.
                    </p>
                  </div>
                </div>

                {/* Server info card */}
                <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-4 mb-5 space-y-3">
                  {/* Server Name */}
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-dark-500 flex-shrink-0">
                      <rect x="2" y="2" width="20" height="8" rx="2" />
                      <rect x="2" y="14" width="20" height="8" rx="2" />
                      <circle cx="6" cy="6" r="1" fill="currentColor" />
                      <circle cx="6" cy="18" r="1" fill="currentColor" />
                    </svg>
                    <span className="text-xs text-dark-400">Server</span>
                    <span className="text-xs font-semibold text-dark-100 ml-auto truncate max-w-[200px]">{update.serverName}</span>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-dark-700/40" />

                  {/* Current Version */}
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-dark-500 flex-shrink-0">
                      <path d="M12 8v4l3 3" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                    <span className="text-xs text-dark-400">Installed Build</span>
                    <span className="text-xs font-mono font-medium text-error-400 ml-auto">{update.currentVersion}</span>
                  </div>

                  {/* Latest Version */}
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-dark-500 flex-shrink-0">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
                    </svg>
                    <span className="text-xs text-dark-400">Latest Build</span>
                    <span className="text-xs font-mono font-medium text-success-400 ml-auto">{update.latestVersion}</span>
                  </div>

                  {/* Release Time */}
                  {update.releaseTime && update.releaseTime !== 'Unknown' && (
                    <div className="flex items-center gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-dark-500 flex-shrink-0">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span className="text-xs text-dark-400">Released</span>
                      <span className="text-xs font-mono text-dark-300 ml-auto">{update.releaseTime}</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  {/* Update Now — Yellow */}
                  <button
                    onClick={() => handleUpdateNow(update)}
                    disabled={isUpdating}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-warning-600/40 to-warning-500/25 text-warning-300 border border-warning-500/40 hover:from-warning-600/60 hover:to-warning-500/40 hover:border-warning-400/60 hover:text-warning-200 hover:shadow-lg hover:shadow-warning-500/10"
                    id="server-update-now-btn"
                  >
                    {isUpdating ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                        </svg>
                        Updating...
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Update Now
                      </>
                    )}
                  </button>

                  {/* Skip — Blue */}
                  <button
                    onClick={() => handleSkip(update.serverId)}
                    disabled={isUpdating}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-primary-600/30 to-primary-500/15 text-primary-300 border border-primary-500/30 hover:from-primary-600/50 hover:to-primary-500/30 hover:border-primary-400/50 hover:text-primary-200 hover:shadow-lg hover:shadow-primary-500/10"
                    id="server-update-skip-btn"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M5 12h14" />
                      <path d="M12 5l7 7-7 7" />
                    </svg>
                    Skip
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
