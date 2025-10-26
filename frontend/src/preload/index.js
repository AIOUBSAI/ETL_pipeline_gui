const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script - exposes safe IPC methods to renderer process
 * This maintains security by using contextBridge and contextIsolation
 */

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  toggleDevTools: () => ipcRenderer.send('window-toggle-devtools'),

  // Folder and project operations
  selectRootFolder: () => ipcRenderer.invoke('select-root-folder'),
  scanProjects: (rootFolder) => ipcRenderer.invoke('scan-projects', rootFolder),
  runPythonScript: (projectName, projectPath) =>
    ipcRenderer.invoke('run-python-script', projectName, projectPath),
  stopProject: (projectName) => ipcRenderer.invoke('stop-project', projectName),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Theme plugins
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  importTheme: (filePath) => ipcRenderer.invoke('import-theme', filePath),
  getCustomThemes: () => ipcRenderer.invoke('get-custom-themes'),
  applyCustomTheme: (themeId) => ipcRenderer.invoke('apply-custom-theme', themeId),
  deleteCustomTheme: (themeId) => ipcRenderer.invoke('delete-custom-theme', themeId),
  saveCustomTheme: (themeData) => ipcRenderer.invoke('save-custom-theme', themeData),
  loadCustomThemeContent: (filePath) => ipcRenderer.invoke('load-custom-theme-content', filePath),
  downloadThemeTemplate: () => ipcRenderer.invoke('download-theme-template'),
  onLoadCustomTheme: (callback) => {
    ipcRenderer.on('load-custom-theme', (event, data) => callback(data));
  },

  // Logs
  clearLogs: () => ipcRenderer.send('clear-logs'),
  onLogMessage: (callback) => {
    ipcRenderer.on('log-message', (event, log) => callback(log));
  },
  removeLogListener: () => {
    ipcRenderer.removeAllListeners('log-message');
  },

  // Release notes
  readReleaseNotes: () => ipcRenderer.invoke('read-release-notes'),

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Notifications
  onNotification: (callback) => {
    ipcRenderer.on('notification', (event, data) => callback(data));
  },
  removeNotificationListener: () => {
    ipcRenderer.removeAllListeners('notification');
  },
  focusWindow: () => ipcRenderer.invoke('focus-window')
});
