import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands, APP_VERSION } from '../../lib/tauri';
import { check } from '@tauri-apps/plugin-updater';

export const SettingsView: React.FC = () => {
  const { showNotification } = useAppStore();
  const [minimizedToTray, setMinimizedToTray] = useState(false);
  const [steamcmdPath, setSteamcmdPath] = useState('');
  const [defaultPort, setDefaultPort] = useState(8211);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Windows Startup State ──────────────────────────────────────────────────
  const [startupEnabled, setStartupEnabled] = useState(false);

  // ── Discord Integration State ──────────────────────────────────────────────
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [discordNotifyStart, setDiscordNotifyStart] = useState(true);
  const [discordNotifyStop, setDiscordNotifyStop] = useState(true);
  const [discordNotifyCrash, setDiscordNotifyCrash] = useState(true);
  const [discordNotifyUpdate, setDiscordNotifyUpdate] = useState(true);
  const [testingWebhook, setTestingWebhook] = useState(false);

  // ── Auto-Update State ──────────────────────────────────────────────────────
  const [isAutoUpdateEnabled, setIsAutoUpdateEnabled] = useState(() => {
    try { return localStorage.getItem('palworld_auto_update') === 'true'; } catch { return false; }
  });
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const trayVal = await tauriCommands.getSetting('start_minimized_to_tray');
        setMinimizedToTray(trayVal === 'true');

        const pathVal = await tauriCommands.getSetting('steamcmd_path');
        setSteamcmdPath(pathVal || '');

        const portVal = await tauriCommands.getSetting('default_port');
        setDefaultPort(portVal ? parseInt(portVal) : 8211);

        // Windows Startup
        const startup = await tauriCommands.getStartupEnabled();
        setStartupEnabled(startup);

        // Discord Webhook Settings
        const url = await tauriCommands.getSetting('discord_webhook_url');
        setDiscordWebhookUrl(url || '');

        const notifyStart = await tauriCommands.getSetting('discord_notify_start');
        setDiscordNotifyStart(notifyStart !== 'false');

        const notifyStop = await tauriCommands.getSetting('discord_notify_stop');
        setDiscordNotifyStop(notifyStop !== 'false');

        const notifyCrash = await tauriCommands.getSetting('discord_notify_crash');
        setDiscordNotifyCrash(notifyCrash !== 'false');

        const notifyUpdate = await tauriCommands.getSetting('discord_notify_update');
        setDiscordNotifyUpdate(notifyUpdate !== 'false');
      } catch (e) {
        console.error('Failed to load settings', e);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await tauriCommands.setSetting('start_minimized_to_tray', minimizedToTray ? 'true' : 'false');
      await tauriCommands.setSetting('steamcmd_path', steamcmdPath);
      await tauriCommands.setSetting('default_port', defaultPort.toString());

      // Save startup config
      await tauriCommands.setStartupEnabled(startupEnabled);

      // Save Discord config
      await tauriCommands.setSetting('discord_webhook_url', discordWebhookUrl);
      await tauriCommands.setSetting('discord_notify_start', discordNotifyStart ? 'true' : 'false');
      await tauriCommands.setSetting('discord_notify_stop', discordNotifyStop ? 'true' : 'false');
      await tauriCommands.setSetting('discord_notify_crash', discordNotifyCrash ? 'true' : 'false');
      await tauriCommands.setSetting('discord_notify_update', discordNotifyUpdate ? 'true' : 'false');

      showNotification('success', 'Application settings saved successfully.');
    } catch (e: any) {
      showNotification('error', `Failed to save settings: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const triggerFirewallAllocation = async () => {
    try {
      const servers = await tauriCommands.getServers();
      if (servers.length === 0) {
        showNotification('info', 'No servers found to allocate firewall rules for.');
        return;
      }
      for (const server of servers) {
        await tauriCommands.setupFirewallRules(server.id);
      }
      showNotification('success', 'Windows Defender Firewall rules successfully registered!');
    } catch (e: any) {
      showNotification('error', `Firewall configuration failed: ${e}. Please ensure the app is running with administrator privileges.`);
    }
  };

  // ── Auto-Update Toggle Handler ─────────────────────────────────────────────
  const handleAutoUpdateToggle = useCallback(() => {
    const next = !isAutoUpdateEnabled;
    setIsAutoUpdateEnabled(next);
    try { localStorage.setItem('palworld_auto_update', next ? 'true' : 'false'); } catch { /* noop */ }
  }, [isAutoUpdateEnabled]);

  // ── Manual Update Check (from Settings button) ─────────────────────────────
  const handleCheckForUpdates = useCallback(async () => {
    setCheckingForUpdates(true);
    try {
      const update = await check();
      if (update) {
        showNotification('info', `Update v${update.version} is available! It will be applied based on your update mode.`);
      } else {
        showNotification('success', 'You are running the latest version.');
      }
    } catch (err: any) {
      const errorStr = String(err);
      if (
        errorStr.includes('Could not fetch a valid release JSON') ||
        errorStr.includes('status code 404') ||
        errorStr.includes('404') ||
        errorStr.includes('not found')
      ) {
        showNotification('success', 'You are running the latest version (no releases published on GitHub yet).');
      } else {
        showNotification('error', `Update check failed: ${err}`);
      }
    } finally {
      setCheckingForUpdates(false);
    }
  }, [showNotification]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-dark-400 font-medium">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-transparent p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between pb-4 border-b border-dark-700/30">
        <div>
          <h1 className="text-xl font-bold text-dark-50">Application Settings</h1>
          <p className="text-xs text-dark-400 mt-1">Configure global application behaviors and system features.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-5 py-2 text-xs font-semibold"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* General Settings Card */}
        <div className="bg-dark-900/40 border border-dark-700/30 rounded-xl p-5 space-y-5">
          <h2 className="text-sm font-semibold text-dark-100 flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-primary-400">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            General Configuration
          </h2>

          <div className="space-y-4">
            {/* Start Minimized to Tray */}
            <div className="flex items-center justify-between py-2 border-b border-dark-800/40">
              <div>
                <label className="text-xs text-dark-200 font-semibold block">Minimize to Tray</label>
                <span className="text-[10px] text-dark-400">Hide application to system tray on window close.</span>
              </div>
              <button
                onClick={() => setMinimizedToTray(!minimizedToTray)}
                className={`w-10 h-5 rounded-full transition-all relative ${minimizedToTray
                    ? 'bg-primary-500/30 border border-primary-500/50'
                    : 'bg-dark-700/50 border border-dark-600/30'
                  }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${minimizedToTray ? 'left-5 bg-primary-400' : 'left-0.5 bg-dark-500'
                    }`}
                />
              </button>
            </div>

            {/* Launch on Windows Startup */}
            <div className="flex items-center justify-between py-2 border-b border-dark-800/40">
              <div>
                <label className="text-xs text-dark-200 font-semibold block">Run on PC Startup</label>
                <span className="text-[10px] text-dark-400">Launch Palworld Server Manager automatically when Windows starts.</span>
              </div>
              <button
                onClick={() => setStartupEnabled(!startupEnabled)}
                className={`w-10 h-5 rounded-full transition-all relative ${startupEnabled
                    ? 'bg-primary-500/30 border border-primary-500/50'
                    : 'bg-dark-700/50 border border-dark-600/30'
                  }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${startupEnabled ? 'left-5 bg-primary-400' : 'left-0.5 bg-dark-500'
                    }`}
                />
              </button>
            </div>

            {/* Default Server Port */}
            <div className="space-y-1.5">
              <label className="text-xs text-dark-200 font-semibold block">Default Server Port</label>
              <input
                type="number"
                value={defaultPort}
                onChange={(e) => setDefaultPort(parseInt(e.target.value) || 8211)}
                className="input-field text-xs w-full bg-dark-900/60 border border-dark-700/50"
                placeholder="8211"
              />
              <span className="text-[10px] text-dark-500 block">Default port proposed when creating new server instances.</span>
            </div>

            {/* Custom SteamCMD path */}
            <div className="space-y-1.5">
              <label className="text-xs text-dark-200 font-semibold block">Custom SteamCMD Path (Optional)</label>
              <input
                type="text"
                value={steamcmdPath}
                onChange={(e) => setSteamcmdPath(e.target.value)}
                className="input-field text-xs w-full bg-dark-900/60 border border-dark-700/50"
                placeholder="Leave blank to use default location"
              />
              <span className="text-[10px] text-dark-500 block">Override default steamcmd path if installed elsewhere.</span>
            </div>
          </div>
        </div>

        {/* Windows Defender Firewall Card */}
        <div className="bg-dark-900/40 border border-dark-700/30 rounded-xl p-5 space-y-5">
          <h2 className="text-sm font-semibold text-dark-100 flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-warning-400">
              <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm-1-7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Windows Firewall Automatic Rules
          </h2>

          <div className="space-y-4">
            <p className="text-xs text-dark-300 leading-relaxed">
              Palworld uses <strong className="text-primary-400">UDP Port 8211</strong> (and any custom port you configure) to accept game client connections.
              Our automated system can register appropriate incoming rules on Windows Defender Firewall.
            </p>
            <div className="p-3 bg-dark-950/60 border border-dark-800 rounded-lg text-[11px] text-dark-400 space-y-2">
              <div className="flex items-center gap-1.5 text-warning-400/90 font-medium">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Administrator Rights Required
              </div>
              <p>
                Windows Defender Firewall rule allocation requires administrative access. Please run the Palworld Server Manager as Administrator to allow this command to succeed.
              </p>
            </div>
            <button
              onClick={triggerFirewallAllocation}
              className="w-full bg-warning-600/10 border border-warning-500/20 hover:bg-warning-600/20 text-warning-400 rounded-lg py-2.5 text-xs font-semibold transition-all"
            >
              Allocate and Open Ports in Windows Firewall
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Application Updates Card */}
        <div className="bg-dark-900/40 border border-dark-700/30 rounded-xl p-5 space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-dark-100 flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary-400">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Application Updates
            </h2>

            <div className="space-y-4">
              {/* Auto-Update Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-dark-800/40">
                <div>
                  <label className="text-xs text-dark-200 font-semibold block">Auto-Update Mode</label>
                  <span className="text-[10px] text-dark-400">
                    {isAutoUpdateEnabled
                      ? 'Updates download and install automatically on launch.'
                      : 'You will be notified when an update is available.'}
                  </span>
                </div>
                <button
                  onClick={handleAutoUpdateToggle}
                  className={`w-10 h-5 rounded-full transition-all relative ${isAutoUpdateEnabled
                      ? 'bg-primary-500/30 border border-primary-500/50'
                      : 'bg-dark-700/50 border border-dark-600/30'
                    }`}
                  aria-label="Toggle auto-update mode"
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${isAutoUpdateEnabled ? 'left-5 bg-primary-400' : 'left-0.5 bg-dark-500'
                      }`}
                  />
                </button>
              </div>

              {/* Mode Description */}
              <div className="p-3 bg-dark-950/60 border border-dark-800 rounded-lg text-[11px] text-dark-400 space-y-1.5">
                <div className="flex items-center gap-1.5 text-primary-400/90 font-medium">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  How Updates Work
                </div>
                <p>
                  <strong className="text-dark-300">Auto Mode:</strong> The app silently checks, downloads, and installs updates when launched. A full-screen overlay prevents interaction during installation.
                </p>
                <p>
                  <strong className="text-dark-300">Manual Mode:</strong> A notification banner appears when an update is available. Click to install at your convenience.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 mt-4">
            {/* Check for Updates Button */}
            <button
              onClick={handleCheckForUpdates}
              disabled={checkingForUpdates}
              className="w-full bg-primary-600/10 border border-primary-500/20 hover:bg-primary-600/20 text-primary-400 rounded-lg py-2.5 text-xs font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {checkingForUpdates ? 'Checking...' : 'Check for Updates Now'}
            </button>

            {/* Current Version */}
            <div className="text-center">
              <span className="text-[10px] text-dark-600 font-mono tracking-wider">
                Current Version: v{APP_VERSION}
              </span>
            </div>
          </div>
        </div>

        {/* Discord Webhook Notifications Card */}
        <div className="bg-dark-900/40 border border-dark-700/30 rounded-xl p-5 space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-dark-100 flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5865F2]">
                <rect x="2" y="2" width="20" height="20" rx="4" />
                <path d="M22 6L12 13 2 6" />
              </svg>
              Discord Webhook Alerts
            </h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-dark-200 font-semibold block">Discord Webhook URL</label>
                <input
                  type="text"
                  value={discordWebhookUrl}
                  onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                  className="input-field text-xs w-full bg-dark-900/60 border border-dark-700/50"
                  placeholder="https://discord.com/api/webhooks/..."
                />
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">Notification Triggers</span>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 text-dark-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={discordNotifyStart}
                      onChange={(e) => setDiscordNotifyStart(e.target.checked)}
                      className="rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-0"
                    />
                    <span>Server Start</span>
                  </label>

                  <label className="flex items-center gap-2 text-dark-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={discordNotifyStop}
                      onChange={(e) => setDiscordNotifyStop(e.target.checked)}
                      className="rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-0"
                    />
                    <span>Server Stop</span>
                  </label>

                  <label className="flex items-center gap-2 text-dark-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={discordNotifyCrash}
                      onChange={(e) => setDiscordNotifyCrash(e.target.checked)}
                      className="rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-0"
                    />
                    <span>Server Crash</span>
                  </label>

                  <label className="flex items-center gap-2 text-dark-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={discordNotifyUpdate}
                      onChange={(e) => setDiscordNotifyUpdate(e.target.checked)}
                      className="rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-0"
                    />
                    <span>Server Update</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={async () => {
                setTestingWebhook(true);
                try {
                  const res = await tauriCommands.testDiscordWebhook(discordWebhookUrl);
                  showNotification('success', res);
                } catch (e: any) {
                  showNotification('error', e);
                } finally {
                  setTestingWebhook(false);
                }
              }}
              disabled={testingWebhook || !discordWebhookUrl}
              className="w-full bg-primary-600/10 border border-primary-500/20 hover:bg-primary-600/20 text-primary-400 rounded-lg py-2 text-xs font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {testingWebhook ? 'Sending Test alert...' : 'Send Test Notification'}
            </button>
          </div>
        </div>

        {/* Community & Support Card */}
        <div className="bg-dark-900/40 border border-dark-700/30 rounded-xl p-5 space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-dark-100 flex items-center gap-2">
              <svg viewBox="0 0 127.14 96.36" fill="currentColor" className="w-4 h-4 text-[#5865F2] flex-shrink-0">
                <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.52,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.07,54.65,123.56,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
              </svg>
              Discord Community & Support
            </h2>

            <div className="space-y-4">
              <p className="text-xs text-dark-300 leading-relaxed">
                Join our official Discord server to get help, report issues, and chat with other Palworld server administrators.
              </p>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-dark-400">
                <div className="p-2 bg-dark-950/40 border border-dark-800/60 rounded-lg">
                  <span className="font-semibold text-dark-200 block">💬 General Support</span>
                  Get assistance with setups in <strong className="text-primary-400 font-medium">#server-setup</strong>.
                </div>
                <div className="p-2 bg-dark-950/40 border border-dark-800/60 rounded-lg">
                  <span className="font-semibold text-dark-200 block">🐛 Bug Reports</span>
                  Submit bug reports directly in <strong className="text-primary-400 font-medium">#bug-reports</strong>.
                </div>
                <div className="p-2 bg-dark-950/40 border border-dark-800/60 rounded-lg">
                  <span className="font-semibold text-dark-200 block">💡 Feature Requests</span>
                  Suggest and vote on new features in <strong className="text-primary-400 font-medium">#feature-requests</strong>.
                </div>
                <div className="p-2 bg-dark-950/40 border border-dark-800/60 rounded-lg">
                  <span className="font-semibold text-dark-200 block">🧪 Beta Testing</span>
                  Join <strong className="text-primary-400 font-medium">#beta-testing</strong> to test pre-releases.
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => window.open('https://discord.gg/gSNpPXhecV', '_blank')}
            className="w-full bg-[#5865F2]/10 border border-[#5865F2]/20 hover:bg-[#5865F2]/20 text-[#5865F2] hover:text-[#7289da] rounded-lg py-2.5 text-xs font-semibold transition-all mt-4 flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 127.14 96.36" fill="currentColor" className="w-4 h-4">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.52,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.07,54.65,123.56,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
            </svg>
            <span>Join Discord Server</span>
          </button>
        </div>
      </div>
    </div>
  );
};
