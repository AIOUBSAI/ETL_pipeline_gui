const { app, BrowserWindow } = require('electron');

const { createWindow } = require('./window');
const { loadSettings } = require('./utils/settings');
const { registerWindowHandlers } = require('./ipc/window');
const { registerSettingsHandlers } = require('./ipc/settings');
const { registerProjectHandlers } = require('./ipc/projects');
const { registerThemeHandlers } = require('./ipc/themes');
const { registerReleaseNotesHandlers } = require('./ipc/release-notes');
const { registerAppHandlers } = require('./ipc/app');
const { registerNotificationHandlers } = require('./ipc/notifications');
const { registerPipelineHandlers } = require('./ipc/pipeline');
const { registerDatabaseHandlers } = require('./ipc/database');
const { registerFileHandlers } = require('./ipc/files');

/**
 * Initialize the application
 */
function initialize() {
  // Register all IPC handlers
  registerWindowHandlers();
  registerSettingsHandlers();
  registerProjectHandlers();
  registerThemeHandlers();
  registerReleaseNotesHandlers();
  registerAppHandlers();
  registerNotificationHandlers();
  registerPipelineHandlers();
  registerDatabaseHandlers();
  registerFileHandlers();

  // Create the main window
  createWindow();
}

// App lifecycle
app.whenReady().then(async () => {
  // Load settings after app is ready (async to support password migration)
  await loadSettings();

  initialize();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
