/**
 * App IPC Handlers
 * Handles app-level information like version
 */

const { ipcMain } = require('electron');
const { version } = require('../../../package.json');
const { successResponse, errorResponse } = require('../utils/ipc-response');

/**
 * Register app-related IPC handlers
 */
function registerAppHandlers() {
  /**
   * Get app version
   */
  ipcMain.handle('get-app-version', async () => {
    try {
      return successResponse({ version });
    } catch (error) {
      return errorResponse(error, { version: 'unknown' });
    }
  });
}

module.exports = { registerAppHandlers };
