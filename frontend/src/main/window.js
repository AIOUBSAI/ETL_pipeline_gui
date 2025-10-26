const { BrowserWindow } = require('electron');
const path = require('path');

let mainWindow = null;

/**
 * Create the main application window
 * @returns {BrowserWindow} The created window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#303446', // Catppuccin Frappé base
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Get the main window instance
 * @returns {BrowserWindow|null} The main window
 */
function getMainWindow() {
  return mainWindow;
}

/**
 * Send a message to the renderer process
 * @param {string} channel - IPC channel
 * @param {any} data - Data to send
 */
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

module.exports = {
  createWindow,
  getMainWindow,
  sendToRenderer
};
