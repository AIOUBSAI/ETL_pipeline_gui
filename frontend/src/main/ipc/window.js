const { ipcMain } = require('electron');
const { getMainWindow } = require('../window');

/**
 * Register window control IPC handlers
 */
function registerWindowHandlers() {
  // Minimize window
  ipcMain.on('window-minimize', () => {
    const window = getMainWindow();
    window?.minimize();
  });

  // Maximize/restore window
  ipcMain.on('window-maximize', () => {
    const window = getMainWindow();
    if (window?.isMaximized()) {
      window?.unmaximize();
    } else {
      window?.maximize();
    }
  });

  // Close window
  ipcMain.on('window-close', () => {
    const window = getMainWindow();
    window?.close();
  });

  // Toggle DevTools
  ipcMain.on('window-toggle-devtools', () => {
    const window = getMainWindow();
    if (window) {
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        window.webContents.openDevTools();
      }
    }
  });
}

module.exports = {
  registerWindowHandlers
};
