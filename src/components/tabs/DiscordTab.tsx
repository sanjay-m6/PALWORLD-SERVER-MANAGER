import React, { useEffect, useState } from 'react';
import { tauriCommands } from '../../lib/tauri';
import { useAppStore } from '../../stores/useAppStore';

interface DiscordTabProps {
  serverId: number;
}

export const DiscordTab: React.FC<DiscordTabProps> = ({ serverId }) => {
  const { showNotification } = useAppStore();
  const [botStatus, setBotStatus] = useState<string>('offline');
  const [globalBotToken, setGlobalBotToken] = useState<string>('');
  
  // Server-specific Discord config
  const [enabled, setEnabled] = useState<boolean>(false);
  const [dashboardChannelId, setDashboardChannelId] = useState<string>('');
  const [dashboardMessageId, setDashboardMessageId] = useState<string>('');
  const [consoleChannelId, setConsoleChannelId] = useState<string>('');
  const [chatChannelId, setChatChannelId] = useState<string>('');
  const [notificationsChannelId, setNotificationsChannelId] = useState<string>('');
  
  // Roles
  const [roleOwnerId, setRoleOwnerId] = useState<string>('');
  const [roleAdminId, setRoleAdminId] = useState<string>('');
  const [roleModeratorId, setRoleModeratorId] = useState<string>('');
  const [roleDeveloperId, setRoleDeveloperId] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testingBot, setTestingBot] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<string>('discord-bot-status-changed', (event) => {
          setBotStatus(event.payload);
        });
      } catch (e) {
        console.error('Failed to register Discord bot status listener', e);
      }
    };

    setupListener();

    const loadConfig = async () => {
      try {
        // Fetch Bot global settings
        const token = await tauriCommands.getSetting('discord_bot_token');
        setGlobalBotToken(token || '');
        if (!token || token.trim() === '') {
          setShowGuide(true);
        }

        const status = await tauriCommands.getDiscordBotStatus();
        setBotStatus(status);

        // Fetch Server-specific Discord config
        const conf = await tauriCommands.getServerDiscordConfig(serverId);
        if (conf) {
          setEnabled(conf.enabled);
          setDashboardChannelId(conf.dashboardChannelId || '');
          setDashboardMessageId(conf.dashboardMessageId || '');
          setConsoleChannelId(conf.consoleChannelId || '');
          setChatChannelId(conf.chatChannelId || '');
          setNotificationsChannelId(conf.notificationsChannelId || '');
          setRoleOwnerId(conf.roleOwnerId || '');
          setRoleAdminId(conf.roleAdminId || '');
          setRoleModeratorId(conf.roleModeratorId || '');
          setRoleDeveloperId(conf.roleDeveloperId || '');
        }
      } catch (e) {
        console.error('Failed to load Discord configs', e);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();

    // Fallback polling interval (relaxed to 15s to minimize backend queries)
    const interval = setInterval(async () => {
      const status = await tauriCommands.getDiscordBotStatus();
      setBotStatus(status);
    }, 15000);

    return () => {
      clearInterval(interval);
      if (unlisten) unlisten();
    };
  }, [serverId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save global bot token first
      await tauriCommands.setSetting('discord_bot_token', globalBotToken);

      // Save server specific settings
      await tauriCommands.saveServerDiscordConfig({
        serverId,
        enabled,
        dashboardChannelId,
        dashboardMessageId,
        consoleChannelId,
        chatChannelId,
        notificationsChannelId,
        roleOwnerId,
        roleAdminId,
        roleModeratorId,
        roleDeveloperId,
      });

      showNotification('success', 'Discord configurations saved successfully.');
    } catch (e: any) {
      showNotification('error', `Failed to save configurations: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBot = async () => {
    const isOnline = botStatus === 'online';
    try {
      if (!globalBotToken.trim()) {
        showNotification('error', 'Please configure a Discord Bot Token first.');
        return;
      }
      // Save token before toggling
      await tauriCommands.setSetting('discord_bot_token', globalBotToken);
      
      setBotStatus(isOnline ? 'stopping...' : 'starting...');
      await tauriCommands.toggleDiscordBot(!isOnline);
      showNotification('success', `Discord bot is now ${!isOnline ? 'starting...' : 'stopping...'}`);
    } catch (e: any) {
      setBotStatus(isOnline ? 'online' : 'offline');
      showNotification('error', `Action failed: ${e}`);
    }
  };

  const handleForceRefresh = async () => {
    setTesting(true);
    try {
      await tauriCommands.forceRefreshDiscordDashboard(serverId);
      showNotification('success', 'Dashboard update triggered successfully.');
    } catch (e: any) {
      showNotification('error', `Failed to refresh dashboard: ${e}`);
    } finally {
      setTesting(false);
    }
  };

  const handleTestBotConnection = async () => {
    setTestingBot(true);
    try {
      const res = await tauriCommands.testDiscordBotConnection(serverId);
      showNotification('success', res);
    } catch (e: any) {
      showNotification('error', `Test connection failed: ${e}`);
    } finally {
      setTestingBot(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-dark-400">Loading Discord integration settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar max-w-5xl mx-auto w-full px-4 pb-6">
      
      {/* Real-time Status and Top Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-dark-900/40 border border-dark-800/80 rounded-xl p-5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                botStatus === 'online' 
                  ? 'bg-emerald-400' 
                  : botStatus.includes('...') 
                  ? 'bg-amber-400' 
                  : 'bg-rose-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                botStatus === 'online' 
                  ? 'bg-emerald-500' 
                  : botStatus.includes('...') 
                  ? 'bg-amber-500' 
                  : 'bg-rose-500'
              }`}></span>
            </span>
            <div>
              <span className="text-xs font-bold text-dark-100 uppercase tracking-wider block">DISCORD BOT INTEGRATION</span>
              <p className="text-[9px] text-dark-400">Manage and monitor bot status in real-time</p>
            </div>
          </div>
          <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full border transition-all duration-300 ${
            botStatus === 'online' 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
              : botStatus.includes('...')
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            {botStatus}
          </span>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Test Connection Button */}
          <button
            onClick={handleTestBotConnection}
            disabled={testingBot || botStatus !== 'online'}
            className="px-4 py-2 border border-dark-700 hover:border-dark-600 bg-dark-800/40 hover:bg-dark-800 disabled:opacity-40 disabled:hover:bg-dark-800/40 disabled:hover:border-dark-700 text-dark-200 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1.5"
            title={botStatus !== 'online' ? "Start the bot first to test connection" : "Send a test notification to Event Alerts channel"}
          >
            {testingBot ? (
              <>
                <svg className="animate-spin h-3 w-3 text-dark-200" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Testing...</span>
              </>
            ) : (
              <span>🧪 Test Connection</span>
            )}
          </button>
          
          {/* Toggle Bot Button */}
          <button
            onClick={handleToggleBot}
            disabled={botStatus.includes('...')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-1.5 ${
              botStatus === 'online'
                ? 'bg-rose-600/10 hover:bg-rose-600/20 border-rose-500/30 text-rose-400'
                : 'bg-primary-600/10 hover:bg-primary-600/20 border-primary-500/30 text-primary-400'
            }`}
          >
            {botStatus.includes('...') ? (
              <>
                <svg className="animate-spin h-3 w-3 text-current inline-block" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{botStatus === 'online' ? 'Stopping...' : 'Starting...'}</span>
              </>
            ) : botStatus === 'online' ? (
              <span>■ Stop Bot</span>
            ) : (
              <span>▶ Start Bot</span>
            )}
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-500 active:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 shadow-md shadow-primary-900/10"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-3 w-3 text-white inline-block" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              <span>💾 Save Settings</span>
            )}
          </button>
        </div>
      </div>

      {/* Interactive Setup Guide Toggle */}
      <div className="bg-dark-900/40 border border-dark-800/80 rounded-xl p-4 transition-all duration-300">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-primary-400 animate-pulse">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <div>
              <span className="text-xs font-bold text-dark-200 uppercase tracking-wider">Discord Integration & Bot Setup Guide</span>
              <p className="text-[9px] text-dark-400">Click to {showGuide ? 'hide' : 'show'} step-by-step setup instructions</p>
            </div>
          </div>
          <span className="text-xs text-dark-400 font-mono transition-transform duration-300">
            {showGuide ? '▼' : '▶'}
          </span>
        </button>

        {showGuide && (
          <div className="mt-4 pt-3 border-t border-dark-800/50 text-[11px] text-dark-300 space-y-3 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="font-semibold text-primary-400">1. Create a Discord Bot</p>
                <ul className="list-disc pl-4 space-y-1 text-dark-400">
                  <li>Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-primary-450 hover:text-primary-300 hover:underline inline-flex items-center gap-0.5 transition-colors">Discord Developer Portal <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 inline"><path d="M12.232 4.232a2.5 2.5 0 013.536 0l1.225 1.224a2.5 2.5 0 010 3.536l-1.224 1.225a.75.75 0 11-1.061-1.06l1.224-1.225a1 1 0 000-1.415l-1.225-1.225a1 1 0 00-1.414 0l-1.225 1.225a.75.75 0 01-1.06-1.061l1.225-1.225z"/><path d="M13.524 5.346a.75.75 0 01.056 1.058l-6.25 7a.75.75 0 11-1.12-1l6.25-7a.75.75 0 011.058-.058z"/><path d="M4.232 7.768a2.5 2.5 0 010-3.536l1.225-1.224a.75.75 0 011.061 1.06L5.293 5.293a1 1 0 000 1.415l1.225 1.225a.75.75 0 11-1.06 1.06l-1.225-1.224z"/></svg></a>.</li>
                  <li>Click <strong>New Application</strong> and give it a name.</li>
                  <li>Go to the <strong>Bot</strong> tab, click <strong>Reset Token</strong>, and copy the new Bot Token.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-primary-400">2. Enable Message Intents</p>
                <ul className="list-disc pl-4 space-y-1 text-dark-400">
                  <li>Inside your Application settings, stay in the <strong>Bot</strong> tab.</li>
                  <li>Scroll down to the <strong>Privileged Gateway Intents</strong> section.</li>
                  <li>Toggle ON the <strong>Message Content Intent</strong> and save changes.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-primary-400">3. Invite Bot to Server</p>
                <ul className="list-disc pl-4 space-y-1 text-dark-400">
                  <li>Go to the <strong>OAuth2</strong> tab, then select the <strong>URL Generator</strong> sub-menu.</li>
                  <li>Under Scopes, check <code>bot</code> and <code>applications.commands</code>.</li>
                  <li>Under Bot Permissions, check <code>Administrator</code> or necessary text/embed permissions.</li>
                  <li>Copy the generated URL at the bottom, paste it into your browser, and authorize it.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-primary-400">4. Find Discord Channel & Role IDs</p>
                <ul className="list-disc pl-4 space-y-1 text-dark-400">
                  <li>Open Discord client {"→"} <strong>User Settings</strong> {"→"} <strong>Advanced</strong>.</li>
                  <li>Enable <strong>Developer Mode</strong>.</li>
                  <li>Right-click any text channel or server role and click <strong>Copy ID</strong>.</li>
                </ul>
              </div>
            </div>

            {/* Slash Commands Reference List */}
            <div className="mt-4 pt-3 border-t border-dark-800/50 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-semibold text-primary-400">🤖 Available Discord Slash Commands</p>
                <span className="text-[10px] bg-primary-500/10 border border-primary-500/20 text-primary-400 font-bold px-2.5 py-0.5 rounded-full">
                  This Server's ID: <strong className="font-mono text-xs text-white ml-1">{serverId}</strong>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-dark-400 font-mono text-[10px]">
                <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-800/40">
                  <span className="text-primary-400 font-bold">/status</span>
                  <p className="text-dark-500 mt-0.5 font-sans leading-normal">Check live status of all servers.</p>
                </div>
                <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-800/40">
                  <span className="text-primary-400 font-bold">/players</span>
                  <p className="text-dark-500 mt-0.5 font-sans leading-normal">List players currently online via RCON.</p>
                </div>
                <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-800/40">
                  <span className="text-primary-400 font-bold">/dashboard {"<id>"}</span>
                  <p className="text-dark-500 mt-0.5 font-sans leading-normal">Post live dashboard in current channel.</p>
                </div>
                <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-800/40">
                  <span className="text-primary-400 font-bold">/start {"<id>"}</span>
                  <p className="text-dark-500 mt-0.5 font-sans leading-normal">Start specified server instance locally.</p>
                </div>
                <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-800/40">
                  <span className="text-primary-400 font-bold">/stop {"<id>"}</span>
                  <p className="text-dark-500 mt-0.5 font-sans leading-normal">Stop specified server instance locally.</p>
                </div>
                <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-800/40">
                  <span className="text-primary-400 font-bold">/restart {"<id>"}</span>
                  <p className="text-dark-500 mt-0.5 font-sans leading-normal">Restart specified server instance.</p>
                </div>
                <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-800/40">
                  <span className="text-primary-400 font-bold">/save {"<id>"}</span>
                  <p className="text-dark-500 mt-0.5 font-sans leading-normal">Save world progress to disk.</p>
                </div>
                <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-800/40">
                  <span className="text-primary-400 font-bold">/backup {"<id>"}</span>
                  <p className="text-dark-500 mt-0.5 font-sans leading-normal">Trigger automatic world backup.</p>
                </div>
                <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-800/40">
                  <span className="text-primary-400 font-bold">/broadcast {"<id>"} {"<msg>"}</span>
                  <p className="text-dark-500 mt-0.5 font-sans leading-normal">Send broadcast alerts to players.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bot Connection Card */}
      <div className="bg-dark-900/40 border border-dark-800/80 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-dark-800/50 pb-3">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 127.14 96.36" fill="currentColor" className="w-5 h-5 text-[#5865F2]">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.52,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.07,54.65,123.56,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
            </svg>
            <div>
              <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wide">Discord Bot Settings</h2>
              <p className="text-[10px] text-dark-400">Configure global bot settings and token</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${
              botStatus === 'online' 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {botStatus}
            </span>
            <button
              onClick={handleToggleBot}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                botStatus === 'online'
                  ? 'bg-rose-600/10 hover:bg-rose-600/20 border-rose-500/30 text-rose-400'
                  : 'bg-primary-600/10 hover:bg-primary-600/20 border-primary-500/30 text-primary-400'
              }`}
            >
              {botStatus === 'online' ? 'Stop Bot' : 'Start Bot'}
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-dark-200 font-semibold block">Discord Bot Token</label>
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary-400 hover:text-primary-300 hover:underline flex items-center gap-1 transition-colors"
            >
              <span>Discord Developer Portal</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h4a.75.75 0 010 1.5h-4z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M12.5 2.25a.75.75 0 01.75-.75h5a.75.75 0 01.75.75v5a.75.75 0 01-1.5 0V3.81L11.78 9.53a.75.75 0 11-1.06-1.06L16.19 3H13.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
          <input
            type="password"
            value={globalBotToken}
            onChange={(e) => setGlobalBotToken(e.target.value)}
            className="input-field text-xs w-full bg-dark-950/60 border border-dark-700/40 focus:border-primary-500"
            placeholder="Paste your Discord Application Bot Token here..."
          />
          <span className="text-[10px] text-dark-500 block">
            Make sure to enable <strong>Message Content Intent</strong> inside the Discord Developer Portal under Bot settings.
          </span>
        </div>
      </div>

      {/* Server Admin & Synchronization Card */}
      <div className="bg-dark-900/40 border border-dark-800/80 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-dark-800/50 pb-3">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wide">Server Administration Bridge</h2>
              <p className="text-[10px] text-dark-400">Map Discord channels to this server profile</p>
            </div>
            <span className="text-[10px] bg-primary-500/10 border border-primary-500/20 text-primary-400 font-bold px-2 py-0.5 rounded-full font-mono">
              Server ID: {serverId}
            </span>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`w-10 h-5 rounded-full transition-all relative ${
              enabled ? 'bg-primary-500/30 border border-primary-500/50' : 'bg-dark-700/50 border border-dark-600/30'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${enabled ? 'left-5 bg-primary-400' : 'left-0.5 bg-dark-500'}`} />
          </button>
        </div>

        {enabled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Dashboard Channel ID */}
            <div className="space-y-1.5">
              <label className="text-xs text-dark-200 font-semibold flex items-center justify-between">
                <span>Dashboard Channel ID</span>
                {dashboardMessageId && (
                  <span className="text-[9px] text-dark-500 font-mono">Msg ID: {dashboardMessageId.slice(0, 8)}...</span>
                )}
              </label>
              <input
                type="text"
                value={dashboardChannelId}
                onChange={(e) => setDashboardChannelId(e.target.value)}
                className="input-field text-xs w-full bg-dark-950/60 border border-dark-700/40"
                placeholder="E.g. 122453678912345678"
              />
              <span className="text-[9px] text-dark-500 block">Sends a persistent status embed with interactive buttons.</span>
            </div>

            {/* Console Channel ID */}
            <div className="space-y-1.5">
              <label className="text-xs text-dark-200 font-semibold block">Console Stream Channel ID</label>
              <input
                type="text"
                value={consoleChannelId}
                onChange={(e) => setConsoleChannelId(e.target.value)}
                className="input-field text-xs w-full bg-dark-950/60 border border-dark-700/40"
                placeholder="E.g. 122453678912345678"
              />
              <span className="text-[9px] text-dark-500 block">Streams live game server logs in real-time batches.</span>
            </div>

            {/* Chat Channel ID */}
            <div className="space-y-1.5">
              <label className="text-xs text-dark-200 font-semibold block">Chat Bridge Channel ID</label>
              <input
                type="text"
                value={chatChannelId}
                onChange={(e) => setChatChannelId(e.target.value)}
                className="input-field text-xs w-full bg-dark-950/60 border border-dark-700/40"
                placeholder="E.g. 122453678912345678"
              />
              <span className="text-[9px] text-dark-500 block">Bridges Discord chat to in-game server Broadcast.</span>
            </div>

            {/* Notifications Channel ID */}
            <div className="space-y-1.5">
              <label className="text-xs text-dark-200 font-semibold block">Event Alerts Channel ID</label>
              <input
                type="text"
                value={notificationsChannelId}
                onChange={(e) => setNotificationsChannelId(e.target.value)}
                className="input-field text-xs w-full bg-dark-950/60 border border-dark-700/40"
                placeholder="E.g. 122453678912345678"
              />
              <span className="text-[9px] text-dark-500 block">Receives start/stop alerts, crash logs, and backup logs.</span>
            </div>
            
          </div>
        )}
      </div>

      {/* Role-Based Permissions Mapping */}
      {enabled && (
        <div className="bg-dark-900/40 border border-dark-800/80 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wide">Role Command Permissions</h2>
            <p className="text-[10px] text-dark-400">Map Discord Role IDs to manager access levels (leave blank to allow all)</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-dark-300 uppercase tracking-wide">Owner Role ID</label>
              <input
                type="text"
                value={roleOwnerId}
                onChange={(e) => setRoleOwnerId(e.target.value)}
                className="input-field text-xs w-full bg-dark-950/60 border border-dark-700/40 font-mono"
                placeholder="Role ID"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-dark-300 uppercase tracking-wide">Admin Role ID</label>
              <input
                type="text"
                value={roleAdminId}
                onChange={(e) => setRoleAdminId(e.target.value)}
                className="input-field text-xs w-full bg-dark-950/60 border border-dark-700/40 font-mono"
                placeholder="Role ID"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-dark-300 uppercase tracking-wide">Moderator Role ID</label>
              <input
                type="text"
                value={roleModeratorId}
                onChange={(e) => setRoleModeratorId(e.target.value)}
                className="input-field text-xs w-full bg-dark-950/60 border border-dark-700/40 font-mono"
                placeholder="Role ID"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-dark-300 uppercase tracking-wide">Developer Role ID</label>
              <input
                type="text"
                value={roleDeveloperId}
                onChange={(e) => setRoleDeveloperId(e.target.value)}
                className="input-field text-xs w-full bg-dark-950/60 border border-dark-700/40 font-mono"
                placeholder="Role ID"
              />
            </div>
          </div>
        </div>
      )}

      {/* Form Controls */}
      <div className="flex items-center justify-between border-t border-dark-800/60 pt-4">
        {enabled && botStatus === 'online' ? (
          <button
            onClick={handleForceRefresh}
            disabled={testing || !dashboardChannelId}
            className="px-4 py-2 border border-dark-700 hover:border-dark-600 bg-dark-800/40 hover:bg-dark-800 text-dark-200 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50"
          >
            {testing ? 'Refreshing...' : '🔄 Force Dashboard Update'}
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleTestBotConnection}
            disabled={testingBot || botStatus !== 'online'}
            className="px-4 py-2 border border-dark-700 hover:border-dark-600 bg-dark-800/40 hover:bg-dark-800 disabled:opacity-40 disabled:hover:bg-dark-800/40 disabled:hover:border-dark-700 text-dark-200 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1.5"
            title={botStatus !== 'online' ? "Start the bot first to test connection" : "Send a test notification to Event Alerts channel"}
          >
            {testingBot ? 'Testing...' : '🧪 Test Connection'}
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 shadow-md shadow-primary-900/10"
          >
            {saving ? 'Saving...' : 'Save Configurations'}
          </button>
        </div>
      </div>

    </div>
  );
};
