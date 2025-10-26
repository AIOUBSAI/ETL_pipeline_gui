const { ipcMain, Notification } = require('electron');
const { sendToRenderer } = require('../window');

/**
 * Register notification IPC handlers
 */
function registerNotificationHandlers() {
  /**
   * Send a notification to the renderer process
   * This is called from other main process modules
   */
  ipcMain.handle('send-notification', async (event, notificationData) => {
    try {
      // Forward to renderer for display
      sendToRenderer('notification', notificationData);

      return { success: true };
    } catch (error) {
      console.error('Error sending notification:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Focus the main window (called when notification is clicked)
   */
  ipcMain.handle('focus-window', async () => {
    try {
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

      if (win) {
        if (win.isMinimized()) {
          win.restore();
        }
        win.focus();
      }

      return { success: true };
    } catch (error) {
      console.error('Error focusing window:', error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Send a notification from main process
 * @param {Object} data - Notification data
 */
function sendNotification(data) {
  sendToRenderer('notification', data);
}

module.exports = {
  registerNotificationHandlers,
  sendNotification
};
