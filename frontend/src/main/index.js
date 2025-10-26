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

  // Create the main window
  createWindow();
}

// App lifecycle
app.whenReady().then(() => {
  // Load settings after app is ready
  loadSettings();

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
