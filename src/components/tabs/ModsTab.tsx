import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands } from '../../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';
import { RunningPal } from '../ui/RunningPal';
import { useI18nStore } from '../../lib/i18n';

interface ModItem {
  name: string;
  path: string;
  is_logic_mod: boolean;
  enabled: boolean;
  size_bytes: number;
  is_workshop_mod?: boolean;
  author?: string;
  version?: string;
  workshop_id?: string;
  display_name?: string;
}



interface SearchResult {
  name: string;
  title: string;
  description: string;
  summary: string;
  author: string;
  downloads: string;
  rating: number;
  category: string;
  compat: string;
  source: string;
  url: string;
  download_url: string | null;
  picture_url: string | null;
  workshop_id?: string | null;
}

const formatNumber = (numStr: string) => {
  const num = parseInt(numStr);
  if (isNaN(num)) return numStr;
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'k';
  }
  return num.toString();
};

const RichDescriptionRenderer: React.FC<{ text: string; source: string }> = ({ text, source }) => {
  if (!text) return null;

  const parseText = (content: string) => {
    let html = content;

    // Decode HTML entities
    html = html
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    if (source === 'nexus') {
      html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
      html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>');
      html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>');
      html = html.replace(/\[color=(#[0-9a-fA-F]+|[a-zA-Z]+)\]([\s\S]*?)\[\/color\]/gi, '<span style="color: $1">$2</span>');
      html = html.replace(/\[size=(\d+)\]([\s\S]*?)\[\/size\]/gi, (_match, size, inner) => {
        const sizeMap: Record<string, string> = {
          '1': '0.75rem',
          '2': '0.875rem',
          '3': '1rem',
          '4': '1.125rem',
          '5': '1.25rem',
          '6': '1.5rem',
          '7': '1.875rem',
        };
        const fs = sizeMap[size] || `${parseInt(size) * 0.2 + 0.8}rem`;
        return `<span style="font-size: ${fs}">${inner}</span>`;
      });
      html = html.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, '<ul class="list-disc pl-5 space-y-1 my-2">$1</ul>');
      html = html.replace(/\[\*\](.*?)(\n|<br\s*\/?>|$)/gi, '<li>$1</li>');
      html = html.replace(/\[url=(.*?)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary-400 hover:underline hover:text-primary-300 transition-colors">$2</a>');
      html = html.replace(/\[url\](.*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary-400 hover:underline hover:text-primary-300 transition-colors">$1</a>');
      html = html.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote class="border-l-4 border-dark-600 bg-dark-900/40 px-3 py-1.5 my-2 rounded font-mono text-[10px] text-dark-300">$1</blockquote>');
      html = html.replace(/\[\/?[a-zA-Z0-9=_\-#]+\]/g, '');
      html = html.replace(/\r?\n/g, '<br />');
    } else {
      html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*([\s\S]*?)\*/g, '<em>$1</em>');
      html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-400 hover:underline hover:text-primary-300 transition-colors">$1</a>');
      html = html.replace(/^### (.*?)$/gm, '<h5 class="text-xs font-bold text-dark-100 mt-3 mb-1">$1</h5>');
      html = html.replace(/^## (.*?)$/gm, '<h4 class="text-sm font-bold text-dark-100 mt-4 mb-2">$1</h4>');
      html = html.replace(/^# (.*?)$/gm, '<h3 class="text-base font-black text-dark-100 mt-5 mb-2 border-b border-dark-800 pb-1">$1</h3>');
      html = html.replace(/^\s*-\s*(.*?)$/gm, '<li class="ml-4 list-disc">$1</li>');
      html = html.replace(/^\s*\*\s*(.*?)$/gm, '<li class="ml-4 list-disc">$1</li>');
      html = html.replace(/\r?\n/g, '<br />');
    }

    return html;
  };

  return (
    <div 
      className="text-[11px] leading-relaxed text-dark-300 select-text overflow-y-auto max-h-[350px] pr-2 space-y-2 border border-dark-800/30 bg-dark-950/30 p-4 rounded-xl"
      dangerouslySetInnerHTML={{ __html: parseText(text) }}
    />
  );
};

interface ModDetailsModalProps {
  mod: SearchResult;
  onClose: () => void;
  isLogicMod: boolean;
  setIsLogicMod: (val: boolean) => void;
  ue4ssInstalled: boolean;
  handleInstallUe4ss: () => Promise<void>;
  installingUe4ss: boolean;
  handleInstallDiscoverMod: (mod: SearchResult) => Promise<void>;
  installing: boolean;
  alreadyInstalled: boolean;
  handleInstallLocal: (isLogicOverride?: boolean) => Promise<void>;
}

const ModDetailsModal: React.FC<ModDetailsModalProps> = ({
  mod,
  onClose,
  isLogicMod,
  setIsLogicMod,
  ue4ssInstalled,
  handleInstallUe4ss,
  installingUe4ss,
  handleInstallDiscoverMod,
  installing,
  alreadyInstalled,
  handleInstallLocal,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'guide'>('overview');

  return (
    <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-850 bg-dark-950/40">
          <div className="flex items-center gap-3">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
              mod.source === 'modrinth' ? 'bg-success-500/10 text-success-400 border border-success-500/20' : 'bg-info-500/10 text-info-400 border border-info-500/20'
            }`}>
              {mod.source}
            </span>
            <h3 className="text-sm font-bold text-dark-100 truncate max-w-[400px]">{mod.title}</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-dark-500 hover:text-dark-200 hover:bg-dark-850 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Banner/Visual Info */}
          <div className="flex flex-col sm:flex-row gap-4 bg-dark-950/20 p-4 rounded-xl border border-dark-850/50">
            {mod.picture_url && (
              <img 
                src={mod.picture_url} 
                alt={mod.title} 
                className="w-full sm:w-32 h-24 object-cover rounded-lg border border-dark-800 flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0 space-y-2 flex flex-col justify-between">
              <div>
                <p className="text-[10px] text-dark-400 font-medium line-clamp-3 leading-relaxed">{mod.summary}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[9px] text-dark-500 pt-2 border-t border-dark-850/50">
                <div>Author: <span className="text-dark-300 font-semibold">{mod.author}</span></div>
                <div>Downloads: <span className="text-dark-300 font-semibold">{parseInt(mod.downloads).toLocaleString()}</span></div>
                <div>Category: <span className="text-dark-300 font-semibold">{mod.category || 'Game Mod'}</span></div>
                <div>Compatibility: <span className="text-dark-300 font-semibold">{mod.compat}</span></div>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-dark-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'overview'
                  ? 'border-primary-500 text-primary-400 bg-primary-500/5'
                  : 'border-transparent text-dark-400 hover:text-dark-200'
              }`}
            >
              📋 Description & Overview
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'guide'
                  ? 'border-primary-500 text-primary-400 bg-primary-500/5'
                  : 'border-transparent text-dark-400 hover:text-dark-200'
              }`}
            >
              🔧 Installation & Server Guide
            </button>
          </div>

          {/* Active Tab View */}
          <div className="mt-2">
            {activeTab === 'overview' ? (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-dark-200 uppercase tracking-wider">Mod Overview</h4>
                <RichDescriptionRenderer text={mod.description} source={mod.source} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-dark-950/40 p-4 rounded-xl border border-dark-850/60 space-y-3">
                  <h4 className="text-xs font-bold text-dark-200 uppercase tracking-wider flex items-center gap-1.5">
                    ⚙️ Installation Parameters
                  </h4>
                  
                  {/* Mod type selection inside modal */}
                  <div className="flex items-center justify-between bg-dark-900/60 p-2.5 rounded-lg border border-dark-800">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-dark-300">Mod Class</span>
                      <p className="text-[8px] text-dark-500">Configure how the manager installs this file.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is-logic-mod-modal-chk"
                        checked={isLogicMod}
                        onChange={(e) => setIsLogicMod(e.target.checked)}
                        className="rounded bg-dark-950 border-dark-800 text-primary-500 focus:ring-primary-500"
                      />
                      <label htmlFor="is-logic-mod-modal-chk" className="text-[10px] text-dark-300 font-semibold cursor-pointer">
                        Install as Logic/Script Mod
                      </label>
                    </div>
                  </div>

                  {/* Instructions depending on Mod Type */}
                  <div className="text-[10px] leading-relaxed text-dark-300 space-y-3">
                    {/* Free Account Manual Guide */}
                    {mod.source === 'nexus' && (
                      <div className="p-3 rounded-xl bg-primary-500/5 border border-primary-500/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-primary-400 uppercase tracking-wider flex items-center gap-1.5">
                            ℹ️ Free Account Manual Guide
                          </span>
                          <a
                            href={mod.url + "?tab=files"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] font-bold text-primary-400 hover:underline flex items-center gap-0.5"
                          >
                            <span>Open Files Page</span>
                            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                            </svg>
                          </a>
                        </div>
                        <p className="text-[9px] text-dark-400 leading-normal">
                          Nexus Mods limits direct API downloads to Premium accounts. If you have a free account:
                        </p>
                        <ol className="list-decimal pl-4 text-[9px] text-dark-300 space-y-1">
                          <li>Click <strong>Open Files Page</strong> to go to this mod's files tab.</li>
                          <li>Click <strong>Manual Download</strong> on the main file, then click <strong>Slow Download</strong>.</li>
                          <li>Once the file downloads, click the <strong>Import Downloaded File</strong> button below to install it.</li>
                        </ol>
                        <div className="pt-1.5 flex justify-end">
                          <button
                            onClick={async () => {
                              await handleInstallLocal(isLogicMod);
                              onClose();
                            }}
                            className="px-2.5 py-1 bg-primary-600/20 hover:bg-primary-600/30 text-primary-300 rounded border border-primary-500/20 text-[9px] font-bold transition-all flex items-center gap-1"
                          >
                            <span>Import Downloaded File (.zip / .pak)</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {isLogicMod ? (
                      <div className="space-y-2">
                        <div className="p-2.5 rounded-lg bg-warning-500/5 border border-warning-500/10 flex items-start gap-2">
                          <span className="text-warning-400 mt-0.5">⚠️</span>
                          <div className="space-y-1">
                            <span className="font-bold text-warning-400">Requires Modding Framework</span>
                            <p className="text-[9px] text-dark-400">
                              LUA script mods and advanced assets require the UE4SS framework to load on the server.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-dark-900/40 border border-dark-800">
                          <span className="font-medium text-dark-300">UE4SS Status:</span>
                          {ue4ssInstalled ? (
                            <span className="text-[9px] font-bold text-success-400 bg-success-500/10 px-2 py-0.5 rounded border border-success-500/20 uppercase">🟢 Installed / Active</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-warning-400 bg-warning-500/10 px-2 py-0.5 rounded border border-warning-500/20 uppercase">🔴 Missing</span>
                              <button
                                onClick={handleInstallUe4ss}
                                disabled={installingUe4ss}
                                className="px-2 py-1 bg-primary-600 hover:bg-primary-500 text-white rounded text-[8px] font-bold transition-all"
                              >
                                {installingUe4ss ? 'Installing...' : 'Install UE4SS'}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold text-dark-200">Server Installation Path:</span>
                          <code className="block p-1.5 rounded bg-dark-950 font-mono text-[9px] text-primary-400 border border-dark-850">
                            /Pal/Content/Paks/LogicMods/
                          </code>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="p-2.5 rounded-lg bg-success-500/5 border border-success-500/10 flex items-start gap-2">
                          <span className="text-success-400 mt-0.5">🟢</span>
                          <div className="space-y-1">
                            <span className="font-bold text-success-400">Standard Asset Mod</span>
                            <p className="text-[9px] text-dark-400">
                              This is a standard `.pak` graphic or gameplay asset. It runs natively without extra frameworks.
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold text-dark-200">Server Installation Path:</span>
                          <code className="block p-1.5 rounded bg-dark-950 font-mono text-[9px] text-primary-400 border border-dark-850">
                            /Pal/Content/Paks/
                          </code>
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-1 pt-1.5 border-t border-dark-800/60">
                      <span className="font-bold text-dark-200">Manager Automation Details:</span>
                      <p className="text-[9px] text-dark-400 leading-normal">
                        When you click **One-Click Install**, the Server Manager will automatically fetch the mod files from the API, unzip the archive, clean directory structure, map `.pak` and config files to the correct server directories, and configure loading indices automatically.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-dark-850 bg-dark-950/40">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-dark-700/50 text-dark-300 hover:text-dark-100 hover:bg-dark-800 rounded-lg text-xs font-semibold transition-all"
          >
            Close Details
          </button>
          
          <div className="flex items-center gap-3">
            <a
              href={mod.url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-primary-400 hover:underline mr-2"
            >
              View on Website ↗
            </a>
            {mod.source === 'nexus' && (
              <button
                onClick={async () => {
                  await handleInstallLocal(isLogicMod);
                  onClose();
                }}
                className="text-xs py-2 px-4 rounded-lg font-semibold border border-dark-700/60 text-dark-300 hover:text-dark-100 hover:bg-dark-800 transition-all"
              >
                Import Downloaded File
              </button>
            )}
            <button
              onClick={async () => {
                await handleInstallDiscoverMod(mod);
                onClose();
              }}
              disabled={installing || alreadyInstalled}
              className={`text-xs py-2 px-5 rounded-lg font-semibold transition-all ${
                alreadyInstalled
                  ? 'bg-success-600/10 text-success-400 border border-success-500/20 cursor-default'
                  : 'btn-primary'
              }`}
            >
              {alreadyInstalled ? '✓ Installed on Server' : installing ? 'Installing...' : 'One-Click Install'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ModsTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification } = useAppStore();
  const { t } = useI18nStore();
  const [mods, setMods] = useState<ModItem[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'installed' | 'discover' | 'browser' | 'config'>('installed');
  
  // Ini Config Editor States
  const [iniContent, setIniContent] = useState('');
  const [loadingIni, setLoadingIni] = useState(false);
  const [savingIni, setSavingIni] = useState(false);
  
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
  

  
  // Search & API Keys
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [steamApiKey, setSteamApiKey] = useState('');
  const [savingSteamApiKey, setSavingSteamApiKey] = useState(false);
  const [curseForgeApiKey, setCurseForgeApiKey] = useState('');
  const [savingCurseForgeApiKey, setSavingCurseForgeApiKey] = useState(false);
  const [selectedModForDetails, setSelectedModForDetails] = useState<SearchResult | null>(null);
  const [showPremiumWarning, setShowPremiumWarning] = useState<SearchResult | null>(null);
  const [showSteamWorkshopWarning, setShowSteamWorkshopWarning] = useState<SearchResult | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState<SearchResult | null>(null);
  const [installingModUrl, setInstallingModUrl] = useState<string | null>(null);

  // File Browser States
  const [selectedBrowserMod, setSelectedBrowserMod] = useState<ModItem | null>(null);
  const [browserModFiles, setBrowserModFiles] = useState<string[]>([]);
  const [loadingBrowserFiles, setLoadingBrowserFiles] = useState(false);

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
    if (activeSubTab === 'discover' && searchResults.length === 0 && !searching) {
      loadDefaultMods();
    }
    if (activeSubTab === 'config') {
      loadIniContent();
    }
  }, [serverId, activeSubTab]);

  useEffect(() => {
    const loadApiKeys = async () => {
      try {
        const nexusVal = await tauriCommands.getSetting('nexus_api_key');
        setApiKey(nexusVal || '');
        const steamVal = await tauriCommands.getSetting('steam_api_key');
        setSteamApiKey(steamVal || '');
        const cfVal = await tauriCommands.getSetting('curseforge_api_key');
        setCurseForgeApiKey(cfVal || '');
      } catch (e) {
        console.error('Failed to load API keys:', e);
      }
    };
    loadApiKeys();
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

  const loadIniContent = async () => {
    setLoadingIni(true);
    try {
      // @ts-ignore
      const content = await tauriCommands.readPalModSettings(serverId);
      setIniContent(content);
    } catch (e) {
      console.error('Failed to load PalModSettings.ini:', e);
      showNotification('error', 'Failed to load PalModSettings.ini');
    } finally {
      setLoadingIni(false);
    }
  };

  const handleSaveIni = async () => {
    setSavingIni(true);
    try {
      // @ts-ignore
      await tauriCommands.savePalModSettings(serverId, iniContent);
      showNotification('success', 'PalModSettings.ini saved successfully!');
    } catch (e) {
      showNotification('error', `Failed to save PalModSettings.ini: ${e}`);
    } finally {
      setSavingIni(false);
    }
  };



  const handleInstallLocal = async (isLogicOverride?: boolean) => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Palworld Mod File', extensions: ['pak', 'zip'] }],
      });

      if (selected && typeof selected === 'string') {
        setInstalling(true);
        const targetIsLogic = isLogicOverride !== undefined ? isLogicOverride : isLogicMod;
        await tauriCommands.installMod(serverId, selected, targetIsLogic);
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
      const res = await tauriCommands.downloadWorkshopMod(serverId, workshopId.trim(), undefined, isLogicMod);
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

  const handleSaveSteamApiKey = async () => {
    setSavingSteamApiKey(true);
    try {
      await tauriCommands.setSetting('steam_api_key', steamApiKey);
      showNotification('success', 'Steam Web API Key saved successfully.');
      loadDefaultMods();
    } catch (e: any) {
      showNotification('error', `Failed to save Steam API Key: ${e}`);
    } finally {
      setSavingSteamApiKey(false);
    }
  };

  const handleSaveCurseForgeApiKey = async () => {
    setSavingCurseForgeApiKey(true);
    try {
      await tauriCommands.setSetting('curseforge_api_key', curseForgeApiKey);
      showNotification('success', 'CurseForge API Key saved successfully.');
      loadDefaultMods();
    } catch (e: any) {
      showNotification('error', `Failed to save CurseForge API Key: ${e}`);
    } finally {
      setSavingCurseForgeApiKey(false);
    }
  };

  const handleInstallDiscoverMod = async (mod: SearchResult) => {
    setInstallingModUrl(mod.url);
    setInstalling(true);
    try {
      if (mod.source === 'modrinth' && mod.download_url) {
        await tauriCommands.downloadAndInstallModViaUrl(serverId, mod.download_url, isLogicMod);
        setShowSuccessModal(mod);
      } else if (mod.source === 'nexus') {
        if (!apiKey.trim()) {
          showNotification('error', 'Nexus Mods requires an API key. Please configure your key in the settings panel above.');
          setInstalling(false);
          setInstallingModUrl(null);
          return;
        }
        const modId = parseInt(mod.name.replace('nexus_', '').replace('.pak', ''));
        await tauriCommands.downloadNexusModViaApi(serverId, modId, apiKey, isLogicMod);
        setShowSuccessModal(mod);
      } else if (mod.source === 'steam' && mod.workshop_id) {
        const res = await tauriCommands.downloadWorkshopMod(serverId, mod.workshop_id, mod.title, isLogicMod);
        if (res.success) {
          setShowSuccessModal(mod);
        } else {
          setShowSteamWorkshopWarning(mod);
        }
      } else if (mod.source === 'curseforge') {
        if (!curseForgeApiKey.trim()) {
          showNotification('error', 'CurseForge requires an API key. Please configure your key in the settings panel above.');
          setInstalling(false);
          setInstallingModUrl(null);
          return;
        }
        const modId = parseInt(mod.download_url || '0');
        if (modId === 0) {
          showNotification('error', 'Invalid CurseForge Mod ID.');
          setInstalling(false);
          setInstallingModUrl(null);
          return;
        }
        await tauriCommands.downloadCurseForgeModViaApi(serverId, modId, curseForgeApiKey, isLogicMod);
        setShowSuccessModal(mod);
      } else {
        showNotification('error', 'Direct installation not supported for this mod.');
      }
      fetchMods();
    } catch (e: any) {
      const errorMsg = e?.toString() || '';
      if (errorMsg.toLowerCase().includes('premium') || errorMsg.toLowerCase().includes('permission')) {
        setShowPremiumWarning(mod);
      } else if (mod.source === 'steam') {
        setShowSteamWorkshopWarning(mod);
      } else {
        showNotification('error', `Mod installation failed: ${e}`);
      }
    } finally {
      setInstalling(false);
      setInstallingModUrl(null);
    }
  };

  const handleSelectBrowserMod = async (mod: ModItem) => {
    setSelectedBrowserMod(mod);
    setLoadingBrowserFiles(true);
    try {
      const files = await tauriCommands.getModFiles(mod.path);
      setBrowserModFiles(files);
    } catch (e: any) {
      showNotification('error', `Failed to read mod files: ${e}`);
      setBrowserModFiles([]);
    } finally {
      setLoadingBrowserFiles(false);
    }
  };

  const handleToggle = async (mod: ModItem) => {
    try {
      await tauriCommands.toggleMod(serverId, mod.name, mod.is_logic_mod, !mod.enabled, mod.is_workshop_mod);
      showNotification('success', `Mod ${!mod.enabled ? 'enabled' : 'disabled'} successfully.`);
      fetchMods();
    } catch (err: any) {
      showNotification('error', `Failed to toggle mod: ${err}`);
    }
  };

  const handleDelete = async (mod: ModItem) => {
    if (!confirm(`Are you sure you want to delete the mod "${mod.name}"?`)) return;
    try {
      await tauriCommands.deleteMod(serverId, mod.name, mod.is_logic_mod, mod.enabled, mod.is_workshop_mod);
      showNotification('success', 'Mod deleted successfully.');
      fetchMods();
    } catch (err: any) {
      showNotification('error', `Failed to delete mod: ${err}`);
    }
  };



  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const matchingMod = workshopId.trim()
    ? mods.find(m => (m.workshop_id && m.workshop_id === workshopId.trim()) || m.name.includes(workshopId.trim()))
    : null;

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
            📦 {t('mods.installedInventory')}
          </button>
          <button
            onClick={() => setActiveSubTab('browser')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'browser'
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-900/30'
            }`}
          >
            📁 {t('mods.fileBrowser')}
          </button>
          <button
            onClick={() => setActiveSubTab('discover')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'discover'
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-900/30'
            }`}
          >
            🔍 {t('mods.discoverMods')}
          </button>
          <button
            onClick={() => setActiveSubTab('config')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'config'
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-900/30'
            }`}
          >
            ⚙️ {t('mods.configEditor')}
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
                onClick={() => handleInstallLocal()}
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
              <div className="flex flex-col items-center justify-center py-12">
                <RunningPal size={72} label="Scanning server mod folders..." />
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-dark-100 truncate block max-w-[220px]" title={mod.display_name || mod.name}>
                          {mod.display_name || mod.name}
                        </span>
                        {mod.is_workshop_mod ? (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase bg-success-500/10 text-success-400 border border-success-500/20">
                            Workshop Mod
                          </span>
                        ) : (
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            mod.is_logic_mod ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20' : 'bg-info-500/10 text-info-400 border border-info-500/20'
                          }`}>
                            {mod.is_logic_mod ? 'Logic' : 'Asset'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-[9px] text-dark-500 flex-wrap">
                        <span>Size: {formatBytes(mod.size_bytes)}</span>
                        <span>Priority: #{idx + 1}</span>
                        {mod.version && <span>Version: {mod.version}</span>}
                        {mod.author && <span>Author: {mod.author}</span>}
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

        {/* SUB TAB: MOD FILE BROWSER */}
        {activeSubTab === 'browser' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-180px)] min-h-[400px]">
            {/* Left side: list of installed mods */}
            <div className="lg:col-span-1 glass-card p-4 flex flex-col h-full overflow-hidden">
              <div className="mb-3">
                <h3 className="text-xs font-bold text-dark-200 uppercase tracking-wider">Installed Mods</h3>
                <p className="text-[10px] text-dark-500 mt-0.5">Select a mod to browse its internal files.</p>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {mods.length === 0 ? (
                  <div className="text-center py-8 text-dark-500 text-[11px] italic">
                    No mods installed.
                  </div>
                ) : (
                  mods.map((mod) => {
                    const isSelected = selectedBrowserMod?.name === mod.name;
                    return (
                      <button
                        key={mod.name}
                        onClick={() => handleSelectBrowserMod(mod)}
                        className={`w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-1 focus:outline-none ${
                          isSelected
                            ? 'bg-primary-500/15 border-primary-500/50 shadow-md shadow-primary-500/5'
                            : 'bg-dark-900/40 border-dark-800/40 hover:bg-dark-900/60 hover:border-dark-700/50'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className={`text-xs font-bold truncate ${isSelected ? 'text-primary-300' : 'text-dark-100'}`}>
                            {mod.display_name || mod.name}
                          </span>
                          <span className={`text-[7px] font-extrabold px-1 py-0.5 rounded tracking-wider uppercase flex-shrink-0 ${
                            mod.is_workshop_mod
                              ? 'bg-success-500/10 text-success-400 border border-success-500/20'
                              : mod.is_logic_mod
                              ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                              : 'bg-info-500/10 text-info-400 border border-info-500/20'
                          }`}>
                            {mod.is_workshop_mod ? 'Workshop' : mod.is_logic_mod ? 'Logic' : 'Asset'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-dark-500">
                          <span>Size: {formatBytes(mod.size_bytes)}</span>
                          {mod.version && <span>v{mod.version}</span>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right side: file explorer */}
            <div className="lg:col-span-2 glass-card p-4 flex flex-col h-full overflow-hidden">
              {selectedBrowserMod ? (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="mb-3 border-b border-dark-800/50 pb-2.5 flex items-center justify-between flex-shrink-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-dark-100">{selectedBrowserMod.display_name || selectedBrowserMod.name}</h3>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          selectedBrowserMod.is_workshop_mod
                            ? 'bg-success-500/10 text-success-400 border border-success-500/20'
                            : selectedBrowserMod.is_logic_mod
                            ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                            : 'bg-info-500/10 text-info-400 border border-info-500/20'
                        }`}>
                          {selectedBrowserMod.is_workshop_mod ? 'Workshop Mod' : selectedBrowserMod.is_logic_mod ? 'Logic Mod' : 'Asset Mod'}
                        </span>
                      </div>
                      <p className="text-[9px] text-dark-500 font-mono mt-1 break-all bg-dark-950/30 p-1 rounded border border-dark-900">
                        Path: {selectedBrowserMod.path}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loadingBrowserFiles ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <svg className="animate-spin h-6 w-6 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-xs text-dark-400">Scanning directory contents...</span>
                      </div>
                    ) : browserModFiles.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-dark-600 mb-2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.008 1.24l.885 1.77a2.25 2.25 0 002.007 1.24h1.98a2.25 2.25 0 002.007-1.24l.885-1.77a2.25 2.25 0 012.007-1.24h3.86m-18 0h18" />
                        </svg>
                        <p className="text-xs font-semibold text-dark-400">Folder is empty</p>
                        <p className="text-[10px] text-dark-500">No files were found in this mod path.</p>
                      </div>
                    ) : (
                      <div className="space-y-1 pr-2">
                        {browserModFiles.map((file, fIdx) => (
                          <div
                            key={fIdx}
                            className="flex items-center justify-between px-3 py-2 text-[10px] hover:bg-dark-900/30 rounded-lg transition-colors border border-transparent hover:border-dark-800/40 text-dark-300"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-dark-500 flex-shrink-0">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 2h4v2H6V6z" clipRule="evenodd" />
                              </svg>
                              <span className="font-mono truncate" title={file}>{file}</span>
                            </div>
                            <span className="text-[8px] font-mono text-dark-500 flex-shrink-0 uppercase bg-dark-900 px-1 py-0.5 rounded ml-2">
                              {file.split('.').pop() || 'file'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 text-dark-600 mb-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                  </svg>
                  <h4 className="text-xs font-bold text-dark-300">No Mod Selected</h4>
                  <p className="text-[10px] text-dark-500 mt-1 max-w-xs">
                    Choose any installed mod from the list on the left to scan and view its directory structure.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB TAB: DISCOVER MODS */}
        {activeSubTab === 'discover' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Steam Web API Key */}
              <div className="glass-card p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Steam Web API Key</h4>
                    <a
                      href="https://steamcommunity.com/dev/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      Get Key ↗
                    </a>
                  </div>
                  <p className="text-[10px] text-dark-500 mt-1">Needed to search and browse Steam Workshop mods.</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    type="password"
                    value={steamApiKey}
                    onChange={(e) => setSteamApiKey(e.target.value)}
                    className="input-field text-xs flex-1 bg-dark-900/60 border-dark-700/50"
                    placeholder="Enter Steam API Key"
                  />
                  <button
                    onClick={handleSaveSteamApiKey}
                    disabled={savingSteamApiKey}
                    className="btn-primary text-xs px-4"
                  >
                    {savingSteamApiKey ? 'Saving...' : 'Save Key'}
                  </button>
                </div>
              </div>

              {/* CurseForge API Key */}
              <div className="glass-card p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">CurseForge API Key</h4>
                    <a
                      href="https://console.curseforge.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      Get Key ↗
                    </a>
                  </div>
                  <p className="text-[10px] text-dark-500 mt-1">Needed to search and install CurseForge mods.</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    type="password"
                    value={curseForgeApiKey}
                    onChange={(e) => setCurseForgeApiKey(e.target.value)}
                    className="input-field text-xs flex-1 bg-dark-900/60 border-dark-700/50"
                    placeholder="Enter CurseForge API Key"
                  />
                  <button
                    onClick={handleSaveCurseForgeApiKey}
                    disabled={savingCurseForgeApiKey}
                    className="btn-primary text-xs px-4"
                  >
                    {savingCurseForgeApiKey ? 'Saving...' : 'Save Key'}
                  </button>
                </div>
              </div>

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
                      Get Key ↗
                    </a>
                  </div>
                  <p className="text-[10px] text-dark-500 mt-1">Needed to search and install Nexus Mods.</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="input-field text-xs flex-1 bg-dark-900/60 border-dark-700/50"
                    placeholder="Enter Nexus API Key"
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
                    <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">UE4SS Framework</h4>
                    {checkingUe4ss ? (
                      <span className="text-[9px] text-dark-400">Checking...</span>
                    ) : ue4ssInstalled ? (
                      <span className="text-[9px] text-success-400 font-black bg-success-500/10 px-2 py-0.5 rounded border border-success-500/20 uppercase tracking-wider">🟢 Active</span>
                    ) : (
                      <span className="text-[9px] text-warning-400 font-black bg-warning-500/10 px-2 py-0.5 rounded border border-warning-500/20 uppercase tracking-wider">⚠️ Missing</span>
                    )}
                  </div>
                  <p className="text-[10px] text-dark-500 mt-1">Required by logic/script mods and LUA overlays.</p>
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
                    {installingUe4ss ? 'Installing UE4SS...' : ue4ssInstalled ? 'UE4SS is Ready' : 'Install UE4SS Framework'}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
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
                  {matchingMod && (
                    <div className="text-[10px] text-success-400 font-bold flex items-center gap-1.5 bg-success-500/5 border border-success-500/10 px-2 py-1 rounded">
                      <span>✓ Already Installed:</span>
                      <span className="truncate max-w-[140px] font-mono">{matchingMod.display_name || matchingMod.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Import Local Mod File */}
              <div className="glass-card p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Import Local Mod File</h4>
                  <p className="text-[10px] text-dark-500 mt-1">Select and install a manually downloaded mod from your computer.</p>
                </div>
                <div className="pt-1">
                  <button
                    onClick={() => handleInstallLocal(isLogicMod)}
                    disabled={installing}
                    className="w-full btn-primary text-xs py-2 px-4 rounded-lg font-semibold"
                  >
                    {installing ? 'Importing...' : 'Import Downloaded File (.zip / .pak)'}
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
              <div className="flex flex-col items-center justify-center py-10">
                <RunningPal size={64} label="Searching repositories..." />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 text-dark-500 text-xs">
                {searchQuery ? 'No mods matching query. Press Search to query online APIs.' : 'Enter a query and press Search to look up mods from Nexus Mods and Modrinth.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.map((dmod) => {
                  const alreadyInstalled = mods.some(m => {
                    if (dmod.source === 'steam' && dmod.workshop_id) {
                      return (m.is_workshop_mod && m.workshop_id === dmod.workshop_id) || m.name.includes(dmod.workshop_id);
                    }
                    return m.name === dmod.name;
                  });
                  return (
                    <div key={dmod.url} className="glass-card p-4 flex gap-4 items-start justify-between hover:bg-dark-900/40 hover:border-dark-600/50 hover:shadow-lg hover:shadow-primary-500/5 hover:-translate-y-0.5 transition-all duration-300 group">
                      {dmod.picture_url && (
                        <div className="w-20 h-16 rounded-lg overflow-hidden border border-dark-700/30 flex-shrink-0 cursor-pointer group-hover:border-primary-500/30 transition-all duration-300">
                          <img 
                            src={dmod.picture_url} 
                            alt={dmod.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onClick={() => setSelectedModForDetails(dmod)}
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 flex flex-col justify-between h-full min-h-[64px]">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span 
                              className="text-xs font-bold text-dark-100 truncate cursor-pointer hover:text-primary-400 group-hover:text-primary-300 transition-colors duration-200"
                              onClick={() => setSelectedModForDetails(dmod)}
                            >
                              {dmod.title}
                            </span>
                            <span className={`text-[7px] font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase flex-shrink-0 ${
                              dmod.source === 'modrinth' 
                                ? 'bg-success-500/10 text-success-400 border border-success-500/20' 
                                : dmod.source === 'nexus'
                                ? 'bg-info-500/10 text-info-400 border border-info-500/20'
                                : dmod.source === 'steam'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-warning-500/10 text-warning-400 border border-warning-500/20'
                            }`}>
                              {dmod.source === 'steam' ? 'Steam' : dmod.source === 'curseforge' ? 'CurseForge' : dmod.source === 'nexus' ? 'Nexus' : dmod.source}
                            </span>
                          </div>
                          <p 
                            className="text-[10px] text-dark-400 mt-1 line-clamp-2 cursor-pointer group-hover:text-dark-300 transition-colors duration-200 leading-normal"
                            onClick={() => setSelectedModForDetails(dmod)}
                          >
                            {dmod.summary}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-[9px] text-dark-500">
                            <span className="flex items-center gap-1 font-medium group-hover:text-dark-400 transition-colors duration-200">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-dark-500 flex-shrink-0">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                              {dmod.author}
                            </span>
                            <span className="flex items-center gap-1 font-medium group-hover:text-dark-400 transition-colors duration-200">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-dark-500 flex-shrink-0">
                                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                              {formatNumber(dmod.downloads)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-dark-800/40">
                          <div className="flex items-center gap-3.5">
                            <a
                              href={dmod.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[9px] font-semibold text-primary-400 hover:text-primary-300 flex items-center gap-0.5 transition-colors"
                            >
                              <span>View Site</span>
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                              </svg>
                            </a>
                            <button
                              onClick={() => setSelectedModForDetails(dmod)}
                              className="text-[9px] font-semibold text-dark-400 hover:text-dark-200 flex items-center gap-0.5 transition-colors"
                            >
                              <span>Details</span>
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                          <button
                            onClick={() => handleInstallDiscoverMod(dmod)}
                            disabled={alreadyInstalled || (installing && installingModUrl !== dmod.url)}
                            className={`text-[10px] py-1.5 px-4 rounded-lg font-bold transition-all duration-300 ${
                              alreadyInstalled
                                ? 'bg-success-600/10 text-success-400 border border-success-500/20 cursor-default'
                                : (installing && installingModUrl !== dmod.url)
                                ? 'bg-primary-600/50 text-white/50 cursor-not-allowed'
                                : 'bg-primary-600 hover:bg-primary-500 text-white shadow-md shadow-primary-600/10 hover:shadow-primary-500/20 hover:scale-[1.02] active:scale-[0.98]'
                            }`}
                          >
                            {alreadyInstalled ? (
                              t('mods.installed')
                            ) : installingModUrl === dmod.url ? (
                              <div className="flex items-center gap-1.5">
                                <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>{t('mods.installing')}</span>
                              </div>
                            ) : (
                              t('mods.oneClickInstall')
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUB TAB: PALMODSETTINGS.INI CONFIG EDITOR */}
        {activeSubTab === 'config' && (
          <div className="space-y-4 flex flex-col h-[calc(100vh-180px)] min-h-[400px]">
            <div className="flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-dark-200">PalModSettings.ini Config Editor</h3>
                <p className="text-[10px] text-dark-500 mt-0.5">Edit active mod listings, global loading states, and custom workshop parameters.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadIniContent}
                  disabled={loadingIni || savingIni}
                  className="px-3.5 py-1.5 border border-dark-700/50 text-dark-300 hover:text-dark-100 hover:bg-dark-800 rounded-lg text-xs font-semibold transition-all"
                >
                  {loadingIni ? 'Refreshing...' : '🔄 Reload File'}
                </button>
                <button
                  onClick={handleSaveIni}
                  disabled={loadingIni || savingIni}
                  className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold"
                >
                  {savingIni ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-dark-900/40 border border-dark-800/60 rounded-2xl p-4 flex flex-col overflow-hidden relative group">
              {loadingIni ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <svg className="animate-spin h-6 w-6 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-xs text-dark-400">Loading PalModSettings.ini...</span>
                </div>
              ) : (
                <textarea
                  value={iniContent}
                  onChange={(e) => setIniContent(e.target.value)}
                  className="w-full h-full bg-transparent text-dark-100 font-mono text-[11px] leading-relaxed resize-none border-none outline-none focus:ring-0 focus:outline-none custom-scrollbar p-2"
                  placeholder={`[PalModSettings]\nbGlobalEnableMod=true\n# Add ActiveModList entries here`}
                  spellCheck={false}
                />
              )}
            </div>
          </div>
        )}



      </div>

      {/* Mod Details Modal */}
      {selectedModForDetails && (
        <ModDetailsModal 
          mod={selectedModForDetails} 
          onClose={() => setSelectedModForDetails(null)} 
          isLogicMod={isLogicMod}
          setIsLogicMod={setIsLogicMod}
          ue4ssInstalled={ue4ssInstalled}
          handleInstallUe4ss={handleInstallUe4ss}
          installingUe4ss={installingUe4ss}
          handleInstallDiscoverMod={handleInstallDiscoverMod}
          installing={installing}
          alreadyInstalled={mods.some(m => m.name === selectedModForDetails.name)}
          handleInstallLocal={handleInstallLocal}
        />
      )}

      {/* Premium API Warning Modal */}
      {showPremiumWarning && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-warning-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 flex-shrink-0 text-warning-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-sm font-bold text-dark-100">Nexus Mods Premium Required</h3>
            </div>
            
            <p className="text-[11px] text-dark-300 leading-relaxed">
              Nexus Mods limits direct API downloads to active Premium subscription accounts. Free accounts cannot use the automated
            </p>
            <div className="bg-dark-950/50 border border-dark-850 p-3.5 rounded-xl space-y-2">
              <span className="text-[9px] font-bold text-primary-400 uppercase tracking-wider block">
                How to install manually (100% Free):
              </span>
              <ol className="list-decimal pl-4 text-[10px] text-dark-300 space-y-1.5">
                <li>Click <strong>Open Download Page</strong> below.</li>
                <li>On the files tab, click <strong>Manual Download</strong>, then <strong>Slow Download</strong>.</li>
                <li>Once the file downloads, click <strong>Import Downloaded File</strong> to select it.</li>
              </ol>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPremiumWarning(null)}
                  className="px-4 py-2 border border-dark-700/50 text-dark-300 hover:text-dark-100 hover:bg-dark-800 rounded-lg text-xs font-semibold transition-all"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    await handleInstallLocal(isLogicMod);
                    setShowPremiumWarning(null);
                  }}
                  className="px-4 py-2 bg-dark-800 hover:bg-dark-750 text-dark-200 hover:text-dark-100 rounded-lg text-xs font-semibold border border-dark-700 transition-all"
                >
                  Import Downloaded File
                </button>
              </div>
              <div className="flex gap-2">
                <a
                  href={showPremiumWarning.url + "?tab=files"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowPremiumWarning(null)}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-primary-600/10 hover:shadow-primary-500/20 transition-all flex items-center gap-1"
                >
                  <span>Open Download Page</span>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Steam Workshop Warning Modal */}
      {showSteamWorkshopWarning && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-warning-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 flex-shrink-0 text-warning-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-sm font-bold text-dark-100">Steam Workshop Authentication Required</h3>
            </div>
            
            <p className="text-[11px] text-dark-300 leading-relaxed">
              Paid games like <strong>Palworld</strong> do not permit anonymous downloads of workshop items. To download and install this mod, follow these steps:
            </p>

            <div className="space-y-3">
              <div className="bg-dark-950/50 border border-dark-850 p-4 rounded-xl space-y-2">
                <span className="text-[10px] font-bold text-primary-400 uppercase tracking-wider block">
                  Subscribe on Steam Client (Free & Automatic)
                </span>
                <ol className="list-decimal pl-4 text-[10px] text-dark-300 space-y-1.5">
                  <li>Click <strong>Open in Steam</strong> or <strong>Open Browser</strong> below and click <strong>Subscribe</strong>.</li>
                  <li>Let your local Steam client download the mod.</li>
                  <li>Click <strong>One-Click Install</strong> again. The manager will automatically detect and import the mod from your local Steam folder!</li>
                </ol>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSteamWorkshopWarning(null)}
                  className="px-3 py-1.5 border border-dark-700/50 text-dark-300 hover:text-dark-100 hover:bg-dark-800 rounded-lg text-xs font-semibold transition-all"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    await handleInstallLocal(isLogicMod);
                    setShowSteamWorkshopWarning(null);
                  }}
                  className="px-3 py-1.5 bg-dark-800 hover:bg-dark-750 text-dark-200 hover:text-dark-100 rounded-lg text-xs font-semibold border border-dark-700 transition-all"
                >
                  Import Downloaded File
                </button>
              </div>
              <div className="flex gap-2">
                <a
                  href={`steam://url/CommunityFilePage/${showSteamWorkshopWarning.workshop_id}`}
                  onClick={() => setShowSteamWorkshopWarning(null)}
                  className="px-3 py-1.5 bg-dark-800 hover:bg-dark-750 text-dark-200 hover:text-dark-100 border border-dark-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                >
                  <span>Open in Steam</span>
                </a>
                <a
                  href={showSteamWorkshopWarning.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowSteamWorkshopWarning(null)}
                  className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-primary-600/10 hover:shadow-primary-500/20 transition-all flex items-center gap-1"
                >
                  <span>Open Browser</span>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Install Success Guidance Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-dark-800/60 pb-3">
              <div className="flex items-center gap-3 text-success-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6 flex-shrink-0 text-success-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="text-sm font-bold text-dark-100">Mod Installed Successfully!</h3>
                  <p className="text-[10px] text-dark-500 mt-0.5">Guide version 1.0.0 — Dedicated Server Modding Flow</p>
                </div>
              </div>
              <a
                href="https://docs.palworldgame.com/settings-and-operation/mod"
                target="_blank"
                rel="noreferrer"
                className="text-[9px] font-bold text-primary-400 hover:text-primary-300 flex items-center gap-0.5 uppercase tracking-wider bg-primary-500/10 px-2.5 py-1 rounded-lg border border-primary-500/20"
              >
                <span>Official Docs</span>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                </svg>
              </a>
            </div>
            
            <p className="text-[11px] text-dark-300 leading-relaxed">
              <strong>{showSuccessModal.title}</strong> has been successfully placed in the server directory. Please review the complete official modding instructions below:
            </p>

            <div className="max-h-[380px] overflow-y-auto pr-2 space-y-4 custom-scrollbar text-[10.5px] text-dark-300 leading-relaxed">
              
              {/* Important Warnings */}
              <div className="bg-warning-500/10 border border-warning-500/20 text-warning-400/90 p-3 rounded-xl space-y-1">
                <span className="font-bold text-[10px] uppercase tracking-wider block">Important Notes</span>
                <ul className="list-disc pl-4 space-y-1 text-[9.5px]">
                  <li>At this time, server-side mods work only on the dedicated server with <strong>Windows edition</strong>.</li>
                  <li>Only mods that are specifically built to run on servers will function.</li>
                  <li>Use mods at your own risk. They may cause save-data corruption or crashes.</li>
                </ul>
              </div>

              {/* Placing Workshop Mods */}
              <div className="space-y-1.5 bg-dark-950/40 p-3 rounded-xl border border-dark-800/40">
                <span className="font-bold text-dark-200 block text-[10.5px]">Placing Workshop Mods</span>
                <p>
                  Unlike the game client, the dedicated server must be made aware of Workshop items. The manager has placed this mod using the <strong>Default Directory</strong> method:
                </p>
                <div className="bg-dark-950 p-2.5 rounded-lg border border-dark-900 font-mono text-[9px] text-dark-400 space-y-0.5 mt-1">
                  <div>.\PalServer.exe</div>
                  <div>.\Mods\PalModSettings.ini</div>
                  <div className="text-success-400">.\Mods\Workshop\{showSuccessModal.workshop_id || 'folder_name'}\Info.json</div>
                </div>
              </div>

              {/* Enabling Mods */}
              <div className="space-y-1.5 bg-dark-950/40 p-3 rounded-xl border border-dark-800/40">
                <span className="font-bold text-dark-200 block text-[10.5px]">Enabling Mods via PalModSettings.ini</span>
                <p>
                  To load mods, the manager has updated your server's <code className="bg-dark-900 px-1 py-0.5 rounded text-dark-200 font-mono text-[9.5px]">Mods/PalModSettings.ini</code>:
                </p>
                <div className="bg-dark-950 p-2.5 rounded-lg border border-dark-900 font-mono text-[9px] text-dark-400 space-y-1">
                  <div>[PalModSettings]</div>
                  <div className="text-success-400">bGlobalEnableMod=true</div>
                  <div className="text-success-400">ActiveModList={showSuccessModal.workshop_id ? `Workshop_${showSuccessModal.workshop_id}` : showSuccessModal.name}</div>
                </div>
                <p className="text-[9.5px] text-dark-500 italic mt-1">
                  Note: ActiveModList requires the PackageName found inside Info.json, not the directory folder name. The manager registers this automatically.
                </p>
              </div>

              {/* Deployment on Restart */}
              <div className="space-y-1.5 bg-dark-950/40 p-3 rounded-xl border border-dark-800/40">
                <span className="font-bold text-dark-200 block text-[10.5px]">Deploy Mods by Restarting the Server</span>
                <p>
                  To apply the mods, <strong>you must restart the dedicated server</strong>. Upon restart, the game automatically parses the mod's configuration and deploys files to the correct target paths:
                </p>
                <div className="grid grid-cols-2 gap-2 text-[9px] bg-dark-950 p-2.5 rounded-lg border border-dark-900 font-mono text-dark-400">
                  <div className="border-r border-dark-850 pr-2">
                    <span className="text-primary-400 block font-bold mb-1">Source Rule</span>
                    <div>UE4SS</div>
                    <div>UE4SS Lua</div>
                    <div>PalSchema</div>
                    <div>LogicMods</div>
                    <div>Paks</div>
                  </div>
                  <div>
                    <span className="text-primary-400 block font-bold mb-1">Deployed Destination Path</span>
                    <div>Mods\NativeMods\UE4SS</div>
                    <div>Mods\NativeMods\UE4SS\Mods\{"{PackageName}"}</div>
                    <div>Mods\NativeMods\UE4SS\Mods\PalSchema\mods\{"{PackageName}"}</div>
                    <div className="text-success-400">Pal\Content\Paks\LogicMods</div>
                    <div className="text-success-400">Pal\Content\Paks\~WorkshopMods\{"{PackageName}"}</div>
                  </div>
                </div>
              </div>

              {/* Updating & Removing */}
              <div className="space-y-1.5 bg-dark-950/40 p-3 rounded-xl border border-dark-800/40">
                <span className="font-bold text-dark-200 block text-[10.5px]">Updating & Removing Mods</span>
                <ul className="list-disc pl-4 space-y-1 text-[10px]">
                  <li><strong>Updating</strong>: If the Version in Info.json changes, restarting the server automatically uninstalls the old files and deploys the new ones.</li>
                  <li><strong>Disabling</strong>: Toggle the mod active/inactive state in the Inventory tab to remove its PackageName from the ActiveModList.</li>
                  <li><strong>Forced Deactivation</strong>: Adding the <code className="bg-dark-900 px-1 py-0.5 rounded font-mono text-[9px] text-warning-400">-NoMods</code> launch argument forcibly disables all mod loading at startup.</li>
                </ul>
              </div>

              {/* Troubleshooting */}
              <div className="space-y-1.5 bg-dark-950/40 p-3 rounded-xl border border-dark-800/40 text-dark-400">
                <span className="font-bold text-dark-200 block text-[10.5px]">Troubleshooting Guidelines</span>
                <div className="space-y-2 text-[10px]">
                  <div>
                    <span className="font-bold text-dark-300 block">Is the mod compatible with dedicated servers?</span>
                    Verify if the InstallRule section in the mod's Info.json includes <code className="bg-dark-900 px-1 py-0.5 rounded font-mono">"IsServer": true</code>. If missing, the mod won't load on dedicated servers.
                  </div>
                  <div>
                    <span className="font-bold text-dark-300 block">Are prerequisite mods installed?</span>
                    Some mods require additional framework mods or settings to function properly.
                  </div>
                </div>
              </div>

            </div>

            <div className="flex items-center justify-end pt-2 border-t border-dark-800/60">
              <button
                onClick={() => setShowSuccessModal(null)}
                className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-primary-600/10 hover:shadow-primary-500/20 transition-all"
              >
                Got it, Thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
