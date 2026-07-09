import { create } from 'zustand';

// Server status enum
export type ServerStatus = 'stopped' | 'starting' | 'running' | 'online' | 'stopping' | 'crashed' | 'updating' | 'restarting';

// Server model
export interface Server {
  id: number;
  name: string;
  description: string;
  installPath: string;
  savePath: string;
  status: ServerStatus;
  ports: {
    gamePort: number;
    rconPort: number;
    restApiPort: number;
  };
  rconConfig: {
    enabled: boolean;
    password: string;
  };
  restApiConfig: {
    enabled: boolean;
    port: number;
  };
  maxPlayers: number;
  adminPassword: string;
  serverPassword: string | null;
  isPublic: boolean;
  preset: string;
  startupArgs: string | null;
  crossplayPlatforms: string;
  autoStart: boolean;
  autoRestartSchedule: string | null;
  createdAt: string;
  lastStarted: string | null;
  configJson: string;
  branch: string;
}

// Backup model
export interface Backup {
  id: number;
  serverId: number;
  backupType: string;
  filePath: string;
  size: number;
  includesConfigs: boolean;
  includesSaves: boolean;
  verified: boolean;
  createdAt: string;
  label: string | null;
  notes: string | null;
  isProtected: boolean;
  status: string;
  hash: string | null;
}

// Player model
export interface Player {
  name: string;
  playerUid: string;
  steamId: string;
  joinTime: string | null;
  pingMs: number | null;
  isAdmin: boolean;
}

// Log line
export interface LogLine {
  timestamp: string;
  level: string;
  message: string;
  source?: string;
}

// Views
export type AppView = 'dashboard' | 'create-server' | 'server-detail' | 'settings';
export type ServerTab = 'overview' | 'config' | 'rcon' | 'players' | 'backups' | 'logs' | 'mods' | 'scheduler';

// Install progress state
export interface InstallState {
  isInstalling: boolean;
  progress: number | null;
  status: string;
  bytesDownloaded: number;
  bytesTotal: number;
  log: string;
  speed: number;
  eta: number | null;
  lastUpdatedTime: number;
}

// Store
interface AppStore {
  // View state
  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  selectedServerId: number | null;
  setSelectedServerId: (id: number | null) => void;

  activeServerTab: ServerTab;
  setActiveServerTab: (tab: ServerTab) => void;

  // Server data
  servers: Server[];
  setServers: (servers: Server[]) => void;
  updateServerStatus: (id: number, status: ServerStatus) => void;

  // Log state
  serverLogs: Record<number, LogLine[]>;
  addLogLine: (serverId: number, log: LogLine) => void;
  clearLogs: (serverId: number) => void;

  // RCON state
  rconConnected: Record<number, boolean>;
  setRconConnected: (serverId: number, connected: boolean) => void;

  // Players
  players: Record<number, Player[]>;
  setPlayers: (serverId: number, players: Player[]) => void;

  // Backups
  backups: Record<number, Backup[]>;
  setBackups: (serverId: number, backups: Backup[]) => void;

  // UI state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  notification: { type: 'success' | 'error' | 'warning' | 'info'; message: string } | null;
  showNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  clearNotification: () => void;

  // App version (dynamically fetched from Tauri)
  appVersion: string;
  setAppVersion: (version: string) => void;

  // Settings
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Install states per server ID
  installStates: Record<number, InstallState>;
  setInstallState: (serverId: number, state: Partial<InstallState> | ((prev: InstallState) => Partial<InstallState>)) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // View state
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),

  selectedServerId: null,
  setSelectedServerId: (id) => set({ selectedServerId: id }),

  activeServerTab: 'overview',
  setActiveServerTab: (tab) => set({ activeServerTab: tab }),

  // Server data
  servers: [],
  setServers: (servers) => set({ servers }),
  updateServerStatus: (id, status) =>
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, status } : s)),
    })),

  // Logs
  serverLogs: {},
  addLogLine: (serverId, log) =>
    set((state) => ({
      serverLogs: {
        ...state.serverLogs,
        [serverId]: [...(state.serverLogs[serverId] || []), log].slice(-500),
      },
    })),
  clearLogs: (serverId) =>
    set((state) => ({
      serverLogs: { ...state.serverLogs, [serverId]: [] },
    })),

  // RCON
  rconConnected: {},
  setRconConnected: (serverId, connected) =>
    set((state) => ({
      rconConnected: { ...state.rconConnected, [serverId]: connected },
    })),

  // Players
  players: {},
  setPlayers: (serverId, players) =>
    set((state) => ({
      players: { ...state.players, [serverId]: players },
    })),

  // Backups
  backups: {},
  setBackups: (serverId, backups) =>
    set((state) => ({
      backups: { ...state.backups, [serverId]: backups },
    })),

  // UI state
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  notification: null,
  showNotification: (type, message) => {
    set({ notification: { type, message } });
    setTimeout(() => {
      if (get().notification?.message === message) {
        set({ notification: null });
      }
    }, 5000);
  },
  clearNotification: () => set({ notification: null }),

  // App version
  appVersion: '',
  setAppVersion: (version) => set({ appVersion: version }),

  // Settings
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  installStates: {},
  setInstallState: (serverId, stateUpdate) =>
    set((state) => {
      const current = state.installStates[serverId] || {
        isInstalling: false,
        progress: null,
        status: '',
        bytesDownloaded: 0,
        bytesTotal: 0,
        log: '',
        speed: 0,
        eta: null,
        lastUpdatedTime: Date.now(),
      };
      const update = typeof stateUpdate === 'function' ? stateUpdate(current) : stateUpdate;
      
      let speed = current.speed ?? 0;
      let eta = current.eta ?? null;
      let lastUpdatedTime = current.lastUpdatedTime ?? Date.now();

      if (update.bytesDownloaded !== undefined && update.bytesDownloaded > current.bytesDownloaded) {
        const now = Date.now();
        const timeDiffSec = (now - lastUpdatedTime) / 1000;
        if (timeDiffSec > 0.5) {
          const bytesDiff = update.bytesDownloaded - current.bytesDownloaded;
          speed = Math.max(0, bytesDiff / timeDiffSec);
          lastUpdatedTime = now;

          const total = update.bytesTotal !== undefined ? update.bytesTotal : current.bytesTotal;
          if (total > update.bytesDownloaded && speed > 0) {
            const remainingBytes = total - update.bytesDownloaded;
            eta = Math.round(remainingBytes / speed);
          } else {
            eta = null;
          }
        }
      }

      if (update.status === 'finished' || update.status === 'failed') {
        speed = 0;
        eta = null;
      }

      return {
        installStates: {
          ...state.installStates,
          [serverId]: { 
            ...current, 
            ...update, 
            speed, 
            eta, 
            lastUpdatedTime 
          },
        },
      };
    }),
}));
