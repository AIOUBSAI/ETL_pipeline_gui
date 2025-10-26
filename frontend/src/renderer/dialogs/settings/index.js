/**
 * Settings Dialog
 * Main settings dialog controller
 */

import { getById, getAll } from '../../utils/dom.js';
import { state, setState, setNestedState } from '../../core/state.js';
import { showToast } from '../../components/toast.js';
import { closeDialog } from '../../components/dialog.js';
import { loadProjects } from '../../views/dashboard/controls.js';
import { loadDialog } from '../../utils/templateLoader.js';
import { notificationManager } from '../../utils/notifications.js';
import { soundManager } from '../../utils/sound-manager.js';

let themeLoader = null;

/**
 * Initialize settings dialog
 * @param {Object} themeLoaderInstance - Theme loader instance
 */
export async function initializeSettingsDialog(themeLoaderInstance) {
  // Load the settings dialog template
  await loadDialog('settings', 'templates/dialogs/settings.html');

  themeLoader = themeLoaderInstance;

  const selectFolderBtn = getById('dialog-select-folder-btn');
  const selectEtlProjectBtn = getById('dialog-select-etl-project-btn');
  const saveSettingsBtn = getById('dialog-save-settings-btn');
  const toggleDevToolsBtn = getById('toggle-devtools-btn');

  // Developer Tools toggle
  if (toggleDevToolsBtn) {
    toggleDevToolsBtn.addEventListener('click', () => {
      window.electronAPI.toggleDevTools();
    });
  }

  // Settings tab navigation
  const settingsNavItems = getAll('.settings-nav-item');
  const settingsTabs = getAll('.settings-tab');

  settingsNavItems.forEach(navItem => {
    navItem.addEventListener('click', () => {
      const tabName = navItem.dataset.settingsTab;

      settingsNavItems.forEach(item => item.classList.remove('active'));
      navItem.classList.add('active');

      settingsTabs.forEach(tab => tab.classList.remove('active'));
      const targetTab = getById(`settings-tab-${tabName}`);
      if (targetTab) {
        targetTab.classList.add('active');
      }
    });
  });

  // Native title bar toggle
  const nativeTitlebarToggle = getById('native-titlebar-toggle');
  if (nativeTitlebarToggle) {
    nativeTitlebarToggle.addEventListener('change', (e) => {
    });
  }

  if (selectFolderBtn) {
    selectFolderBtn.addEventListener('click', async () => {
      const folder = await window.electronAPI.selectRootFolder();
      if (folder) {
        const dialogInput = getById('dialog-root-folder-input');
        if (dialogInput) {
          dialogInput.value = folder;
        }
        setNestedState('settings', 'rootFolder', folder);
      }
    });
  }

  if (selectEtlProjectBtn) {
    selectEtlProjectBtn.addEventListener('click', async () => {
      const folder = await window.electronAPI.selectRootFolder();
      if (folder) {
        const dialogInput = getById('dialog-etl-project-input');
        if (dialogInput) {
          dialogInput.value = folder;
        }
        setNestedState('settings', 'etlProjectPath', folder);
      }
    });
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
      await saveDialogSettings();
    });
  }

  // Notifications toggle
  const notificationsToggle = getById('notifications-enabled-toggle');
  if (notificationsToggle) {
    notificationsToggle.addEventListener('change', (e) => {
      setNestedState('settings', 'notificationsEnabled', e.target.checked);
    });
  }

  // Sounds toggle
  const soundsToggle = getById('sounds-enabled-toggle');
  if (soundsToggle) {
    soundsToggle.addEventListener('change', (e) => {
      setNestedState('settings', 'soundEnabled', e.target.checked);
    });
  }

  // Sound volume slider
  const volumeSlider = getById('sound-volume-slider');
  const volumeValue = getById('sound-volume-value');
  if (volumeSlider && volumeValue) {
    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value;
      volumeValue.textContent = `${volume}%`;
      setNestedState('settings', 'soundVolume', volume / 100);
    });
  }

  // Test notification button
  const testNotificationBtn = getById('test-notification-btn');
  if (testNotificationBtn) {
    testNotificationBtn.addEventListener('click', () => {
      notificationManager.show({
        title: 'Test Notification',
        body: 'This is how notifications will appear when your scripts finish running.',
        type: 'success',
        playSound: false
      });
    });
  }

  // Test success sound button
  const testSoundSuccessBtn = getById('test-sound-success-btn');
  if (testSoundSuccessBtn) {
    testSoundSuccessBtn.addEventListener('click', () => {
      soundManager.playSuccess();
    });
  }

  // Test error sound button
  const testSoundErrorBtn = getById('test-sound-error-btn');
  if (testSoundErrorBtn) {
    testSoundErrorBtn.addEventListener('click', () => {
      soundManager.playError();
    });
  }

  // Listen for dialog opened event
  window.addEventListener('dialogOpened', (e) => {
    if (e.detail.dialogName === 'settings') {
      populateThemeGrids();
    }
  });
}

/**
 * Load settings into dialog
 */
