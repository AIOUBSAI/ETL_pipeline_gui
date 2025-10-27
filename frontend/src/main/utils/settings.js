const path = require('path');
const fs = require('fs');
const { hashPassword, isLegacyHash } = require('./crypto');

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
      password: 'admin' // Will be hashed on first save
    },
    user: {
      username: 'user',
      password: 'user' // Will be hashed on first save
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
 * @returns {Promise<Object>} Loaded settings
 */
async function loadSettings() {
  const settingsPath = getSettingsPath();
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      appSettings = { ...defaultSettings, ...JSON.parse(data) };

      // Migrate legacy plain-text passwords to hashed format
      await migrateLegacyPasswords();
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return appSettings;
}

/**
 * Migrate legacy plain-text passwords to hashed format
 * @returns {Promise<void>}
 */
async function migrateLegacyPasswords() {
  let needsSave = false;

  // Check admin password
  if (appSettings.credentials?.admin?.password &&
      isLegacyHash(appSettings.credentials.admin.password)) {
    try {
      const hashedPassword = await hashPassword(appSettings.credentials.admin.password);
      appSettings.credentials.admin.password = hashedPassword;
      needsSave = true;
    } catch (error) {
      console.error('Failed to migrate admin password:', error);
    }
  }

  // Check user password
  if (appSettings.credentials?.user?.password &&
      isLegacyHash(appSettings.credentials.user.password)) {
    try {
      const hashedPassword = await hashPassword(appSettings.credentials.user.password);
      appSettings.credentials.user.password = hashedPassword;
      needsSave = true;
    } catch (error) {
      console.error('Failed to migrate user password:', error);
    }
  }

  // Save if any passwords were migrated
  if (needsSave) {
    saveSettings();
    console.log('Migrated legacy passwords to secure hashed format');
  }
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
 * @returns {Promise<Object>} Updated settings
 */
async function updateSettings(newSettings) {
  // Hash passwords if they're being updated and are plain-text
  if (newSettings.credentials) {
    if (newSettings.credentials.admin?.password &&
        isLegacyHash(newSettings.credentials.admin.password)) {
      newSettings.credentials.admin.password =
        await hashPassword(newSettings.credentials.admin.password);
    }
    if (newSettings.credentials.user?.password &&
        isLegacyHash(newSettings.credentials.user.password)) {
      newSettings.credentials.user.password =
        await hashPassword(newSettings.credentials.user.password);
    }
  }

  appSettings = { ...appSettings, ...newSettings };
  saveSettings();
  return appSettings;
}

module.exports = {
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings,
  migrateLegacyPasswords
};
