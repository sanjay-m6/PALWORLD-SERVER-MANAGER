import React, { useEffect, useState } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar } from './components/layout/Sidebar';
import { Notification } from './components/ui/Notification';
import { DonationAlert } from './components/ui/DonationAlert';
import { UpdateOverlay } from './components/ui/UpdateOverlay';
import { Dashboard } from './components/views/Dashboard';
import { CreateServer } from './components/views/CreateServer';
import { ServerDetail } from './components/views/ServerDetail';
import { SettingsView } from './components/views/SettingsView';
import { useAppStore } from './stores/useAppStore';
import { setupEventListeners, tauriCommands } from './lib/tauri';

const App: React.FC = () => {
  const { currentView, setServers } = useAppStore();
  const [showSplash, setShowSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);
  const [loaderProgress, setLoaderProgress] = useState(0);

  useEffect(() => {
    // Setup event listeners for server lifecycle and log events
    setupEventListeners();

    // Progress bar animation for splash
    const progressInterval = setInterval(() => {
      setLoaderProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        // Increment faster at first, then slow down
        const diff = Math.max(1, (100 - prev) * 0.15);
        return Math.min(100, prev + diff);
      });
    }, 80);

    // Load initial data
    tauriCommands.getServers()
      .then((data) => {
        setServers(data);
        // Minimum splash duration for a satisfying transition
        setTimeout(() => {
          setLoaderProgress(100);
          setTimeout(() => {
            setSplashFade(true);
            setTimeout(() => setShowSplash(false), 600);
          }, 200);
        }, 1500);
      })
      .catch((err) => {
        console.error(err);
        setTimeout(() => {
          setSplashFade(true);
          setTimeout(() => setShowSplash(false), 600);
        }, 2000);
      });

    return () => clearInterval(progressInterval);
  }, []);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'create-server':
        return <CreateServer />;
      case 'server-detail':
        return <ServerDetail />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-transparent relative">
      {/* Splash Screen / Entry UI */}
      {showSplash && (
        <div
          className={`absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-950 cyber-grid overflow-hidden transition-all select-none ${
            splashFade ? 'animate-splash-fadeout' : ''
          }`}
        >
          {/* Cyberpunk Ambient Lights */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 glow-blob animate-float-slow -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] glow-blob-secondary animate-float-slower translate-x-1/2 translate-y-1/2 rounded-full pointer-events-none" />

          {/* Splash Content Card */}
          <div className="relative flex flex-col items-center max-w-md w-full px-6 text-center z-10">
            {/* Pulsing Breathing Logo */}
            <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
              {/* Outer Cyan Ring */}
              <div className="absolute inset-0 rounded-full border border-primary-500/20 animate-ping opacity-25 scale-125" />
              <div className="absolute inset-2 rounded-full border border-cyan-400/40 animate-pulse opacity-40" />
              {/* Logo Image */}
              <img
                src={new URL('./Asset/pal.png', import.meta.url).href}
                alt="Palworld Logo"
                className="w-24 h-24 object-contain animate-logo-breath z-10"
              />
            </div>

            {/* Glowing Cyberspace Text */}
            <h1 className="text-3xl font-black tracking-widest text-gradient-cyan mb-2">
              PALWORLD
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] text-dark-400 font-semibold mb-8">
              Server Console Manager
            </p>

            {/* Loading Indicator */}
            <div className="w-64 space-y-2">
              <div className="flex justify-between items-center text-[10px] text-dark-500 font-mono tracking-wider">
                <span>INITIALIZING SYSTEM...</span>
                <span>{Math.round(loaderProgress)}%</span>
              </div>
              <div className="relative w-full h-1.5 bg-dark-900 border border-dark-800 rounded-full overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-primary-500 to-cyan-400 rounded-full transition-all duration-300"
                  style={{ width: `${loaderProgress}%` }}
                />
              </div>
            </div>

            {/* Footer hint */}
            <div className="absolute bottom-[-100px] text-[9px] text-dark-600 tracking-widest font-mono">
              SECURE TAURI INSTANCE ACTIVE
            </div>
          </div>
        </div>
      )}

      {/* Custom Title Bar */}
      <TitleBar />

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderView()}
        </main>
      </div>

      {/* Toast Notifications */}
      <Notification />
      <DonationAlert />
      <UpdateOverlay />
    </div>
  );
};

export default App;
