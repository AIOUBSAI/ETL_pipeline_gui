/**
 * Version Utility
 * Fetches and displays app version in UI elements
 */

/**
 * Initialize version display in all relevant UI elements
 */
export async function initializeVersionDisplay() {
  try {
    // Fetch version from main process
    const version = await window.electronAPI.getAppVersion();

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

  } catch (error) {
    console.error('Failed to load app version:', error);
  }
}