export async function loadSettings() {
  try {
    const loadedSettings = await window.electronAPI.getSettings();
    setState('settings', { ...state.settings, ...loadedSettings });

    const dialogRootInput = getById('dialog-root-folder-input');
    const dialogEtlProjectInput = getById('dialog-etl-project-input');
    const loginModeSelect = getById('login-mode-select');
    const adminUsernameInput = getById('admin-username-input');
    const adminPasswordInput = getById('admin-password-input');
    const userUsernameInput = getById('user-username-input');
    const userPasswordInput = getById('user-password-input');

    if (dialogRootInput) {
      dialogRootInput.value = state.settings.rootFolder || '';
    }
    if (dialogEtlProjectInput) {
      dialogEtlProjectInput.value = state.settings.etlProjectPath || '';
    }

    // Load security settings
    if (loginModeSelect) {
      loginModeSelect.value = state.settings.loginMode || 'user';
    }
    if (state.settings.credentials) {
      if (adminUsernameInput) {
        adminUsernameInput.value = state.settings.credentials.admin?.username || 'admin';
      }
      if (adminPasswordInput) {
        adminPasswordInput.value = state.settings.credentials.admin?.password || 'admin';
      }
      if (userUsernameInput) {
        userUsernameInput.value = state.settings.credentials.user?.username || 'user';
      }
      if (userPasswordInput) {
        userPasswordInput.value = state.settings.credentials.user?.password || 'user';
      }
    }

    // Load notification and sound settings
    const notificationsToggle = getById('notifications-enabled-toggle');
    const soundsToggle = getById('sounds-enabled-toggle');
    const volumeSlider = getById('sound-volume-slider');
    const volumeValue = getById('sound-volume-value');

    if (notificationsToggle) {
      notificationsToggle.checked = state.settings.notificationsEnabled !== false;
    }
    if (soundsToggle) {
      soundsToggle.checked = state.settings.soundEnabled !== false;
    }
    if (volumeSlider && volumeValue) {
      const volume = (state.settings.soundVolume || 0.7) * 100;
      volumeSlider.value = volume;
      volumeValue.textContent = `${Math.round(volume)}%`;
    }
  } catch (error) {
  }
}

/**
 * Save settings from dialog
 */
async function saveDialogSettings() {
  try {
    const dialogRootInput = getById('dialog-root-folder-input');
    const dialogEtlProjectInput = getById('dialog-etl-project-input');
    const loginModeSelect = getById('login-mode-select');
    const adminUsernameInput = getById('admin-username-input');
    const adminPasswordInput = getById('admin-password-input');
    const userUsernameInput = getById('user-username-input');
    const userPasswordInput = getById('user-password-input');

    const newSettings = {
      rootFolder: dialogRootInput?.value || '',
      etlProjectPath: dialogEtlProjectInput?.value || '',
      loginMode: loginModeSelect?.value || 'user',
      credentials: {
        admin: {
          username: adminUsernameInput?.value || 'admin',
          password: adminPasswordInput?.value || 'admin'
        },
        user: {
          username: userUsernameInput?.value || 'user',
          password: userPasswordInput?.value || 'user'
        }
      }
    };

    await window.electronAPI.saveSettings(newSettings);
    setState('settings', { ...state.settings, ...newSettings });

    showToast('Settings saved successfully', 'success');
    closeDialog('settings');

    // Reload projects with new root folder
    await loadProjects();
  } catch (error) {
    showToast('Error saving settings', 'error');
  }
}

/**
 * Populate theme grids in appearance tab
 */
function populateThemeGrids() {
  const lightThemesGrid = getById('light-themes-grid');
  const darkThemesGrid = getById('dark-themes-grid');

  if (!lightThemesGrid || !darkThemesGrid || !themeLoader) return;

  const lightThemes = themeLoader.getLightThemes();
  const darkThemes = themeLoader.getDarkThemes();
  const currentTheme = themeLoader.getCurrentTheme();

  lightThemesGrid.innerHTML = '';
  lightThemes.forEach(theme => {
    const themeCard = createThemeCard(theme, currentTheme);
    lightThemesGrid.appendChild(themeCard);
  });

  darkThemesGrid.innerHTML = '';
  darkThemes.forEach(theme => {
    const themeCard = createThemeCard(theme, currentTheme);
    darkThemesGrid.appendChild(themeCard);
  });
}

/**
 * Create a theme card element
 * @param {Object} theme - Theme object
 * @param {string} currentTheme - Current theme ID
 * @returns {HTMLElement} Theme card element
 */
function createThemeCard(theme, currentTheme) {
  const button = document.createElement('button');
  button.className = 'theme-card';
  button.dataset.theme = theme.id;
  if (theme.id === currentTheme) {
    button.classList.add('active');
  }

  const previewClass = theme.category === 'light' ? 'theme-preview-light' : 'theme-preview-dark';

  button.innerHTML = `
    <div class="theme-card-preview ${previewClass}">
      <div class="theme-preview-header"></div>
      <div class="theme-preview-body">
        <div class="theme-preview-sidebar"></div>
        <div class="theme-preview-main"></div>
      </div>
    </div>
    <span class="theme-card-label">${theme.name.replace('Catppuccin ', '')}</span>
    <svg class="theme-card-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;

  button.addEventListener('click', () => {
    if (themeLoader) {
      themeLoader.loadTheme(theme.id);
      populateThemeGrids();
    }
  });

  return button;
}
