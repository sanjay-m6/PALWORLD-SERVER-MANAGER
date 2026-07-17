import { getCurrentWindow } from '@tauri-apps/api/window';
import React, { useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';

const appWindow = getCurrentWindow();

export const TitleBar: React.FC = () => {
  const { appVersion } = useAppStore();
  const [isMaximized, setIsMaximized] = useState(false);

  React.useEffect(() => {
    let unlistenMaximized: (() => void) | undefined;
    let unlistenUnmaximized: (() => void) | undefined;

    appWindow.isMaximized().then(setIsMaximized);

    const setupListeners = async () => {
      try {
        unlistenMaximized = await appWindow.listen('tauri://maximized', () => {
          setIsMaximized(true);
        });
        unlistenUnmaximized = await appWindow.listen('tauri://unmaximized', () => {
          setIsMaximized(false);
        });
      } catch (err) {
        console.error("Failed to listen for window state changes:", err);
      }
    };

    setupListeners();

    return () => {
      if (unlistenMaximized) unlistenMaximized();
      if (unlistenUnmaximized) unlistenUnmaximized();
    };
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = async () => {
    try {
      await appWindow.toggleMaximize();
    } catch (err) {
      console.error("Failed to toggle maximize status:", err);
    }
  };
  const handleClose = () => appWindow.close();

  return (
    <div
      data-tauri-drag-region
      className="relative z-20 flex items-center justify-between h-9 bg-dark-950/80 border-b border-dark-700/30 px-3 select-none"
    >
      {/* Left: App Logo + Title */}
      <div data-tauri-no-drag className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-5 h-5">
          <img src={new URL('../../Asset/pal.png', import.meta.url).href} alt="Logo" className="w-4 h-4 object-contain" />
        </div>
        <span className="text-xs font-semibold text-dark-300 tracking-wider uppercase">
          Palworld Server Manager - v{appVersion || '...'}
        </span>
      </div>

      {/* Right: Window Controls */}
      <div data-tauri-no-drag className="flex items-center gap-0">
        <button
          id="titlebar-minimize"
          onClick={handleMinimize}
          className="flex items-center justify-center w-9 h-9 text-dark-400 hover:text-dark-200 hover:bg-dark-700/50 transition-colors"
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          id="titlebar-maximize"
          onClick={handleMaximize}
          className="flex items-center justify-center w-9 h-9 text-dark-400 hover:text-dark-200 hover:bg-dark-700/50 transition-colors"
          aria-label="Maximize"
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2" y="0" width="8" height="8" />
              <rect x="0" y="2" width="8" height="8" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0" y="0" width="10" height="10" />
            </svg>
          )}
        </button>
        <button
          id="titlebar-close"
          onClick={handleClose}
          className="flex items-center justify-center w-9 h-9 text-dark-400 hover:text-white hover:bg-error-500/80 transition-colors"
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 1l8 8M9 1l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
};
