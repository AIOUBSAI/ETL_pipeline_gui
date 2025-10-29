/**
 * Release Notes IPC Handlers
 * Handles reading and processing release notes markdown file
 */

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { successResponse, errorResponse } = require('../utils/ipc-response');
const { marked } = require('marked');

/**
 * Register release notes IPC handlers
 */
function registerReleaseNotesHandlers() {
  /**
   * Read and process release notes markdown file
   * Returns markdown converted to HTML (mermaid shown as code blocks)
   */
  ipcMain.handle('read-release-notes', async () => {
    try {
      const releaseNotesPath = path.join(__dirname, '..', '..', '..', 'docs', 'RELEASE_NOTES.md');

      if (!fs.existsSync(releaseNotesPath)) {
        throw new Error('Release notes file not found');
      }

      const markdown = fs.readFileSync(releaseNotesPath, 'utf-8');

      // Configure marked
      marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: true,
        mangle: false,
      });

      // Convert markdown to HTML in main process
      const html = marked.parse(markdown);

      return successResponse({
        markdown,  // Raw markdown for reference
        html       // Processed HTML (mermaid blocks shown as code)
      });
    } catch (error) {
      console.error('Error reading release notes:', error);
      return errorResponse(error, { markdown: '', html: '' });
    }
  });
}

module.exports = {
  registerReleaseNotesHandlers
};
