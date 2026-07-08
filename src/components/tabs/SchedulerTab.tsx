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
}

export const SchedulerTab: React.FC<{ serverId: number }> = ({ serverId }) => {
  const { showNotification } = useAppStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({
    name: '',
    type: 'restart',
    cron: '0 */6 * * *',
  });

  useEffect(() => {
    loadTasks();
  }, [serverId]);

  const loadTasks = async () => {
    try {
      const data = await tauriCommands.getTasks(serverId);
      setTasks(data);
    } catch (e: any) {
      showNotification('error', `Failed to load tasks: ${e}`);
    }
  };

  const handleCreate = async () => {
    try {
      await tauriCommands.createTask(serverId, newTask.name, newTask.type, newTask.cron);
      showNotification('success', 'Task created');
      setShowCreate(false);
      setNewTask({ name: '', type: 'restart', cron: '0 */6 * * *' });
      await loadTasks();
    } catch (e: any) {
      showNotification('error', `Failed to create task: ${e}`);
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
            onClick={() => setShowCreate(!showCreate)}
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
                    { value: 'custom', label: 'Custom' },
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
            <button onClick={handleCreate} className="btn-success text-xs">
              Create Task
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
                  <div className="flex items-center gap-3 text-[10px] text-dark-500 mt-0.5">
                    <span className="capitalize">{task.taskType}</span>
                    <span className="font-mono">{task.cronExpression}</span>
                    {task.lastRun && (
                      <span>Last: {new Date(task.lastRun).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(task.id)}
                className="btn-ghost text-[10px] py-1 px-2 text-error-400 hover:text-error-300"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
