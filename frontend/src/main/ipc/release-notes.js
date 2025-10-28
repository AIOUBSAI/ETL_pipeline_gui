/**
 * Release Notes IPC Handlers
 * Handles reading release notes markdown file
 */

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { successResponse, errorResponse } = require('../utils/ipc-response');

/**
 * Register release notes IPC handlers
 */
function registerReleaseNotesHandlers() {
  /**
   * Read release notes markdown file
   */
  ipcMain.handle('read-release-notes', async () => {
    try {
      const releaseNotesPath = path.join(__dirname, '..', '..', '..', 'docs', 'RELEASE_NOTES.md');

      if (!fs.existsSync(releaseNotesPath)) {
        throw new Error('Release notes file not found');
      }

      const content = fs.readFileSync(releaseNotesPath, 'utf-8');
      return successResponse({ content });
    } catch (error) {
      console.error('Error reading release notes:', error);
      return errorResponse(error, { content: '' });
    }
  });
}

module.exports = {
  registerReleaseNotesHandlers
};
