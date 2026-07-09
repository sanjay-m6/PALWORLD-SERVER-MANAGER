import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands } from '../../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';

interface ModItem {
  name: string;
  path: string;
  is_logic_mod: boolean;
  enabled: boolean;
  size_bytes: number;
}

interface ModPerformanceReport {
  name: string;
  ram_usage_mb: number;
  tick_overhead_ms: number;
  load_time_ms: number;
}

interface ModConflict {
  file1: string;
  file2: string;
  conflict_type: string;
  description: string;
}

interface ModSnapshot {
  id: string;
  created_at: string;
  description: string;
  mod_count: number;
}

interface SearchResult {
  name: string;
  title: string;
  description: string;
  author: string;
  downloads: string;
  rating: number;
  category: string;
  compat: string;
  source: string;
  url: string;
  download_url: string | null;
}

export const ModsTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification } = useAppStore();
  const [mods, setMods] = useState<ModItem[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'installed' | 'discover' | 'conflicts' | 'profiler' | 'snapshots'>('installed');
  
  // Loading & Action States
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [isLogicMod, setIsLogicMod] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');

  // UE4SS States
  const [ue4ssInstalled, setUe4ssInstalled] = useState(false);
  const [checkingUe4ss, setCheckingUe4ss] = useState(true);
  const [installingUe4ss, setInstallingUe4ss] = useState(false);

  // Steam Workshop States
  const [workshopId, setWorkshopId] = useState('');
  const [downloadingWorkshop, setDownloadingWorkshop] = useState(false);
  
  // Dynamic backend stats
  const [performanceReports, setPerformanceReports] = useState<ModPerformanceReport[]>([]);
  const [conflicts, setConflicts] = useState<ModConflict[]>([]);
  const [snapshots, setSnapshots] = useState<ModSnapshot[]>([]);
  const [snapshotDescription, setSnapshotDescription] = useState('');
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  
  // Search & API Keys
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);

  const checkUe4ss = async () => {
    try {
      const installed = await tauriCommands.checkUe4ssInstalled(serverId);
      setUe4ssInstalled(installed);
    } catch (e) {
      console.error('Failed to check UE4SS installation state:', e);
    } finally {
      setCheckingUe4ss(false);
    }
  };

  useEffect(() => {
    fetchMods();
    checkUe4ss();
    fetchSecondaryData();
    if (activeSubTab === 'discover' && searchResults.length === 0 && !searching) {
      loadDefaultMods();
    }
  }, [serverId, activeSubTab]);

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const val = await tauriCommands.getSetting('nexus_api_key');
        setApiKey(val || '');
      } catch (e) {
        console.error('Failed to load Nexus API key:', e);
      }
    };
    loadApiKey();
  }, []);

  const loadDefaultMods = async () => {
    setSearching(true);
    try {
      const data = await tauriCommands.searchModsOnline('pal');
      setSearchResults(data);
    } catch (e) {
      console.error('Failed to load default discover mods:', e);
    } finally {
      setSearching(false);
    }
  };

  const fetchMods = async () => {
    setLoading(true);
    try {
      const data = await tauriCommands.listInstalledMods(serverId);
      setMods(data);
    } catch (e) {
      console.error('Failed to fetch mods:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSecondaryData = async () => {
    try {
      if (activeSubTab === 'profiler') {
        const perf = await tauriCommands.getModPerformanceReport(serverId);
        setPerformanceReports(perf);
      } else if (activeSubTab === 'conflicts') {
        const conf = await tauriCommands.checkModConflicts(serverId);
        setConflicts(conf);
      } else if (activeSubTab === 'snapshots') {
        const snaps = await tauriCommands.listModSnapshots(serverId);
        setSnapshots(snaps);
      }
    } catch (err) {
      console.error('Failed fetching mod manager sub data:', err);
    }
  };

  const handleInstallLocal = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Palworld Mod File', extensions: ['pak'] }],
      });

      if (selected && typeof selected === 'string') {
        setInstalling(true);
        await tauriCommands.installMod(serverId, selected, isLogicMod);
        showNotification('success', 'Mod installed successfully!');
        fetchMods();
      }
    } catch (err: any) {
      showNotification('error', `Installation failed: ${err}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleInstallUe4ss = async () => {
    setInstallingUe4ss(true);
    try {
      const res = await tauriCommands.installUe4ss(serverId);
      showNotification('success', res);
      await checkUe4ss();
    } catch (e: any) {
      showNotification('error', `UE4SS installation failed: ${e}`);
    } finally {
      setInstallingUe4ss(false);
    }
  };

  const handleDownloadWorkshop = async () => {
    if (!workshopId.trim()) return;
    setDownloadingWorkshop(true);
    try {
      const res = await tauriCommands.downloadWorkshopMod(serverId, workshopId.trim());
      if (res.success) {
        showNotification('success', res.message);
        setWorkshopId('');
        fetchMods();
      } else {
        showNotification('error', res.message);
      }
    } catch (e: any) {
      showNotification('error', `Workshop download failed: ${e}`);
    } finally {
      setDownloadingWorkshop(false);
    }
  };

  const handleInstallUrl = async (urlToInstall?: string) => {
    const targetUrl = urlToInstall || downloadUrl;
    if (!targetUrl) return;
    setInstalling(true);
    try {
      await tauriCommands.downloadAndInstallModViaUrl(serverId, targetUrl, isLogicMod);
      showNotification('success', 'Mod downloaded and installed successfully!');
      setDownloadUrl('');
      fetchMods();
    } catch (err: any) {
      showNotification('error', `Download installation failed: ${err}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await tauriCommands.searchModsOnline(searchQuery);
      setSearchResults(data);
      if (data.length === 0) {
        showNotification('info', 'No mods found on Nexus Mods or Modrinth.');
      }
    } catch (e: any) {
      showNotification('error', `Search failed: ${e}`);
    } finally {
      setSearching(false);
    }
  };

  const handleSaveApiKey = async () => {
    setSavingApiKey(true);
    try {
      await tauriCommands.setSetting('nexus_api_key', apiKey);
      showNotification('success', 'Nexus Mods API Key saved successfully.');
      loadDefaultMods();
    } catch (e: any) {
      showNotification('error', `Failed to save API Key: ${e}`);
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleInstallDiscoverMod = async (mod: SearchResult) => {
    setInstalling(true);
    try {
      if (mod.source === 'modrinth' && mod.download_url) {
        await tauriCommands.downloadAndInstallModViaUrl(serverId, mod.download_url, isLogicMod);
        showNotification('success', `Installed "${mod.title}" from Modrinth!`);
      } else if (mod.source === 'nexus') {
        if (!apiKey.trim()) {
          showNotification('error', 'Nexus Mods requires an API key. Please configure your key in the settings panel above.');
          setInstalling(false);
          return;
        }
        const modId = parseInt(mod.name.replace('nexus_', '').replace('.pak', ''));
        await tauriCommands.downloadNexusModViaApi(serverId, modId, apiKey, isLogicMod);
        showNotification('success', `Downloaded and installed "${mod.title}" from Nexus Mods!`);
      } else {
        showNotification('error', 'Direct installation not supported for this mod.');
      }
      fetchMods();
    } catch (e: any) {
      showNotification('error', `Mod installation failed: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleToggle = async (mod: ModItem) => {
    try {
      await tauriCommands.toggleMod(serverId, mod.name, mod.is_logic_mod, !mod.enabled);
      showNotification('success', `Mod ${!mod.enabled ? 'enabled' : 'disabled'} successfully.`);
      fetchMods();
    } catch (err: any) {
      showNotification('error', `Failed to toggle mod: ${err}`);
    }
  };

  const handleDelete = async (mod: ModItem) => {
    if (!confirm(`Are you sure you want to delete the mod "${mod.name}"?`)) return;
    try {
      await tauriCommands.deleteMod(serverId, mod.name, mod.is_logic_mod, mod.enabled);
      showNotification('success', 'Mod deleted successfully.');
      fetchMods();
    } catch (err: any) {
      showNotification('error', `Failed to delete mod: ${err}`);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!snapshotDescription) return;
    setCreatingSnapshot(true);
    try {
      await tauriCommands.createModSnapshot(serverId, snapshotDescription);
      showNotification('success', 'Mod snapshot created successfully.');
      setSnapshotDescription('');
      const snaps = await tauriCommands.listModSnapshots(serverId);
      setSnapshots(snaps);
    } catch (err: any) {
      showNotification('error', `Snapshot failed: ${err}`);
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!confirm('Revert to this snapshot? Current mod directories will be completely overwritten.')) return;
    setLoading(true);
    try {
      await tauriCommands.restoreModSnapshot(serverId, snapshotId);
      showNotification('success', 'Mod state reverted successfully.');
      fetchMods();
    } catch (err: any) {
      showNotification('error', `Snapshot restore failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full bg-dark-950/20 text-dark-50">
      {/* Sub tabs navigation */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-dark-700/30 bg-dark-900/10">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveSubTab('installed')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'installed'
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-900/30'
            }`}
          >
            📦 Installed Inventory
          </button>
          <button
            onClick={() => setActiveSubTab('discover')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'discover'
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-900/30'
            }`}
          >
            🔍 Discover Mods
          </button>
          <button
            onClick={() => setActiveSubTab('conflicts')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'conflicts'
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-900/30'
            }`}
          >
            ⚠️ Conflict Scanner
          </button>
          <button
            onClick={() => setActiveSubTab('profiler')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'profiler'
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-900/30'
            }`}
          >
            📊 Performance Profiler
          </button>
          <button
            onClick={() => setActiveSubTab('snapshots')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'snapshots'
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-900/30'
            }`}
          >
            💾 Mod Snapshots
          </button>
        </div>

        {/* Global Manual Options */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-logic-mod-global-chk"
              checked={isLogicMod}
              onChange={(e) => setIsLogicMod(e.target.checked)}
              className="rounded bg-dark-900 border-dark-700 text-primary-500 focus:ring-primary-500"
            />
            <label htmlFor="is-logic-mod-global-chk" className="text-[10px] text-dark-400 font-semibold cursor-pointer">
              Install as Logic/Script Mod
            </label>
          </div>
        </div>
      </div>

      {/* Main Tab Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        
        {/* SUB TAB: INSTALLED MODS */}
        {activeSubTab === 'installed' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-dark-200">Installed Mod Inventory</h3>
                <p className="text-[10px] text-dark-500 mt-0.5">Manage priorities, active states, and parameters for loaded pak assets.</p>
              </div>
              <button
                onClick={handleInstallLocal}
                disabled={installing}
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
              >
                {installing ? (
                  <span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>+ Import Local .pak</span>
                )}
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-dark-400">Scanning server mod folders...</span>
              </div>
            ) : mods.length === 0 ? (
              <div className="glass-card p-10 text-center flex flex-col items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 text-dark-600 mb-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                <p className="text-xs font-semibold text-dark-300">No Mods Installed</p>
                <p className="text-[10px] text-dark-500 max-w-xs mt-1">Check the "Discover Mods" tab to browse trending creations or import local files.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mods.map((mod, idx) => (
                  <div
                    key={mod.name}
                    className={`glass-card p-4 flex items-center justify-between border-l-4 transition-all ${
                      mod.enabled
                        ? 'border-l-primary-500 bg-dark-900/50'
                        : 'border-l-dark-700 bg-dark-950/20 opacity-60'
                    }`}
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-dark-100 truncate block max-w-[220px]">{mod.name}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          mod.is_logic_mod ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20' : 'bg-info-500/10 text-info-400 border border-info-500/20'
                        }`}>
                          {mod.is_logic_mod ? 'Logic' : 'Asset'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-[9px] text-dark-500">
                        <span>Size: {formatBytes(mod.size_bytes)}</span>
                        <span>Priority: #{idx + 1}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggle(mod)}
                        className={`w-10 h-5 rounded-full transition-all relative ${
                          mod.enabled
                            ? 'bg-primary-500/30 border border-primary-500/50'
                            : 'bg-dark-700/50 border border-dark-600/30'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                            mod.enabled ? 'left-5 bg-primary-400' : 'left-0.5 bg-dark-500'
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => handleDelete(mod)}
                        className="p-1 rounded-lg text-dark-500 hover:text-error-400 hover:bg-error-500/10 transition-colors"
                        title="Delete Mod"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SUB TAB: DISCOVER MODS */}
        {activeSubTab === 'discover' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nexus Mods API Key */}
              <div className="glass-card p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Nexus Mods API Key</h4>
                    <a
                      href="https://www.nexusmods.com/users/myaccount?tab=api"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      Get API Key ↗
                    </a>
                  </div>
                  <p className="text-[10px] text-dark-500 mt-1">Needed to download files directly from Nexus Mods.</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="input-field text-xs flex-1 bg-dark-900/60 border-dark-700/50"
                    placeholder="Enter Nexus Mods API Key"
                  />
                  <button
                    onClick={handleSaveApiKey}
                    disabled={savingApiKey}
                    className="btn-primary text-xs px-4"
                  >
                    {savingApiKey ? 'Saving...' : 'Save Key'}
                  </button>
                </div>
              </div>

              {/* UE4SS Framework Status & Installer */}
              <div className="glass-card p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">UE4SS Modding Framework</h4>
                    {checkingUe4ss ? (
                      <span className="text-[9px] text-dark-400">Checking...</span>
                    ) : ue4ssInstalled ? (
                      <span className="text-[9px] text-success-400 font-black bg-success-500/10 px-2 py-0.5 rounded border border-success-500/20 uppercase tracking-wider">🟢 Active / Installed</span>
                    ) : (
                      <span className="text-[9px] text-warning-400 font-black bg-warning-500/10 px-2 py-0.5 rounded border border-warning-500/20 uppercase tracking-wider">⚠️ Missing</span>
                    )}
                  </div>
                  <p className="text-[10px] text-dark-500 mt-1">Required by script/logic mods and LUA overlays. Essential for advanced modding.</p>
                </div>
                <div className="pt-1">
                  <button
                    onClick={handleInstallUe4ss}
                    disabled={installingUe4ss || ue4ssInstalled}
                    className={`w-full text-xs py-2 px-4 rounded-lg font-semibold transition-all ${
                      ue4ssInstalled 
                        ? 'bg-success-600/10 border border-success-500/20 text-success-400 cursor-not-allowed'
                        : 'bg-primary-600/10 border border-primary-500/20 hover:bg-primary-600/20 text-primary-400'
                    }`}
                  >
                    {installingUe4ss ? 'Installing UE4SS Framework...' : ue4ssInstalled ? 'UE4SS is Ready' : 'Install UE4SS Framework'}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Custom URL Downloader */}
              <div className="glass-card p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Install via Direct Download URL</h4>
                  <p className="text-[10px] text-dark-500 mt-1">Download and install any .pak / script archive from a direct URL.</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={downloadUrl}
                    onChange={(e) => setDownloadUrl(e.target.value)}
                    className="input-field text-xs flex-1 bg-dark-900/60 border-dark-700/50"
                    placeholder="https://site.com/mod.pak"
                  />
                  <button
                    onClick={() => handleInstallUrl()}
                    disabled={installing || !downloadUrl}
                    className="btn-primary text-xs px-4"
                  >
                    {installing ? 'Downloading...' : 'Install URL'}
                  </button>
                </div>
              </div>

              {/* Steam Workshop Downloader */}
              <div className="glass-card p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Install Steam Workshop Mod</h4>
                  <p className="text-[10px] text-dark-500 mt-1">Input the Steam Workshop Mod ID to download and auto-extract it.</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={workshopId}
                    onChange={(e) => setWorkshopId(e.target.value)}
                    className="input-field text-xs flex-1 bg-dark-900/60 border-dark-700/50"
                    placeholder="Steam Workshop ID (e.g. 3158021234)"
                  />
                  <button
                    onClick={handleDownloadWorkshop}
                    disabled={downloadingWorkshop || !workshopId.trim()}
                    className="btn-primary text-xs px-4"
                  >
                    {downloadingWorkshop ? 'Installing...' : 'Install Mod'}
                  </button>
                </div>
              </div>
            </div>

            {/* Browser Search & Lists */}
            <div className="flex gap-3 pt-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="input-field text-xs pl-8 w-full"
                  placeholder="Search across Nexus Mods & Modrinth repositories (press Enter)..."
                />
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-dark-500 absolute left-2.5 top-2.5">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
                className="btn-primary text-xs px-5"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {/* Discover Grid */}
            {searching ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-dark-400 text-xs">
                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                <span>Searching repositories in real-time...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 text-dark-500 text-xs">
                {searchQuery ? 'No mods matching query. Press Search to query online APIs.' : 'Enter a query and press Search to look up mods from Nexus Mods and Modrinth.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.map((dmod) => {
                  const alreadyInstalled = mods.some(m => m.name === dmod.name);
                  return (
                    <div key={dmod.url} className="glass-card p-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-dark-100">{dmod.title}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            dmod.source === 'modrinth' ? 'bg-success-500/10 text-success-400 border border-success-500/20' : 'bg-info-500/10 text-info-400 border border-info-500/20'
                          }`}>
                            {dmod.source}
                          </span>
                        </div>
                        <p className="text-[10px] text-dark-400 mt-1 line-clamp-2">{dmod.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-[9px] text-dark-500">
                          <span>Author: {dmod.author}</span>
                          <span>Downloads: {dmod.downloads}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-dark-700/10">
                        <a
                          href={dmod.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[9px] text-primary-400 hover:underline"
                        >
                          View Site Page ↗
                        </a>
                        <button
                          onClick={() => handleInstallDiscoverMod(dmod)}
                          disabled={installing || alreadyInstalled}
                          className={`text-xs py-1 px-3.5 rounded-lg font-semibold transition-all ${
                            alreadyInstalled
                              ? 'bg-success-500/10 text-success-400 border border-success-500/20 cursor-default'
                              : 'btn-primary'
                          }`}
                        >
                          {alreadyInstalled ? '✓ Installed' : installing ? 'Installing...' : 'One-Click Install'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUB TAB: CONFLICTS */}
        {activeSubTab === 'conflicts' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-dark-200">Asset Conflict Scan</h3>
              <p className="text-[10px] text-dark-500 mt-0.5">Scans active .pak structures to locate overlapping resource paths or overriding blueprints.</p>
            </div>

            {conflicts.length === 0 ? (
              <div className="glass-card p-8 text-center flex flex-col items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-success-500 mb-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-semibold text-dark-200">Zero Conflicts Detected</p>
                <p className="text-[10px] text-dark-500 mt-0.5">All currently enabled script files map to unique subsystems.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {conflicts.map((conf, idx) => (
                  <div key={idx} className="glass-card p-4 border-l-4 border-l-error-500 bg-error-500/5 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-error-400">{conf.conflict_type}</span>
                      <span className="text-[9px] text-dark-500">Scan ID: #CONF-{idx}</span>
                    </div>
                    <p className="text-[10px] text-dark-300">{conf.description}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-mono bg-dark-950/40 p-2 rounded border border-dark-700/10">
                      <span className="text-dark-200">{conf.file1}</span>
                      <span className="text-dark-500">🔀</span>
                      <span className="text-dark-200">{conf.file2}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SUB TAB: PROFILER */}
        {activeSubTab === 'profiler' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-dark-200">Mod Impact Analysis</h3>
              <p className="text-[10px] text-dark-500 mt-0.5">Simulated real-time analysis of loaded mod overhead on the dedicated server instance.</p>
            </div>

            {performanceReports.length === 0 ? (
              <div className="text-center py-12 text-dark-500 text-xs">No active mods loaded to profile.</div>
            ) : (
              <div className="space-y-3">
                {performanceReports.map((rep) => (
                  <div key={rep.name} className="glass-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-dark-100">{rep.name}</span>
                      <span className="text-[10px] text-dark-500 font-mono">Status: Active</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                      {/* RAM usage */}
                      <div className="space-y-1 bg-dark-900/40 p-2.5 rounded border border-dark-700/30">
                        <div className="flex justify-between text-[9px]">
                          <span className="text-dark-400 font-semibold">RAM Overhead</span>
                          <span className="text-dark-200 font-bold">{rep.ram_usage_mb.toFixed(1)} MB</span>
                        </div>
                        <div className="w-full bg-dark-950 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-primary-500 h-full rounded-full" style={{ width: `${Math.min((rep.ram_usage_mb / 60) * 100, 100)}%` }} />
                        </div>
                      </div>

                      {/* Tick impact */}
                      <div className="space-y-1 bg-dark-900/40 p-2.5 rounded border border-dark-700/30">
                        <div className="flex justify-between text-[9px]">
                          <span className="text-dark-400 font-semibold">Server Tick Impact</span>
                          <span className="text-dark-200 font-bold">+{rep.tick_overhead_ms.toFixed(2)} ms</span>
                        </div>
                        <div className="w-full bg-dark-950 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-info-500 h-full rounded-full" style={{ width: `${Math.min((rep.tick_overhead_ms / 1.5) * 100, 100)}%` }} />
                        </div>
                      </div>

                      {/* Load time */}
                      <div className="space-y-1 bg-dark-900/40 p-2.5 rounded border border-dark-700/30">
                        <div className="flex justify-between text-[9px]">
                          <span className="text-dark-400 font-semibold">Initialization Delay</span>
                          <span className="text-dark-200 font-bold">{rep.load_time_ms} ms</span>
                        </div>
                        <div className="w-full bg-dark-950 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-warning-500 h-full rounded-full" style={{ width: `${Math.min((rep.load_time_ms / 400) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SUB TAB: SNAPSHOTS */}
        {activeSubTab === 'snapshots' && (
          <div className="space-y-4">
            <div className="glass-card p-4 space-y-3">
              <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Take Complete Mod Snapshot</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={snapshotDescription}
                  onChange={(e) => setSnapshotDescription(e.target.value)}
                  className="input-field text-xs flex-1"
                  placeholder="Enter snapshot description (e.g., Before updating QoL mods)"
                />
                <button
                  onClick={handleCreateSnapshot}
                  disabled={creatingSnapshot || !snapshotDescription}
                  className="btn-primary text-xs px-4"
                >
                  {creatingSnapshot ? 'Saving...' : 'Take Snapshot'}
                </button>
              </div>
            </div>

            {/* List Snapshots */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-dark-200">Historical Snapshots</h4>
              {snapshots.length === 0 ? (
                <div className="text-center py-8 text-dark-500 text-xs">No snapshots taken yet.</div>
              ) : (
                <div className="space-y-2">
                  {snapshots.map((snap) => (
                    <div key={snap.id} className="glass-card p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-dark-100">{snap.description}</span>
                          <span className="text-[8px] bg-dark-750 px-1.5 py-0.5 rounded text-dark-400 font-mono">{snap.id.slice(0, 8)}</span>
                        </div>
                        <div className="flex gap-4 text-[9px] text-dark-500">
                          <span>Captured: {snap.created_at}</span>
                          <span>Mods: {snap.mod_count}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRestoreSnapshot(snap.id)}
                        className="btn-primary text-xs py-1 px-3"
                      >
                        Revert State
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
