const { ipcMain } = require('electron');
const { getSettings, updateSettings } = require('../utils/settings');
const { verifyPassword } = require('../utils/crypto');
const { logAuthEvent, AuditEvents, getRecentAuditLogs } = require('../utils/audit-logger');
const { successResponse, errorResponse } = require('../utils/ipc-response');

/**
 * Register settings IPC handlers
 */
function registerSettingsHandlers() {
  // Get settings
  ipcMain.handle('get-settings', () => {
    try {
      const settings = getSettings();
      return successResponse({ settings });
    } catch (error) {
      return errorResponse(error, { settings: {} });
    }
  });

  // Save settings
  ipcMain.handle('save-settings', async (event, newSettings) => {
    try {
      // Log if credentials were changed
      const oldSettings = getSettings();
      const credentialsChanged = newSettings.credentials &&
        JSON.stringify(oldSettings.credentials) !== JSON.stringify(newSettings.credentials);

      const result = await updateSettings(newSettings);

      if (credentialsChanged) {
        logAuthEvent(AuditEvents.PASSWORD_CHANGED, 'admin', {
          changedBy: 'settings-dialog'
        });
      }

      return result; // updateSettings already returns standardized format
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Verify credentials (secure backend validation)
  ipcMain.handle('verify-credentials', async (event, { username, password, role }) => {
    try {
      const settings = getSettings();
      const credentials = settings.credentials?.[role];

      if (!credentials) {
        throw new Error('Invalid role');
      }

      // Check username
      if (credentials.username !== username) {
        logAuthEvent(AuditEvents.LOGIN_FAILURE, username, {
          role,
          reason: 'invalid-username'
        });
        return successResponse({ valid: false });
      }

      // Verify password hash
      const isValid = await verifyPassword(password, credentials.password);

      if (isValid) {
        logAuthEvent(AuditEvents.LOGIN_SUCCESS, username, { role });
      } else {
        logAuthEvent(AuditEvents.LOGIN_FAILURE, username, {
          role,
          reason: 'invalid-password'
        });
      }

      return successResponse({ valid: isValid });
    } catch (error) {
      console.error('Error verifying credentials:', error);
      return errorResponse(error, { valid: false });
    }
  });

  // Get audit logs (admin only)
  ipcMain.handle('get-audit-logs', async (event, limit = 100) => {
    try {
      const logs = getRecentAuditLogs(limit);
      return successResponse({ logs });
    } catch (error) {
      console.error('Error getting audit logs:', error);
      return errorResponse(error, { logs: [] });
    }
  });

  // Clear logs (just a signal)
  ipcMain.on('clear-logs', () => {
    // The renderer will handle clearing its own logs
  });
}

module.exports = {
  registerSettingsHandlers
};
