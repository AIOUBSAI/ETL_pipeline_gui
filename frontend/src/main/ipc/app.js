/**
 * App IPC Handlers
 * Handles app-level information like version
 */

const { ipcMain } = require('electron');
const { version } = require('../../../package.json');

/**
 * Register app-related IPC handlers
 */
function registerAppHandlers() {
  /**
   * Get app version
   */
  ipcMain.handle('get-app-version', async () => {
    return version;
  });
}

module.exports = { registerAppHandlers };
