const path = require('path');
const fs = require('fs');

/**
 * Default application settings
 */
const defaultSettings = {
  rootFolder: '',
  etlProjectPath: '',
  theme: 'catppuccin-frappe',
  pythonPath: 'python',
  loginMode: 'user', // 'admin' or 'user' - determines which account is active
  credentials: {
    admin: {
      username: 'admin',
      password: 'admin'
    },
    user: {
      username: 'user',
      password: 'user'
    }
  }
};

let appSettings = { ...defaultSettings };

/**
 * Get the settings file path
 * @returns {string} Path to settings.json
 */
function getSettingsPath() {
  // Lazy-load app only when needed
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'settings.json');
}

/**
 * Load settings from disk
 * @returns {Object} Loaded settings
 */
function loadSettings() {
  const settingsPath = getSettingsPath();
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      appSettings = { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (error) {
  }
  return appSettings;
}

/**
 * Save settings to disk
 * @param {Object} newSettings - Settings to save
 */
function saveSettings(newSettings = null) {
  const settingsPath = getSettingsPath();

  if (newSettings) {
    appSettings = { ...appSettings, ...newSettings };
  }

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2));
  } catch (error) {
  }
}

/**
 * Get current settings
 * @returns {Object} Current settings
 */
function getSettings() {
  return appSettings;
}

/**
 * Update settings
 * @param {Object} newSettings - Settings to update
 * @returns {Object} Updated settings
 */
function updateSettings(newSettings) {
  appSettings = { ...appSettings, ...newSettings };
  saveSettings();
  return appSettings;
}

module.exports = {
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings
};
