import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands } from '../../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';

export const CreateServer: React.FC = () => {
  const { setCurrentView, setServers, showNotification, setSelectedServerId, setActiveServerTab } = useAppStore();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPathManuallyEdited, setIsPathManuallyEdited] = useState(false);

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
  });

  useEffect(() => {
    const autoAllocatePorts = async () => {
      try {
        const servers = await tauriCommands.getServers();
        
        let maxGamePort = 8211;
        let maxRconPort = 25575;
        let maxRestPort = 8212;
        
        if (servers.length > 0) {
          servers.forEach((s: any) => {
            if (s.gamePort >= maxGamePort) maxGamePort = s.gamePort + 1;
            if (s.rconPort >= maxRconPort) maxRconPort = s.rconPort + 1;
            if (s.restApiPort >= maxRestPort) maxRestPort = s.restApiPort + 1;
          });
          
          setForm((prev) => ({
            ...prev,
            gamePort: maxGamePort,
            rconPort: maxRconPort,
            restApiPort: maxRestPort,
          }));
        }
      } catch (err) {
        console.error('Failed to query existing servers for port allocation:', err);
      }
    };
    autoAllocatePorts();
  }, []);

  const updateField = (field: string, value: any) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      
      // Auto-update path if not manually edited and we are editing the server name
      if (field === 'name' && !isPathManuallyEdited) {
        const cleanedName = value.replace(/[\\/:*?"<>|]/g, '').trim();
        next.installPath = cleanedName ? `C:\\PalworldServers\\${cleanedName}` : '';
      }
      
      return next;
    });
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
    if (!form.installPath.trim()) {
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
        installPath: form.installPath,
        preset: form.preset,
        gamePort: form.gamePort,
        rconPort: form.rconPort,
        restApiPort: form.restApiPort,
        maxPlayers: form.maxPlayers,
        adminPassword: form.adminPassword,
        serverPassword: form.serverPassword || null,
        isPublic: form.isPublic,
        autoStart: form.autoStart,
      });

      showNotification('success', `Server "${server.name}" created successfully`);

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
            <h1 className="text-xl font-bold text-dark-50">Create New Server</h1>
            <p className="text-xs text-dark-400 mt-0.5">Step {step} of 3</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                  s === step
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
                  className={`flex-1 h-px ${
                    s < step ? 'bg-success-500/40' : 'bg-dark-700/30'
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
              Server Identity
            </h2>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">
                Server Name *
              </label>
              <input
                id="create-server-name"
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="input-field"
                placeholder="My Palworld Server"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">
                Description
              </label>
              <textarea
                id="create-server-description"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                className="input-field resize-none h-20"
                placeholder="A brief description of your server..."
              />
            </div>

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
                Directory where PalServer.exe is or will be installed
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-3">
                Server Preset
              </label>
              <div className="grid grid-cols-1 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => updateField('preset', p.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                      form.preset === p.id
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
            <h2 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">
              Network & Security
            </h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">
                  Game Port
                </label>
                <input
                  id="create-game-port"
                  type="number"
                  value={form.gamePort}
                  onChange={(e) => updateField('gamePort', parseInt(e.target.value))}
                  className="input-field font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">
                  RCON Port
                </label>
                <input
                  id="create-rcon-port"
                  type="number"
                  value={form.rconPort}
                  onChange={(e) => updateField('rconPort', parseInt(e.target.value))}
                  className="input-field font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">
                  REST API Port
                </label>
                <input
                  id="create-rest-port"
                  type="number"
                  value={form.restApiPort}
                  onChange={(e) => updateField('restApiPort', parseInt(e.target.value))}
                  className="input-field font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">
                Max Players (1-32)
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
                Admin Password *
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
                Server Password (optional)
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
                ['Preset', form.preset],
                ['Install Path', form.installPath || '—'],
                ['Game Port', form.gamePort.toString()],
                ['RCON Port', form.rconPort.toString()],
                ['REST API Port', form.restApiPort.toString()],
                ['Max Players', form.maxPlayers.toString()],
                ['Public', form.isPublic ? 'Yes' : 'No'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-dark-700/20">
                  <span className="text-xs text-dark-500">{label}</span>
                  <span className="text-sm text-dark-200 font-mono">{value}</span>
                </div>
              ))}
            </div>

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
                    Creating...
                  </>
                ) : (
                  'Create Server'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
