import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands } from '../../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';
import { useI18nStore } from '../../lib/i18n';

export const CreateServer: React.FC = () => {
  const { setCurrentView, setServers, showNotification, setSelectedServerId, setActiveServerTab } = useAppStore();
  const { t } = useI18nStore();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPathManuallyEdited, setIsPathManuallyEdited] = useState(false);
  const [mode, setMode] = useState<'create' | 'import' | 'remote'>('create');

  const [form, setForm] = useState({
    name: '',
    description: '',
    installPath: '',
    preset: 'Balanced',
    gamePort: 8211,
    rconPort: 25575,
    restApiPort: 8212,
    maxPlayers: 32,
    adminPassword: '',
    serverPassword: '',
    isPublic: false,
    autoStart: false,
    host: '127.0.0.1',
  });

  const handleAutoAllocate = async () => {
    try {
      const ports = await tauriCommands.allocatePorts(0);
      setForm((prev) => ({
        ...prev,
        gamePort: ports.gamePort,
        rconPort: ports.rconPort,
        restApiPort: ports.restApiPort,
      }));
    } catch (err) {
      console.error('Failed to allocate ports:', err);
    }
  };

  useEffect(() => {
    handleAutoAllocate();
  }, []);

  const updateField = (field: string, value: any) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      // Auto-update path if not manually edited and we are editing the server name
      if (field === 'name' && !isPathManuallyEdited && mode !== 'remote') {
        const cleanedName = value.replace(/[\\/:*?"<>|]/g, '').trim();
        next.installPath = cleanedName ? `C:\\PalworldServers\\${cleanedName}` : '';
      }

      return next;
    });
  };

  const handleScanFolder = async (path: string) => {
    if (!path) return;
    try {
      const config = await tauriCommands.parseExistingServerConfig(path);
      setForm((prev) => ({
        ...prev,
        name: config.name || prev.name,
        description: config.description || prev.description,
        installPath: config.installPath || prev.installPath,
        gamePort: config.gamePort || prev.gamePort,
        rconPort: config.rconPort || prev.rconPort,
        restApiPort: config.restApiPort || prev.restApiPort,
        maxPlayers: config.maxPlayers || prev.maxPlayers,
        adminPassword: config.adminPassword || prev.adminPassword,
        serverPassword: config.serverPassword || prev.serverPassword || '',
        host: config.publicIp || '127.0.0.1',
      }));
      if (config.installPath && config.installPath !== path) {
        showNotification('info', `Corrected server path to: "${config.installPath}"`);
      }
      showNotification('success', `Found existing settings for server "${config.name}"!`);
    } catch (err: any) {
      console.warn('Failed to parse settings:', err);
      showNotification('info', `Folder selected. No existing settings found, using defaults.`);
    }
  };

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: form.installPath || undefined,
      });
      if (selected && typeof selected === 'string') {
        updateField('installPath', selected);
        setIsPathManuallyEdited(true);
        if (mode === 'import') {
          handleScanFolder(selected);
        }
      }
    } catch (err) {
      console.error('Failed to open directory dialog:', err);
      showNotification('error', 'Failed to open directory dialog');
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      showNotification('error', 'Server name is required');
      return;
    }
    if (mode !== 'remote' && !form.installPath.trim()) {
      showNotification('error', 'Install path is required');
      return;
    }
    if (!form.adminPassword.trim()) {
      showNotification('error', 'Admin password is required for RCON');
      return;
    }

    setIsSubmitting(true);
    try {
      const server = await tauriCommands.createServer({
        name: form.name,
        description: form.description || null,
        installPath: mode === 'remote' ? 'remote' : form.installPath,
        preset: mode === 'remote' ? 'Balanced' : form.preset,
        gamePort: form.gamePort,
        rconPort: form.rconPort,
        restApiPort: form.restApiPort,
        maxPlayers: form.maxPlayers,
        adminPassword: form.adminPassword,
        serverPassword: form.serverPassword || null,
        isPublic: form.isPublic,
        autoStart: mode === 'remote' ? false : form.autoStart,
        host: form.host,
        isRemote: mode === 'remote',
        isImport: mode === 'import',
      });

      showNotification('success', `Server "${server.name}" created successfully`);

      // Auto-configure firewall ports for the new server
      if (mode !== 'remote') {
        try {
          await tauriCommands.openFirewallPorts(
            server.name,
            form.gamePort,
            form.rconPort,
            form.restApiPort
          );
        } catch (fwErr) {
          console.warn('Failed to auto-configure firewall for new server:', fwErr);
        }
      }

      // Refresh and navigate
      const servers = await tauriCommands.getServers();
      setServers(servers);
      setSelectedServerId(server.id);
      setActiveServerTab('overview');
      setCurrentView('server-detail');
    } catch (e: any) {
      showNotification('error', `Failed to create server: ${e}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const presets = [
    { id: 'Casual', label: 'Casual', desc: 'Relaxed gameplay, boosted rates', icon: '🌿' },
    { id: 'Balanced', label: 'Balanced', desc: 'Default Palworld experience', icon: '⚖️' },
    { id: 'PvP', label: 'PvP', desc: 'Player vs Player combat', icon: '⚔️' },
    { id: 'Hardcore', label: 'Hardcore', desc: 'Maximum challenge', icon: '💀' },
    { id: 'Performance', label: 'Performance', desc: 'Optimized for low-spec', icon: '⚡' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="btn-ghost p-2"
            aria-label="Back to dashboard"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-dark-50">{t('createServer.title')}</h1>
            <p className="text-xs text-dark-400 mt-0.5">Step {step} of 3</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${s === step
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/40'
                    : s < step
                      ? 'bg-success-500/20 text-success-400 border border-success-500/40'
                      : 'bg-dark-800 text-dark-500 border border-dark-700/30'
                  }`}
              >
                {s < step ? '✓' : s}
              </div>
              {s < 3 && (
                <div
                  className={`flex-1 h-px ${s < step ? 'bg-success-500/40' : 'bg-dark-700/30'
                    }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="glass-card p-6 space-y-5">
            <h2 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">
              Server Identity & Mode
            </h2>

            {/* Mode Selector */}
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-2">
                Deployment Mode
              </label>
              <div className="grid grid-cols-3 gap-2 bg-dark-900/40 p-1 rounded-lg border border-dark-800/50">
                <button
                  type="button"
                  onClick={() => { setMode('create'); updateField('installPath', form.name ? `C:\\PalworldServers\\${form.name.replace(/[\\/:*?"<>|]/g, '').trim()}` : ''); }}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                    mode === 'create'
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/30'
                  }`}
                >
                  Create New Server
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('import'); updateField('installPath', ''); }}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                    mode === 'import'
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/30'
                  }`}
                >
                  Import Local Server
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('remote'); updateField('installPath', 'remote'); }}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                    mode === 'remote'
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/30'
                  }`}
                >
                  Connect to Remote
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">
                {t('createServer.name')} *
              </label>
              <input
                id="create-server-name"
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="input-field"
                placeholder={mode === 'remote' ? "Remote Server Name" : "My Palworld Server"}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">
                {t('createServer.desc')}
              </label>
              <textarea
                id="create-server-description"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                className="input-field resize-none h-20"
                placeholder="A brief description of your server..."
              />
            </div>

            {mode === 'remote' ? (
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">
                  Remote Host IP / Hostname *
                </label>
                <input
                  id="create-server-host"
                  type="text"
                  value={form.host}
                  onChange={(e) => updateField('host', e.target.value)}
                  className="input-field font-mono text-xs"
                  placeholder="e.g. 12.34.56.78 or mydomain.com"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">
                  Install Path *
                </label>
                <div className="flex gap-2">
                  <input
                    id="create-server-path"
                    type="text"
                    value={form.installPath}
                    onChange={(e) => {
                      updateField('installPath', e.target.value);
                      setIsPathManuallyEdited(true);
                    }}
                    onBlur={() => {
                      if (mode === 'import') {
                        handleScanFolder(form.installPath);
                      }
                    }}
                    className="input-field font-mono text-xs flex-1"
                    placeholder="C:\PalworldServers\Server01"
                  />
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="px-3.5 py-2 bg-dark-800 hover:bg-dark-700 active:bg-dark-600 text-dark-200 hover:text-white rounded-lg border border-dark-700/50 text-xs font-medium transition-all duration-200"
                  >
                    Browse
                  </button>
                </div>
                <p className="text-[10px] text-dark-500 mt-1">
                  {mode === 'import'
                    ? 'Select the folder containing your existing PalServer.exe'
                    : 'Directory where PalServer.exe will be installed'}
                </p>
              </div>
            )}

            {mode === 'create' && (
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-3">
                  Server Preset
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => updateField('preset', p.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${form.preset === p.id
                          ? 'border-primary-500/40 bg-primary-500/10 text-primary-400'
                          : 'border-dark-700/30 bg-dark-800/30 text-dark-300 hover:border-dark-600/50'
                        }`}
                    >
                      <span className="text-lg">{p.icon}</span>
                      <div>
                        <div className="text-sm font-medium">{p.label}</div>
                        <div className="text-[10px] text-dark-500">{p.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => setStep(2)} className="btn-primary">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Network & Security */}
        {step === 2 && (
          <div className="glass-card p-6 space-y-5">
            <div className="flex items-center justify-between pb-1 border-b border-dark-800/40">
              <h2 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">
                Network & Security
              </h2>
              {mode !== 'remote' && (
                <button
                  onClick={handleAutoAllocate}
                  className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-500/25 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95"
                >
                  Auto-Allocate Ports
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">
                  {t('createServer.port')}
                </label>
                <div className="flex gap-2">
                  <input
                    id="create-game-port"
                    type="number"
                    value={form.gamePort}
                    onChange={(e) => updateField('gamePort', parseInt(e.target.value))}
                    className="input-field font-mono flex-1 min-w-0"
                  />
                  {mode !== 'remote' && (
                    <button
                      onClick={async () => {
                        const ports = await tauriCommands.allocatePorts(0);
                        updateField('gamePort', ports.gamePort);
                      }}
                      className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-500/25 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95"
                    >
                      Assign
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">
                  RCON Port
                </label>
                <div className="flex gap-2">
                  <input
                    id="create-rcon-port"
                    type="number"
                    value={form.rconPort}
                    onChange={(e) => updateField('rconPort', parseInt(e.target.value))}
                    className="input-field font-mono flex-1 min-w-0"
                  />
                  {mode !== 'remote' && (
                    <button
                      onClick={async () => {
                        const ports = await tauriCommands.allocatePorts(0);
                        updateField('rconPort', ports.rconPort);
                      }}
                      className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-500/25 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95"
                    >
                      Assign
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">
                  REST API Port
                </label>
                <div className="flex gap-2">
                  <input
                    id="create-rest-port"
                    type="number"
                    value={form.restApiPort}
                    onChange={(e) => updateField('restApiPort', parseInt(e.target.value))}
                    className="input-field font-mono flex-1 min-w-0"
                  />
                  {mode !== 'remote' && (
                    <button
                      onClick={async () => {
                        const ports = await tauriCommands.allocatePorts(0);
                        updateField('restApiPort', ports.restApiPort);
                      }}
                      className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-500/25 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95"
                    >
                      Assign
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">
                {t('createServer.maxPlayers')}
              </label>
              <input
                id="create-max-players"
                type="number"
                min={1}
                max={32}
                value={form.maxPlayers}
                onChange={(e) => updateField('maxPlayers', parseInt(e.target.value))}
                className="input-field w-32"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">
                {t('createServer.adminPassword')} *
              </label>
              <input
                id="create-admin-password"
                type="password"
                value={form.adminPassword}
                onChange={(e) => updateField('adminPassword', e.target.value)}
                className="input-field"
                placeholder="Required for RCON & REST API"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">
                {t('createServer.serverPassword')}
              </label>
              <input
                id="create-server-password"
                type="password"
                value={form.serverPassword}
                onChange={(e) => updateField('serverPassword', e.target.value)}
                className="input-field"
                placeholder="Leave empty for no password"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => updateField('isPublic', e.target.checked)}
                  className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/20"
                />
                <span className="text-sm text-dark-300">Public server</span>
              </label>
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="btn-ghost">
                ← Back
              </button>
              <button onClick={() => setStep(3)} className="btn-primary">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Create */}
        {step === 3 && (
          <div className="glass-card p-6 space-y-5">
            <h2 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">
              Review & Create
            </h2>

            <div className="space-y-3">
              {[
                ['Server Name', form.name || '—'],
                ['Deployment Mode', mode === 'create' ? 'Create New' : mode === 'import' ? 'Import Local' : 'Remote Connection'],
                mode === 'remote' ? ['Remote Host', form.host] : ['Install Path', form.installPath || '—'],
                mode === 'create' ? ['Preset', form.preset] : null,
                ['Game Port', form.gamePort.toString()],
                ['RCON Port', form.rconPort.toString()],
                ['REST API Port', form.restApiPort.toString()],
                ['Max Players', form.maxPlayers.toString()],
                ['Public', form.isPublic ? 'Yes' : 'No'],
              ].filter(Boolean).map(([label, value]: any) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-dark-700/20">
                  <span className="text-xs text-dark-500">{label}</span>
                  <span className="text-sm text-dark-200 font-mono">{value}</span>
                </div>
              ))}
            </div>

            {mode !== 'remote' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoStart}
                  onChange={(e) => updateField('autoStart', e.target.checked)}
                  className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/20"
                />
                <span className="text-sm text-dark-300">
                  Auto-start server when PSM launches
                </span>
              </label>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="btn-ghost">
                ← Back
              </button>
              <button
                onClick={handleCreate}
                disabled={isSubmitting}
                className="btn-success flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  mode === 'remote' ? 'Save Connection' : mode === 'import' ? 'Import Server' : t('createServer.button')
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
