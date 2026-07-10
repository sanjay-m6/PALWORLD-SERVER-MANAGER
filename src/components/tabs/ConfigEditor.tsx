import React, { useEffect, useState } from 'react';
import { tauriCommands } from '../../lib/tauri';
import { useAppStore } from '../../stores/useAppStore';
import { CustomSelect } from '../ui/CustomSelect';

interface ConfigField {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'string' | 'select';
  category: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

const configFields: ConfigField[] = [
  // Gameplay
  { key: 'difficulty', label: 'Difficulty', type: 'select', category: 'Gameplay', options: ['None', 'Normal', 'Difficult'], description: 'Difficulty mode of the server.' },
  { key: 'dayTimeSpeedRate', label: 'Day Speed', type: 'number', category: 'Gameplay', min: 0.1, max: 10, step: 0.1, description: 'Daytime progression speed rate. Higher values make days pass faster.' },
  { key: 'nightTimeSpeedRate', label: 'Night Speed', type: 'number', category: 'Gameplay', min: 0.1, max: 10, step: 0.1, description: 'Nighttime progression speed rate. Higher values make nights pass faster.' },
  { key: 'expRate', label: 'EXP Rate', type: 'number', category: 'Gameplay', min: 0.1, max: 20, step: 0.1, description: 'EXP gain multiplier for players.' },
  { key: 'palCaptureRate', label: 'Pal Capture Rate', type: 'number', category: 'Gameplay', min: 0.1, max: 10, step: 0.1, description: 'Capture success rate multiplier for capturing Pals.' },
  { key: 'palSpawnNumRate', label: 'Pal Spawn Rate', type: 'number', category: 'Gameplay', min: 0.1, max: 5, step: 0.1, description: 'Pal spawn quantity multiplier. Higher values increase processing load.' },
  { key: 'workSpeedRate', label: 'Work Speed', type: 'number', category: 'Gameplay', min: 0.1, max: 10, step: 0.1, description: 'Pal work speed multiplier at base camps.' },
  { key: 'deathPenalty', label: 'Death Penalty', type: 'select', category: 'Gameplay', options: ['None', 'Item', 'ItemAndEquipment', 'All'], description: 'Penalty applied to players when they die.' },
  { key: 'isMultiplay', label: 'Multiplayer Enabled', type: 'boolean', category: 'Gameplay', description: 'Enables multiplayer synchronization on the server.' },

  // Combat
  { key: 'playerDamageRateAttack', label: 'Player ATK Rate', type: 'number', category: 'Combat', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for damage dealt by players.' },
  { key: 'playerDamageRateDefense', label: 'Player DEF Rate', type: 'number', category: 'Combat', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for damage taken by players (lower values decrease damage taken).' },
  { key: 'palDamageRateAttack', label: 'Pal ATK Rate', type: 'number', category: 'Combat', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for damage dealt by Pals.' },
  { key: 'palDamageRateDefense', label: 'Pal DEF Rate', type: 'number', category: 'Combat', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for damage taken by Pals (lower values decrease damage taken).' },
  { key: 'isPvp', label: 'PvP Enabled', type: 'boolean', category: 'Combat', description: 'Enables Player vs Player damage and guild warfare.' },
  { key: 'enablePlayerToPlayerDamage', label: 'Player vs Player Damage', type: 'boolean', category: 'Combat', description: 'Allows players to directly damage other players.' },
  { key: 'enableFriendlyFire', label: 'Friendly Fire', type: 'boolean', category: 'Combat', description: 'Enables damage between players in the same guild.' },
  { key: 'enableAimAssistPad', label: 'Controller Aim Assist', type: 'boolean', category: 'Combat', description: 'Enables target aim assist when using a controller.' },
  { key: 'enableAimAssistKeyboard', label: 'Keyboard Aim Assist', type: 'boolean', category: 'Combat', description: 'Enables target aim assist when using keyboard and mouse.' },

  // Survival
  { key: 'playerStomachDecreaseRate', label: 'Player Hunger Rate', type: 'number', category: 'Survival', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for player hunger depletion speed.' },
  { key: 'playerStaminaDecreaseRate', label: 'Player Stamina Drain', type: 'number', category: 'Survival', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for player stamina consumption rate.' },
  { key: 'playerAutoHpRegenRate', label: 'Player HP Regen Rate', type: 'number', category: 'Survival', min: 0.1, max: 10, step: 0.1, description: 'Natural health regeneration speed for players.' },
  { key: 'playerAutoHpRegenRateInSleep', label: 'Player HP Regen in Sleep', type: 'number', category: 'Survival', min: 0.1, max: 10, step: 0.1, description: 'Player natural health regeneration rate while sleeping.' },
  { key: 'palStomachDecreaseRate', label: 'Pal Hunger Rate', type: 'number', category: 'Survival', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for Pal hunger depletion speed.' },
  { key: 'palStaminaDecreaseRate', label: 'Pal Stamina Drain', type: 'number', category: 'Survival', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for Pal stamina consumption rate.' },
  { key: 'palAutoHpRegenRate', label: 'Pal HP Regen Rate', type: 'number', category: 'Survival', min: 0.1, max: 10, step: 0.1, description: 'Natural health regeneration speed for Pals.' },
  { key: 'palAutoHpRegenRateInSleep', label: 'Pal HP Regen in Sleep', type: 'number', category: 'Survival', min: 0.1, max: 10, step: 0.1, description: 'Pal natural health regeneration rate while inside the Palbox.' },
  { key: 'enableNonLoginPenalty', label: 'Offline Penalty', type: 'boolean', category: 'Survival', description: 'Applies offline penalties to structures or players while logged out.' },
  { key: 'enableFastTravel', label: 'Fast Travel', type: 'boolean', category: 'Survival', description: 'Enables the use of fast-travel points across the map.' },
  { key: 'canPickupOtherGuildDeathPenaltyDrop', label: 'Loot Other Death Drops', type: 'boolean', category: 'Survival', description: 'Allows players to loot death drops belonging to other guilds.' },

  // World & Building
  { key: 'collectionDropRate', label: 'Gather Drop Rate', type: 'number', category: 'World & Building', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for items gathered from collection nodes.' },
  { key: 'collectionObjectHpRate', label: 'Resource Object HP', type: 'number', category: 'World & Building', min: 0.1, max: 10, step: 0.1, description: 'Health multiplier for gatherable objects (trees, rocks, etc.).' },
  { key: 'collectionObjectRespawnSpeedRate', label: 'Resource Respawn Rate', type: 'number', category: 'World & Building', min: 0.1, max: 10, step: 0.1, description: 'Respawn speed multiplier for gatherable objects.' },
  { key: 'enemyDropItemRate', label: 'Enemy Drop Rate', type: 'number', category: 'World & Building', min: 0.1, max: 10, step: 0.1, description: 'Multiplier for item quantities dropped by defeated enemies.' },
  { key: 'buildObjectDamageRate', label: 'Build Object Damage Rate', type: 'number', category: 'World & Building', min: 0.1, max: 10, step: 0.1, description: 'Damage multiplier applied to player-built structures.' },
  { key: 'buildObjectDeteriorationDamageRate', label: 'Build Decay Rate', type: 'number', category: 'World & Building', min: 0, max: 10, step: 0.1, description: 'Decay speed multiplier for structures built outside base camp boundaries.' },
  { key: 'palEggDefaultHatchingTime', label: 'Egg Hatch Time (hrs)', type: 'number', category: 'World & Building', min: 0, max: 240, step: 0.5, description: 'Time in hours required to hatch a Huge Egg. Other eggs scale accordingly.' },
  { key: 'enableInvaderEnemy', label: 'Base Raids', type: 'boolean', category: 'World & Building', description: 'Enables random enemy raids on player base camps.' },
  { key: 'baseCampMaxNum', label: 'Max Camps (Global)', type: 'number', category: 'World & Building', min: 1, max: 100, step: 1, description: 'Maximum number of base camps allowed globally across the server.' },
  { key: 'baseCampMaxNumInGuild', label: 'Max Bases Per Guild', type: 'number', category: 'World & Building', min: 1, max: 20, step: 1, description: 'Maximum number of base camps a single guild can build. Raises processing load.' },
  { key: 'baseCampWorkerMaxNum', label: 'Max Base Workers', type: 'number', category: 'World & Building', min: 1, max: 50, step: 1, description: 'Maximum number of active Pals working in a base (max 50). Raises processing load.' },
  { key: 'dropItemMaxNum', label: 'Max Dropped Items', type: 'number', category: 'World & Building', min: 100, max: 10000, step: 100, description: 'Maximum number of dropped items allowed on the ground before disappearing.' },
  { key: 'dropItemMaxNumUnko', label: 'Max Dropped Dung', type: 'number', category: 'World & Building', min: 10, max: 1000, step: 10, description: 'Maximum number of dropped dung items allowed on the ground.' },
  { key: 'dropItemAliveMaxHours', label: 'Item Decay Time (hrs)', type: 'number', category: 'World & Building', min: 0.5, max: 48, step: 0.5, description: 'Time in hours before dropped items on the ground decay and disappear.' },
  { key: 'autoResetGuildNoOnlinePlayers', label: 'Auto Reset Offline Guilds', type: 'boolean', category: 'World & Building', description: 'Automatically deletes guild structures and base Pals if members remain offline.' },
  { key: 'autoResetGuildTimeNoOnlinePlayers', label: 'Guild Reset Timeout (hrs)', type: 'number', category: 'World & Building', min: 1, max: 720, step: 1, description: 'Duration in hours of guild inactivity before the auto-reset triggers.' },
  { key: 'supplyDropSpan', label: 'Supply Drop Interval (min)', type: 'number', category: 'World & Building', min: 10, max: 1440, step: 10, description: 'Cooldown timer in minutes between supply drop and meteorite spawn events.' },

  // Server Settings
  { key: 'serverPlayerMaxNum', label: 'Max Players', type: 'number', category: 'Server Settings', min: 1, max: 128, step: 1, description: 'Maximum number of concurrent players allowed on the server.' },
  { key: 'coopPlayerMaxNum', label: 'Max Coop Players', type: 'number', category: 'Server Settings', min: 1, max: 10, step: 1, description: 'Maximum number of players allowed in a single coop lobby.' },
  { key: 'guildPlayerMaxNum', label: 'Max Guild Players', type: 'number', category: 'Server Settings', min: 1, max: 100, step: 1, description: 'Maximum number of players allowed in a single guild.' },
  { key: 'serverName', label: 'Server Name', type: 'string', category: 'Server Settings', description: 'Display name of the server in the public server list.' },
  { key: 'serverDescription', label: 'Description', type: 'string', category: 'Server Settings', description: 'Description of the server shown in the server list.' },
  { key: 'adminPassword', label: 'Admin Password', type: 'string', category: 'Server Settings', description: 'Password required to execute admin RCON/console commands.' },
  { key: 'serverPassword', label: 'Server Password', type: 'string', category: 'Server Settings', description: 'Password required for players to connect to the server.' },
  { key: 'publicPort', label: 'Public Port', type: 'number', category: 'Server Settings', description: 'Port number used by client connections (default: 8211).' },
  { key: 'publicIp', label: 'Public IP Override', type: 'string', category: 'Server Settings', description: 'Explicit external public IP address of the server.' },
  { key: 'region', label: 'Server Region', type: 'string', category: 'Server Settings', description: 'Geographic region setting for server indexing.' },
  { key: 'banListUrl', label: 'Ban List URL', type: 'string', category: 'Server Settings', description: 'URL link to a remote list of banned player SteamIDs.' },
  { key: 'useauth', label: 'Use Auth System', type: 'boolean', category: 'Server Settings', description: 'Enables Steam authentication validation for clients.' },
  { key: 'rconEnabled', label: 'RCON Enabled', type: 'boolean', category: 'Server Settings', description: 'Enables remote console access (RCON) for server administration.' },
  { key: 'rconPort', label: 'RCON Port', type: 'number', category: 'Server Settings', description: 'Port number used to accept remote RCON connections.' },

  // REST API
  { key: 'restApiEnabled', label: 'REST API Enabled', type: 'boolean', category: 'REST API', description: 'Enables the REST API web service for server monitoring.' },
  { key: 'restApiPort', label: 'REST API Port', type: 'number', category: 'REST API', description: 'Port number used by the REST API server.' },
];

export const ConfigEditor: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification } = useAppStore();
  const [config, setConfig] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState('Gameplay');
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const [rawContent, setRawContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFields = searchQuery.trim() !== ''
    ? configFields.filter((f) =>
      f.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    : configFields.filter((f) => f.category === activeCategory);

  const categories = [...new Set(configFields.map((f) => f.category))];

  useEffect(() => {
    loadConfig();
  }, [serverId]);

  const loadConfig = async () => {
    try {
      const cfg = await tauriCommands.getServerConfig(serverId);
      setConfig(cfg);
      setIsDirty(false);
    } catch (e: any) {
      showNotification('error', `Failed to load config: ${e}`);
    }
  };

  const loadRawConfig = async () => {
    try {
      const raw = await tauriCommands.getRawConfig(serverId);
      setRawContent(raw);
    } catch (e: any) {
      setRawContent(`# Failed to load: ${e}`);
    }
  };

  const handleFieldChange = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const [isAllocatingPorts, setIsAllocatingPorts] = useState(false);

  const handleAutoAllocatePorts = async () => {
    setIsAllocatingPorts(true);
    try {
      const ports = await tauriCommands.allocatePorts(serverId);
      setConfig((prev: any) => ({
        ...prev,
        publicPort: ports.gamePort,
        rconPort: ports.rconPort,
        restApiPort: ports.restApiPort,
      }));
      setIsDirty(true);
      showNotification(
        'success',
        `Ports allocated successfully! Game Port: ${ports.gamePort}, RCON Port: ${ports.rconPort}, REST API Port: ${ports.restApiPort}`
      );
    } catch (e: any) {
      showNotification('error', `Failed to allocate ports: ${e}`);
    } finally {
      setIsAllocatingPorts(false);
    }
  };

  const handleAllocateIndividualPort = async (key: string) => {
    setIsAllocatingPorts(true);
    try {
      const ports = await tauriCommands.allocatePorts(serverId);
      let allocatedPort = 0;
      if (key === 'publicPort') allocatedPort = ports.gamePort;
      else if (key === 'rconPort') allocatedPort = ports.rconPort;
      else if (key === 'restApiPort') allocatedPort = ports.restApiPort;

      handleFieldChange(key, allocatedPort);
      showNotification('success', `Assigned available port: ${allocatedPort}`);
    } catch (e: any) {
      showNotification('error', `Failed to allocate port: ${e}`);
    } finally {
      setIsAllocatingPorts(false);
    }
  };


  const handleSave = async () => {
    try {
      if (viewMode === 'raw') {
        await tauriCommands.saveRawConfig(serverId, rawContent);
      } else {
        await tauriCommands.saveServerConfig(serverId, config);
      }
      showNotification('success', 'Configuration saved');
      setIsDirty(false);
    } catch (e: any) {
      showNotification('error', `Failed to save: ${e}`);
    }
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="skeleton w-96 h-64" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700/30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setViewMode('visual');
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'visual'
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'text-dark-400 hover:text-dark-200'
              }`}
          >
            Visual Editor
          </button>
          <button
            onClick={() => {
              setViewMode('raw');
              loadRawConfig();
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'raw'
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'text-dark-400 hover:text-dark-200'
              }`}
          >
            Raw INI
          </button>
        </div>

        {viewMode === 'visual' && (
          <div className="flex-1 max-w-[160px] focus-within:max-w-xs mx-4 transition-all duration-300 ease-in-out">
            <div className="relative group">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field text-xs pl-8 pr-8 w-full py-1.5 bg-dark-900/60 border-dark-700/50 transition-all"
                placeholder="Search settings..."
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 text-dark-500 group-focus-within:text-primary-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300"
              >
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a1 1 0 11-1.414 1.414l-3.329-3.328A7 7 0 012 9z"
                  clipRule="evenodd"
                />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300 flex items-center justify-center animate-fade-in"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-[10px] text-warning-400 font-medium">
              Unsaved changes
            </span>
          )}
          {viewMode === 'visual' && (
            <button
              onClick={handleAutoAllocatePorts}
              disabled={isAllocatingPorts}
              className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:border-primary-500/50 font-bold text-xs py-1.5 px-3 rounded-lg uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              {isAllocatingPorts ? 'Allocating...' : 'Auto-Allocate Ports'}
            </button>
          )}
          <button onClick={handleSave} className="btn-success text-xs py-1.5 px-4">
            Save Config
          </button>
        </div>
      </div>

      {viewMode === 'visual' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Category sidebar */}
          <div className="w-40 border-r border-dark-700/30 py-3 px-2 space-y-0.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setSearchQuery('');
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeCategory === cat && searchQuery.trim() === ''
                    ? 'text-primary-400 bg-primary-500/10'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700/30'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <h3 className="text-sm font-semibold text-dark-200 mb-4">
              {searchQuery.trim() !== '' ? `Search Results for "${searchQuery}"` : `${activeCategory} Settings`}
            </h3>
            {filteredFields.length === 0 ? (
              <div className="text-center py-12 text-dark-500 text-xs animate-fade-in">
                No settings match your search query.
              </div>
            ) : (
              filteredFields.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center justify-between py-2.5 border-b border-dark-700/15 relative z-10 hover:z-20 focus-within:z-20 animate-fade-in"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label className="text-xs text-dark-300 font-medium">
                      {field.label}
                    </label>
                    {searchQuery.trim() !== '' && (
                      <span className="text-[8px] bg-dark-800 text-dark-400 px-1.5 py-0.5 rounded border border-dark-700/50 uppercase tracking-wider font-semibold">
                        {field.category}
                      </span>
                    )}
                    {field.description && (
                      <div className="relative group flex items-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-3.5 h-3.5 text-dark-500 hover:text-dark-300 cursor-help transition-colors"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 p-2.5 text-[11px] leading-relaxed text-dark-200 bg-dark-900 border border-dark-700/60 rounded-lg shadow-xl z-50 pointer-events-none transition-all duration-200 font-sans">
                          <div className="absolute top-full left-1.5 -mt-1 border-4 border-transparent border-t-dark-900"></div>
                          {field.description}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="w-48">
                    {field.type === 'number' && (
                      <div className="flex gap-2 w-full">
                        <input
                          type="number"
                          value={config[field.key] ?? 1}
                          onChange={(e) =>
                            handleFieldChange(field.key, parseFloat(e.target.value))
                          }
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          className="input-field text-xs font-mono text-left flex-1 min-w-0"
                        />
                        {(field.key === 'publicPort' || field.key === 'rconPort' || field.key === 'restApiPort') && (
                          <button
                            onClick={() => handleAllocateIndividualPort(field.key)}
                            disabled={isAllocatingPorts}
                            className="bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-500/25 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50 shrink-0"
                            title="Find and assign an available port"
                          >
                            Assign
                          </button>
                        )}
                      </div>
                    )}
                    {field.type === 'boolean' && (
                      <button
                        onClick={() =>
                          handleFieldChange(field.key, !config[field.key])
                        }
                        className={`w-10 h-5 rounded-full transition-all relative ${config[field.key]
                            ? 'bg-primary-500/30 border border-primary-500/50'
                            : 'bg-dark-700/50 border border-dark-600/30'
                          }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${config[field.key]
                              ? 'left-5 bg-primary-400'
                              : 'left-0.5 bg-dark-500'
                            }`}
                        />
                      </button>
                    )}
                    {field.type === 'string' && (
                      <input
                        type="text"
                        value={config[field.key] ?? ''}
                        onChange={(e) =>
                          handleFieldChange(field.key, e.target.value)
                        }
                        className="input-field text-xs w-full"
                      />
                    )}
                    {field.type === 'select' && (
                      <CustomSelect
                        options={field.options?.map((opt) => ({ value: opt, label: opt })) || []}
                        value={config[field.key] ?? ''}
                        onChange={(val) => handleFieldChange(field.key, val)}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 p-4 overflow-hidden">
          <textarea
            value={rawContent}
            onChange={(e) => {
              setRawContent(e.target.value);
              setIsDirty(true);
            }}
            className="w-full h-full font-mono text-xs bg-dark-950 border border-dark-700/30 rounded-lg p-4 text-dark-300 resize-none focus:outline-none focus:border-primary-500/30"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
};
