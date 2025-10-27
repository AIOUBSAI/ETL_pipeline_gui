const { ipcMain } = require('electron');
const { getSettings, updateSettings } = require('../utils/settings');
const { verifyPassword } = require('../utils/crypto');
const { logAuthEvent, AuditEvents, getRecentAuditLogs } = require('../utils/audit-logger');

/**
 * Register settings IPC handlers
 */
function registerSettingsHandlers() {
  // Get settings
  ipcMain.handle('get-settings', () => {
    return getSettings();
  });

  // Save settings
  ipcMain.handle('save-settings', async (event, newSettings) => {
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

    return result;
  });

  // Verify credentials (secure backend validation)
  ipcMain.handle('verify-credentials', async (event, { username, password, role }) => {
    try {
      const settings = getSettings();
      const credentials = settings.credentials?.[role];

      if (!credentials) {
        return { valid: false, error: 'Invalid role' };
      }

      // Check username
      if (credentials.username !== username) {
        logAuthEvent(AuditEvents.LOGIN_FAILURE, username, {
          role,
          reason: 'invalid-username'
        });
        return { valid: false, error: 'Invalid credentials' };
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

      return { valid: isValid };
    } catch (error) {
      console.error('Error verifying credentials:', error);
      return { valid: false, error: 'Verification failed' };
    }
  });

  // Get audit logs (admin only)
  ipcMain.handle('get-audit-logs', async (event, limit = 100) => {
    try {
      return getRecentAuditLogs(limit);
    } catch (error) {
      console.error('Error getting audit logs:', error);
      return [];
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
