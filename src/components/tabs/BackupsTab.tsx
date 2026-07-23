import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { tauriCommands, formatBytes } from '../../lib/tauri';
import type { Backup } from '../../stores/useAppStore';
import { CustomSelect } from '../ui/CustomSelect';
import { open, save, ask } from '@tauri-apps/plugin-dialog';

export const BackupsTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification } = useAppStore();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [label, setLabel] = useState('');

  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupInterval, setAutoBackupInterval] = useState('6h');
  const [autoBackupRetention, setAutoBackupRetention] = useState(10);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    loadBackups();
  }, [serverId]);

  useEffect(() => {
    const loadAutoBackupSettings = async () => {
      try {
        const enabledVal = await tauriCommands.getSetting(`auto_backup_enabled_${serverId}`);
        setAutoBackupEnabled(enabledVal === 'true');

        const intervalVal = await tauriCommands.getSetting(`auto_backup_interval_${serverId}`);
        setAutoBackupInterval(intervalVal || '6h');

        const retentionVal = await tauriCommands.getSetting(`auto_backup_retention_${serverId}`);
        setAutoBackupRetention(retentionVal ? parseInt(retentionVal) : 10);
      } catch (e) {
        console.error('Failed to load auto backup settings:', e);
      }
    };
    loadAutoBackupSettings();
  }, [serverId]);

  const loadBackups = async () => {
    try {
      const data = await tauriCommands.getBackups(serverId);
      setBackups(data);
    } catch (e: any) {
      showNotification('error', `Failed to load backups: ${e}`);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await tauriCommands.setSetting(`auto_backup_enabled_${serverId}`, autoBackupEnabled ? 'true' : 'false');
      await tauriCommands.setSetting(`auto_backup_interval_${serverId}`, autoBackupInterval);
      await tauriCommands.setSetting(`auto_backup_retention_${serverId}`, autoBackupRetention.toString());
      showNotification('success', 'Automatic backup settings updated successfully.');
    } catch (e: any) {
      showNotification('error', `Failed to update auto backup settings: ${e}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await tauriCommands.createBackup(serverId, label || undefined);
      showNotification('success', 'Backup created successfully');
      setLabel('');
      await loadBackups();
    } catch (e: any) {
      showNotification('error', `Backup failed: ${e}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async (backupId: number) => {
    const confirmed = await ask('Restore this backup? Current save data will be overwritten.', {
      title: 'Restore Backup',
      kind: 'warning',
    });
    if (!confirmed) return;
    try {
      await tauriCommands.restoreBackup(serverId, backupId);
      showNotification('success', 'Backup restored successfully');
    } catch (e: any) {
      showNotification('error', `Restore failed: ${e}`);
    }
  };

  const handleDelete = async (backupId: number) => {
    const confirmed = await ask('Delete this backup? This cannot be undone.', {
      title: 'Delete Backup',
      kind: 'warning',
    });
    if (!confirmed) return;
    try {
      await tauriCommands.deleteBackup(backupId);
      showNotification('success', 'Backup deleted');
      await loadBackups();
    } catch (e: any) {
      showNotification('error', `Delete failed: ${e}`);
    }
  };

  const handleExport = async (backup: Backup) => {
    try {
      const destPath = await save({
        filters: [{
          name: 'Palworld Server Backup',
          extensions: ['zip']
        }],
        defaultPath: backup.label ? `PalServer_Backup_${backup.label.replace(/\s+/g, '_')}.zip` : `PalServer_Backup_${backup.id}.zip`
      });
      if (destPath) {
        showNotification('info', 'Exporting backup...');
        // @ts-ignore
        await tauriCommands.exportBackup(backup.id, destPath);
        showNotification('success', 'Backup exported successfully!');
      }
    } catch (e: any) {
      showNotification('error', `Export failed: ${e}`);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const selected = await open({
        filters: [{
          name: 'Palworld Server Backup',
          extensions: ['zip']
        }],
        multiple: false
      });
      if (selected && typeof selected === 'string') {
        const importLabel = prompt('Enter a label for this imported backup:', 'Imported Migration');
        if (importLabel === null) {
          setIsImporting(false);
          return;
        }
        showNotification('info', 'Importing backup...');
        // @ts-ignore
        await tauriCommands.importBackup(serverId, selected, importLabel || undefined);
        showNotification('success', 'Backup imported successfully!');
        await loadBackups();
      }
    } catch (e: any) {
      showNotification('error', `Import failed: ${e}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-5 overflow-y-auto h-full space-y-5">
      {/* Auto Backup Configuration */}
      <div className="glass-card p-4 space-y-4 relative z-20">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">
            Automatic Backup System
          </h3>
          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="btn-primary text-xs py-1.5 px-3"
          >
            {savingSettings ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Toggle Switch */}
          <div className="flex items-center justify-between p-3 bg-dark-900/40 border border-dark-700/30 rounded-lg">
            <div>
              <span className="text-xs text-dark-200 font-semibold block">Enable Auto-Backup</span>
              <span className="text-[9px] text-dark-500">Run automatic backups in background</span>
            </div>
            <button
              onClick={() => setAutoBackupEnabled(!autoBackupEnabled)}
              className={`w-10 h-5 rounded-full transition-all relative ${
                autoBackupEnabled
                  ? 'bg-primary-500/30 border border-primary-500/50'
                  : 'bg-dark-700/50 border border-dark-600/30'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                  autoBackupEnabled ? 'left-5 bg-primary-400' : 'left-0.5 bg-dark-500'
                }`}
              />
            </button>
          </div>

          {/* Backup Interval */}
          <div className="space-y-1.5 p-3 bg-dark-900/40 border border-dark-700/30 rounded-lg">
            <span className="text-xs text-dark-200 font-semibold block">Backup Interval</span>
            <CustomSelect
              options={[
                { value: '1h', label: 'Every hour (1h)' },
                { value: '6h', label: 'Every 6 hours (6h)' },
                { value: '12h', label: 'Every 12 hours (12h)' },
                { value: '24h', label: 'Daily (24h)' },
              ]}
              value={autoBackupInterval}
              onChange={setAutoBackupInterval}
              disabled={!autoBackupEnabled}
            />
          </div>

          {/* Retention Limit */}
          <div className="space-y-1.5 p-3 bg-dark-900/40 border border-dark-700/30 rounded-lg">
            <span className="text-xs text-dark-200 font-semibold block">Retention Limit</span>
            <input
              type="number"
              value={autoBackupRetention}
              onChange={(e) => setAutoBackupRetention(parseInt(e.target.value) || 10)}
              className="input-field text-xs w-full py-1 bg-dark-900 border border-dark-700/40 text-dark-100"
              min={1}
              max={100}
              disabled={!autoBackupEnabled}
            />
          </div>
        </div>
      </div>
      {/* Create backup */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">
            Create or Import Backup
          </h3>
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="btn-ghost border border-dark-700/60 hover:border-dark-600 rounded-lg text-[10px] py-1.5 px-3 whitespace-nowrap flex items-center gap-1.5 transition-all"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-primary-400">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707A1 1 0 017.707 6.707L9 8.000V3a1 1 0 112 0v5.000l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            {isImporting ? 'Importing...' : 'Import Save (.zip)'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="input-field text-xs flex-1"
            placeholder="Backup label (optional)"
          />
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="btn-primary text-xs whitespace-nowrap"
          >
            {isCreating ? 'Creating...' : 'Create Backup'}
          </button>
        </div>
      </div>

      {/* Backup list */}
      {backups.length === 0 ? (
        <div className="text-center py-12 text-dark-500 text-sm">
          No backups yet. Create your first backup above.
        </div>
      ) : (
        <div className="space-y-2">
          {backups.map((backup) => (
            <div key={backup.id} className="glass-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-primary-400">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-dark-200">
                    {backup.label || `Backup #${backup.id}`}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-dark-500 mt-0.5">
                    <span>{new Date(backup.createdAt).toLocaleString()}</span>
                    <span>{formatBytes(backup.size)}</span>
                    <span className="capitalize">{backup.backupType}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport(backup)}
                  className="btn-ghost text-[10px] py-1 px-2 text-primary-400 hover:text-primary-300"
                >
                  Export
                </button>
                <button
                  onClick={() => handleRestore(backup.id)}
                  className="btn-ghost text-[10px] py-1 px-2"
                >
                  Restore
                </button>
                <button
                  onClick={() => handleDelete(backup.id)}
                  className="btn-ghost text-[10px] py-1 px-2 text-error-400 hover:text-error-300"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
