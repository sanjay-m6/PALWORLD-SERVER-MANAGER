import React, { useEffect, useState } from 'react';
import { tauriCommands } from '../../lib/tauri';
import { useAppStore } from '../../stores/useAppStore';
import { CustomSelect } from '../ui/CustomSelect';

interface Task {
  id: number;
  serverId: number;
  taskName: string;
  taskType: string;
  cronExpression: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  playerAware?: boolean;
  preBackup?: boolean;
  gracePeriod?: number;
}

export const SchedulerTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification } = useAppStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [newTask, setNewTask] = useState({
    name: '',
    type: 'restart',
    cron: '0 */6 * * *',
    playerAware: true,
    preBackup: true,
    gracePeriod: 5,
  });

  useEffect(() => {
    loadTasks();
  }, [serverId]);

  const loadTasks = async () => {
    try {
      const data = await tauriCommands.getTasks(serverId);
      const tasksWithSettings = await Promise.all(
        data.map(async (task: any) => {
          const aware = await tauriCommands.getSetting(`task_player_aware_${task.id}`);
          const backup = await tauriCommands.getSetting(`task_pre_backup_${task.id}`);
          const grace = await tauriCommands.getSetting(`task_grace_period_${task.id}`);
          return {
            ...task,
            playerAware: aware === 'true',
            preBackup: backup === 'true',
            gracePeriod: grace ? parseInt(grace) : 5,
          };
        })
      );
      setTasks(tasksWithSettings);
    } catch (e: any) {
      showNotification('error', `Failed to load tasks: ${e}`);
    }
  };

  const handleCreate = async () => {
    try {
      const taskId = await tauriCommands.createTask(serverId, newTask.name, newTask.type, newTask.cron);
      
      // Save scheduler options to DB settings
      await tauriCommands.setSetting(`task_player_aware_${taskId}`, newTask.playerAware ? 'true' : 'false');
      await tauriCommands.setSetting(`task_pre_backup_${taskId}`, newTask.preBackup ? 'true' : 'false');
      await tauriCommands.setSetting(`task_grace_period_${taskId}`, newTask.gracePeriod.toString());

      showNotification('success', 'Task created successfully');
      setShowCreate(false);
      setNewTask({
        name: '',
        type: 'restart',
        cron: '0 */6 * * *',
        playerAware: true,
        preBackup: true,
        gracePeriod: 5,
      });
      await loadTasks();
    } catch (e: any) {
      showNotification('error', `Failed to create task: ${e}`);
    }
  };

  const handleUpdate = async (taskId: number) => {
    try {
      await tauriCommands.updateTask(taskId, newTask.name, newTask.type, newTask.cron);
      
      // Save scheduler options to DB settings
      await tauriCommands.setSetting(`task_player_aware_${taskId}`, newTask.playerAware ? 'true' : 'false');
      await tauriCommands.setSetting(`task_pre_backup_${taskId}`, newTask.preBackup ? 'true' : 'false');
      await tauriCommands.setSetting(`task_grace_period_${taskId}`, newTask.gracePeriod.toString());

      showNotification('success', 'Task updated successfully');
      setShowCreate(false);
      setEditingTaskId(null);
      setNewTask({
        name: '',
        type: 'restart',
        cron: '0 */6 * * *',
        playerAware: true,
        preBackup: true,
        gracePeriod: 5,
      });
      await loadTasks();
    } catch (e: any) {
      showNotification('error', `Failed to update task: ${e}`);
    }
  };

  const handleToggle = async (taskId: number, enabled: boolean) => {
    try {
      await tauriCommands.toggleTask(taskId, !enabled);
      await loadTasks();
    } catch (e: any) {
      showNotification('error', `Toggle failed: ${e}`);
    }
  };

  const handleDelete = async (taskId: number) => {
    if (!confirm('Delete this scheduled task?')) return;
    try {
      await tauriCommands.deleteTask(taskId);
      showNotification('success', 'Task deleted');
      await loadTasks();
    } catch (e: any) {
      showNotification('error', `Delete failed: ${e}`);
    }
  };

  const cronPresets = [
    { label: 'Every 6 hours', cron: '0 */6 * * *' },
    { label: 'Every 12 hours', cron: '0 */12 * * *' },
    { label: 'Daily at midnight', cron: '0 0 * * *' },
    { label: 'Every hour', cron: '0 * * * *' },
  ];

  return (
    <div className="p-5 overflow-y-auto h-full space-y-5">
      {/* Create task form */}
      <div className="glass-card p-4 relative z-20">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">
            Scheduled Tasks
          </h3>
          <button
            onClick={() => {
              if (showCreate) {
                setShowCreate(false);
                setEditingTaskId(null);
                setNewTask({
                  name: '',
                  type: 'restart',
                  cron: '0 */6 * * *',
                  playerAware: true,
                  preBackup: true,
                  gracePeriod: 5,
                });
              } else {
                setShowCreate(true);
              }
            }}
            className="btn-primary text-xs py-1.5 px-3"
          >
            {showCreate ? 'Cancel' : '+ Add Task'}
          </button>
        </div>

        {showCreate && (
          <div className="space-y-3 pt-3 border-t border-dark-700/30 animate-slide-in">
            <div>
              <label className="block text-[10px] font-medium text-dark-500 mb-1">
                Task Name
              </label>
              <input
                type="text"
                value={newTask.name}
                onChange={(e) => setNewTask((prev) => ({ ...prev, name: e.target.value }))}
                className="input-field text-xs"
                placeholder="Auto Restart"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-dark-500 mb-1">
                  Task Type
                </label>
                <CustomSelect
                  options={[
                    { value: 'restart', label: 'Restart' },
                    { value: 'backup', label: 'Backup' },
                    { value: 'update', label: 'Update' },
                  ]}
                  value={newTask.type}
                  onChange={(val) => setNewTask((prev) => ({ ...prev, type: val }))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-dark-500 mb-1">
                  Cron Expression
                </label>
                <input
                  type="text"
                  value={newTask.cron}
                  onChange={(e) => setNewTask((prev) => ({ ...prev, cron: e.target.value }))}
                  className="input-field text-xs font-mono"
                />
              </div>
            </div>

            {/* Smart Settings */}
            <div className="p-3 bg-dark-900/40 rounded-lg border border-dark-800/40 space-y-3">
              <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                Smart Warning & Backups
              </h4>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs text-dark-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTask.playerAware}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, playerAware: e.target.checked }))}
                    className="rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-0"
                  />
                  <span>Smart Player-Aware restarts (Broadcast RCON warning if players are online)</span>
                </label>
                
                {newTask.playerAware && (
                  <div className="flex items-center gap-2 pl-5">
                    <span className="text-xs text-dark-500">Warning Grace Period:</span>
                    <select
                      value={newTask.gracePeriod}
                      onChange={(e) => setNewTask((prev) => ({ ...prev, gracePeriod: parseInt(e.target.value) }))}
                      className="bg-dark-800 border border-dark-700 text-xs rounded px-2 py-1 text-dark-200 focus:outline-none"
                    >
                      <option value="1">1 minute</option>
                      <option value="3">3 minutes</option>
                      <option value="5">5 minutes</option>
                      <option value="10">10 minutes</option>
                    </select>
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-dark-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTask.preBackup}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, preBackup: e.target.checked }))}
                    className="rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-0"
                  />
                  <span>Create automatic backup before executing this task</span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {cronPresets.map((preset) => (
                <button
                  key={preset.cron}
                  onClick={() => setNewTask((prev) => ({ ...prev, cron: preset.cron }))}
                  className={`px-2 py-1 text-[10px] rounded-md border transition-all ${
                    newTask.cron === preset.cron
                      ? 'border-primary-500/30 bg-primary-500/10 text-primary-400'
                      : 'border-dark-700/30 text-dark-500 hover:text-dark-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => editingTaskId !== null ? handleUpdate(editingTaskId) : handleCreate()}
              className="btn-success text-xs"
            >
              {editingTaskId !== null ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        )}
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="text-center py-12 text-dark-500 text-sm">
          No scheduled tasks. Click "Add Task" to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="glass-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleToggle(task.id, task.enabled)}
                  className={`w-10 h-5 rounded-full transition-all relative ${
                    task.enabled
                      ? 'bg-primary-500/30 border border-primary-500/50'
                      : 'bg-dark-700/50 border border-dark-600/30'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                      task.enabled
                        ? 'left-5 bg-primary-400'
                        : 'left-0.5 bg-dark-500'
                    }`}
                  />
                </button>
                <div>
                  <div className="text-sm font-medium text-dark-200">
                    {task.taskName || `${task.taskType} task`}
                  </div>
                  <div className="flex flex-col gap-0.5 text-[10px] text-dark-500 mt-0.5 font-mono">
                    <div className="flex items-center gap-3">
                      <span className="capitalize text-primary-400 font-bold font-sans">{task.taskType}</span>
                      <span>Cron: {task.cronExpression}</span>
                      {task.playerAware && <span className="text-success-400 font-sans">🛡️ Player-Aware ({task.gracePeriod}m)</span>}
                      {task.preBackup && <span className="text-warning-400 font-sans">💾 Pre-Backup</span>}
                    </div>
                    <div className="text-dark-600">
                      {task.lastRun && <span>Last: {new Date(task.lastRun).toLocaleString()} | </span>}
                      {task.nextRun && <span>Next: {new Date(task.nextRun).toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingTaskId(task.id);
                    setNewTask({
                      name: task.taskName,
                      type: task.taskType,
                      cron: task.cronExpression,
                      playerAware: task.playerAware ?? true,
                      preBackup: task.preBackup ?? true,
                      gracePeriod: task.gracePeriod ?? 5,
                    });
                    setShowCreate(true);
                  }}
                  className="btn-ghost text-[10px] py-1 px-2 text-primary-400 hover:text-primary-300"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
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
