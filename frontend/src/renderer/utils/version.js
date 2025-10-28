/**
 * Version Utility
 * Fetches and displays app version in UI elements
 */

/**
 * Update version display in all UI elements
 * @param {string} version - The version string to display
 */
function updateVersionElements(version) {
  // Update sidebar version
  const sidebarVersion = document.querySelector('.sidebar-footer .version-info');
  if (sidebarVersion) {
    sidebarVersion.textContent = `v${version}`;
  }

  // Update help menu version
  const helpVersion = document.querySelector('.help-version-number');
  if (helpVersion) {
    helpVersion.textContent = `V${version}`;
  }

  // Update settings dialog version
  const settingsVersion = document.querySelector('.version-number-large');
  if (settingsVersion) {
    settingsVersion.textContent = version;
  }
}

/**
 * Initialize version display in all relevant UI elements
 */
export async function initializeVersionDisplay() {
  try {
    // Fetch version from main process
    const response = await window.electronAPI.getAppVersion();
    // successResponse spreads data, so version is at response.version, not response.data.version
    const version = response.version || 'unknown';

    // Update all version elements
    updateVersionElements(version);

    // Listen for dialog opened events to refresh version in settings
    window.addEventListener('dialogOpened', async (e) => {
      if (e.detail.dialogName === 'settings') {
        // Re-fetch and update version when settings dialog opens
        try {
          const freshResponse = await window.electronAPI.getAppVersion();
          const freshVersion = freshResponse.version || 'unknown';
          updateVersionElements(freshVersion);
        } catch (error) {
          console.error('Failed to refresh version in settings:', error);
        }
      }
    });

    return version;
  } catch (error) {
    console.error('Failed to load app version:', error);
    return 'unknown';
  }
}
