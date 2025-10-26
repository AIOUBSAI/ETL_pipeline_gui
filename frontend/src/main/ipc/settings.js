const { ipcMain } = require('electron');
const { getSettings, updateSettings } = require('../utils/settings');

/**
 * Register settings IPC handlers
 */
function registerSettingsHandlers() {
  // Get settings
  ipcMain.handle('get-settings', () => {
    return getSettings();
  });

  // Save settings
  ipcMain.handle('save-settings', (event, newSettings) => {
    return updateSettings(newSettings);
  });

  // Clear logs (just a signal)
  ipcMain.on('clear-logs', () => {
    // The renderer will handle clearing its own logs
  });
}

module.exports = {
  registerSettingsHandlers
};
