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
  focusWindow: () => ipcRenderer.invoke('focus-window'),

  // Pipeline APIs
  pipeline: {
    list: (directory) => ipcRenderer.invoke('pipeline:list', directory),
    read: (path) => ipcRenderer.invoke('pipeline:read', path),
    write: (path, content) => ipcRenderer.invoke('pipeline:write', path, content),
    validate: (path) => ipcRenderer.invoke('pipeline:validate', path),
    execute: (path, options) => ipcRenderer.invoke('pipeline:execute', path, options),
    stop: (processId) => ipcRenderer.invoke('pipeline:stop', processId),
    listReports: (reportsDir) => ipcRenderer.invoke('pipeline:list-reports', reportsDir),
    readReport: (path) => ipcRenderer.invoke('pipeline:read-report', path),

    // Event listeners for streaming output
    onPipelineOutput: (callback) => {
      ipcRenderer.on('pipeline:output', (event, data) => callback(data));
    },
    onPipelineComplete: (callback) => {
      ipcRenderer.on('pipeline:complete', (event, data) => callback(data));
    },
    onPipelineError: (callback) => {
      ipcRenderer.on('pipeline:error', (event, data) => callback(data));
    },
    removePipelineListeners: () => {
      ipcRenderer.removeAllListeners('pipeline:output');
      ipcRenderer.removeAllListeners('pipeline:complete');
      ipcRenderer.removeAllListeners('pipeline:error');
    }
  },

  // Database APIs
  database: {
    getSchema: (dbPath) => ipcRenderer.invoke('database:get-schema', dbPath),
    query: (dbPath, sql, options) => ipcRenderer.invoke('database:query', dbPath, sql, options),
    exportTable: (dbPath, tableName, format) =>
      ipcRenderer.invoke('database:export-table', dbPath, tableName, format),
    getTableInfo: (dbPath, tableName) =>
      ipcRenderer.invoke('database:get-table-info', dbPath, tableName)
  },

  // File APIs
  file: {
    read: (path) => ipcRenderer.invoke('file:read', path),
    write: (path, content) => ipcRenderer.invoke('file:write', path, content),
    list: (directory, options) => ipcRenderer.invoke('file:list', directory, options),
    delete: (path) => ipcRenderer.invoke('file:delete', path),
    create: (path, content) => ipcRenderer.invoke('file:create', path, content),
    rename: (oldPath, newPath) => ipcRenderer.invoke('file:rename', oldPath, newPath),
    copy: (sourcePath, destPath) => ipcRenderer.invoke('file:copy', sourcePath, destPath),
    exists: (path) => ipcRenderer.invoke('file:exists', path),
    stats: (path) => ipcRenderer.invoke('file:stats', path),
    selectDialog: (options) => ipcRenderer.invoke('file:select-dialog', options),
    selectDirectory: (options) => ipcRenderer.invoke('file:select-directory', options),
    saveDialog: (options) => ipcRenderer.invoke('file:save-dialog', options)
  }
});
