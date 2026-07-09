/**
 * UpdateOverlay.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Production-grade auto-update system for Palworld Server Manager.
 *
 * Provides two update modes controlled by a localStorage toggle:
 *   1. Auto-Update Mode — silently checks, downloads, and installs on boot
 *   2. Manual Mode       — shows a notification banner; user clicks to install
 *
 * When an update is actively downloading/installing, a non-dismissible
 * full-screen glassmorphism overlay locks the entire UI with a spinner
 * and real-time status text. After successful install, the app relaunches.
 *
 * Dependencies:
 *   @tauri-apps/plugin-updater  — check() for update availability
 *   @tauri-apps/plugin-process  — relaunch() after install
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// ─── LocalStorage Key ───────────────────────────────────────────────────────
const AUTO_UPDATE_KEY = 'palworld_auto_update';

/**
 * Reads the auto-update preference from localStorage.
 * Defaults to `false` (manual mode) if not set.
 */
function getAutoUpdatePreference(): boolean {
  try {
    return localStorage.getItem(AUTO_UPDATE_KEY) === 'true';
  } catch {
    return false;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export const UpdateOverlay: React.FC = () => {
  // ── State ──────────────────────────────────────────────────────────────────
  /** Whether the full-screen blocking overlay is visible (download/install in progress) */
  const [isUpdating, setIsUpdating] = useState(false);

  /** Real-time status text displayed inside the overlay */
  const [updateStatusText, setUpdateStatusText] = useState('Checking for updates...');

  /** Whether a pending update was found (used for the manual-mode banner) */
  const [updateAvailable, setUpdateAvailable] = useState(false);

  /** Cached Update object from the updater plugin */
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  /** Read from localStorage on mount */
  const [isAutoUpdateEnabled] = useState(getAutoUpdatePreference);

  /** Download progress percentage (0–100) for the overlay progress bar */
  const [downloadProgress, setDownloadProgress] = useState(0);

  /** Prevent double-invocation of the update check */
  const hasChecked = useRef(false);

  // ── Update Check (runs once on mount) ──────────────────────────────────────
  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    const runUpdateCheck = async () => {
      try {
        const update = await check();

        // No update available — nothing to do
        if (!update) return;

        // Cache the Update object for later use
        setPendingUpdate(update);

        if (isAutoUpdateEnabled) {
          // ── Auto-Update Mode ───────────────────────────────────────────────
          // Immediately begin downloading and installing without user interaction
          await performUpdate(update);
        } else {
          // ── Manual Mode ────────────────────────────────────────────────────
          // Show a non-intrusive banner so the user can trigger it when ready
          setUpdateAvailable(true);
        }
      } catch (err) {
        // Silently swallow check errors (e.g., no internet, no releases).
        // The app should never crash or block because an update check failed.
        console.warn('[Updater] Update check failed:', err);
      }
    };

    // Small delay to let the splash screen finish first
    const timer = setTimeout(runUpdateCheck, 3000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core Update Logic ──────────────────────────────────────────────────────
  const performUpdate = useCallback(async (update: Update) => {
    // Lock the UI immediately
    setIsUpdating(true);
    setUpdateAvailable(false);
    setUpdateStatusText('Preparing update...');
    setDownloadProgress(0);

    try {
      // Begin downloading and installing.
      // The onEvent callback fires progress events we can display.
      let contentLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = (event.data as any)?.contentLength ?? 0;
            setUpdateStatusText('Downloading update...');
            setDownloadProgress(0);
            break;

          case 'Progress':
            downloaded += (event.data as any)?.chunkLength ?? 0;
            if (contentLength > 0) {
              const pct = Math.min(Math.round((downloaded / contentLength) * 100), 100);
              setDownloadProgress(pct);
              setUpdateStatusText(`Downloading update... ${pct}%`);
            } else {
              setUpdateStatusText('Downloading update...');
            }
            break;

          case 'Finished':
            setDownloadProgress(100);
            setUpdateStatusText('Installing update...');
            break;
        }
      });

      // Download + install completed successfully — relaunch the app
      setUpdateStatusText('Restarting application...');

      // Brief pause so the user sees the final status before the window closes
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await relaunch();
    } catch (err) {
      // If the update fails, unlock the UI and log the error.
      // We deliberately do NOT show a noisy error modal — the user can retry
      // from Settings or on next app launch.
      console.error('[Updater] Update failed:', err);
      setIsUpdating(false);
      setUpdateStatusText('');
      setDownloadProgress(0);
    }
  }, []);

  // ── Manual Install Handler ─────────────────────────────────────────────────
  const handleManualInstall = useCallback(() => {
    if (pendingUpdate) {
      performUpdate(pendingUpdate);
    }
  }, [pendingUpdate, performUpdate]);

  // ── Dismiss Banner (user chooses to skip for now) ──────────────────────────
  const handleDismissBanner = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Manual Mode: Update Available Banner ──────────────────────────── */}
      {updateAvailable && !isUpdating && pendingUpdate && (
        <div className="fixed bottom-6 right-6 z-[100] animate-slide-in">
          <div className="bg-dark-900/90 backdrop-blur-lg border border-primary-500/30 rounded-xl p-4 shadow-2xl max-w-sm">
            {/* Ambient glow effect */}
            <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-primary-500/20 to-cyan-400/10 -z-10 blur-sm" />

            {/* Header */}
            <div className="flex items-start gap-3">
              {/* Animated update icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-primary-400 animate-bounce" style={{ animationDuration: '2s' }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-dark-50 leading-tight">
                  Update Available
                </h3>
                <p className="text-[11px] text-dark-400 mt-0.5 leading-snug">
                  Version <span className="text-primary-400 font-semibold">{pendingUpdate.version}</span> is ready to install.
                </p>
              </div>

              {/* Dismiss button */}
              <button
                onClick={handleDismissBanner}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-dark-800/80 text-dark-500 hover:text-dark-300 transition-colors"
                aria-label="Dismiss update notification"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleManualInstall}
                className="flex-1 bg-gradient-to-r from-primary-600/30 to-cyan-500/20 text-primary-400 border border-primary-500/40 hover:from-primary-600/45 hover:to-cyan-500/35 hover:border-primary-400 hover:text-white rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.96]"
              >
                Install Now
              </button>
              <button
                onClick={handleDismissBanner}
                className="px-3 py-2 text-xs font-semibold text-dark-400 hover:text-dark-200 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Full-Screen Blocking Overlay (Active during download/install) ── */}
      {isUpdating && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
          style={{ cursor: 'wait' }}
          // Prevent any keyboard interaction from reaching underlying UI
          onKeyDown={(e) => e.preventDefault()}
          tabIndex={0}
        >
          {/* Glassmorphism backdrop — dark, blurred, non-dismissible */}
          <div className="absolute inset-0 bg-dark-950/85 backdrop-blur-xl" />

          {/* Subtle ambient glow blobs matching splash screen aesthetic */}
          <div className="absolute top-1/3 left-1/3 w-80 h-80 glow-blob animate-float-slow -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none opacity-60" />
          <div className="absolute bottom-1/3 right-1/3 w-96 h-96 glow-blob-secondary animate-float-slower translate-x-1/2 translate-y-1/2 rounded-full pointer-events-none opacity-40" />

          {/* Cyber grid background (matching splash screen) */}
          <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none" />

          {/* ── Content Card ──────────────────────────────────────────────── */}
          <div className="relative z-10 flex flex-col items-center max-w-md w-full px-8">
            {/* Spinner container */}
            <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
              {/* Outer rotating ring */}
              <div
                className="absolute inset-0 rounded-full border-2 border-transparent"
                style={{
                  borderTopColor: 'rgba(0, 217, 255, 0.8)',
                  borderRightColor: 'rgba(0, 217, 255, 0.3)',
                  animation: 'spin 1.2s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite',
                }}
              />
              {/* Middle pulsing ring */}
              <div
                className="absolute inset-2 rounded-full border border-cyan-400/30"
                style={{
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
              {/* Inner glowing ring */}
              <div
                className="absolute inset-4 rounded-full border border-primary-500/20"
                style={{
                  animation: 'spin 2.5s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite reverse',
                }}
              />
              {/* Center icon */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-primary-400 z-10">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>

            {/* Title */}
            <h2 className="text-lg font-black tracking-widest text-gradient-cyan mb-2 uppercase">
              Updating
            </h2>

            {/* Status text */}
            <p className="text-xs text-dark-300 font-medium tracking-wide mb-6 text-center min-h-[1.25rem]">
              {updateStatusText}
            </p>

            {/* Progress bar */}
            <div className="w-64 space-y-2">
              <div className="relative w-full h-1.5 bg-dark-900 border border-dark-800 rounded-full overflow-hidden">
                {downloadProgress > 0 ? (
                  // Determinate progress bar
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-primary-500 to-cyan-400 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                ) : (
                  // Indeterminate shimmer bar
                  <div
                    className="absolute top-0 bottom-0 w-[30%] bg-gradient-to-r from-transparent via-primary-500/80 to-transparent rounded-full animate-progress-loading"
                  />
                )}
              </div>
              {downloadProgress > 0 && (
                <div className="flex justify-between items-center text-[10px] text-dark-500 font-mono tracking-wider">
                  <span>PROGRESS</span>
                  <span>{downloadProgress}%</span>
                </div>
              )}
            </div>

            {/* Warning text */}
            <p className="mt-8 text-[10px] text-dark-600 tracking-widest font-mono text-center uppercase">
              Do not close the application
            </p>
          </div>
        </div>
      )}
    </>
  );
};
