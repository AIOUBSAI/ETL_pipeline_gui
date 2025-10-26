/**
 * Plugins Dialog
 * Manages plugin installation and configuration
 */

import { getById, getAll } from '../utils/dom.js';
import { showToast } from '../components/toast.js';
import { showConfirm } from '../components/confirm.js';
import { loadDialog } from '../utils/templateLoader.js';

let customThemes = [];
let themeLoaderInstance = null;

/**
 * Initialize plugins dialog
 * @param {Object} themeLoader - Theme loader instance
 */
export async function initializePluginsDialog(themeLoader) {
  // Load the plugins dialog template
  await loadDialog('plugins', 'templates/dialogs/plugins.html');

  themeLoaderInstance = themeLoader;

  // Initialize tab navigation
  initializePluginTabs();

  // Initialize theme plugin functionality
  initializeThemePlugins();

  // Listen for dialog opened event
  window.addEventListener('dialogOpened', (e) => {
    if (e.detail.dialogName === 'plugins') {
      loadCustomThemes();
    }
  });
}

/**
 * Initialize plugin tab navigation
 */
function initializePluginTabs() {
  const tabButtons = getAll('[data-plugin-tab]');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.pluginTab;

      // Update active button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Update active tab content
      const tabs = getAll('.settings-tab');
      tabs.forEach(tab => tab.classList.remove('active'));

      const targetTab = getById(`plugin-tab-${tabName}`);
      if (targetTab) {
        targetTab.classList.add('active');
      }
    });
  });
}

/**
 * Initialize theme plugin functionality
 */
function initializeThemePlugins() {
  // Browse for theme file
  const selectThemeFileBtn = getById('select-theme-file-btn');
  const themeFilePathInput = getById('theme-file-path');
  const importThemeBtn = getById('import-theme-btn');

  if (selectThemeFileBtn) {
    selectThemeFileBtn.addEventListener('click', async () => {
      try {
        const filePath = await window.electronAPI.selectFile({
          title: 'Select Theme File',
          filters: [
            { name: 'CSS Files', extensions: ['css'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });

        if (filePath) {
          themeFilePathInput.value = filePath;
          importThemeBtn.disabled = false;
        }
      } catch (error) {
      }
    });
  }

  // Import theme button
  if (importThemeBtn) {
    importThemeBtn.addEventListener('click', async () => {
      const filePath = themeFilePathInput.value;
      if (!filePath) return;

      try {
        const result = await window.electronAPI.importTheme(filePath);

        if (result.success) {
          // Show success message
          showToast(
            `Theme imported successfully as ${result.category} theme.`,
            'success',
            `Theme "${result.themeName}" Imported`
          );

          // Reset form
          themeFilePathInput.value = '';
          importThemeBtn.disabled = true;

          // Refresh theme loader to include the new theme
          if (themeLoaderInstance && typeof themeLoaderInstance.refreshThemes === 'function') {
            await themeLoaderInstance.refreshThemes();
          }

          // Reload custom themes list
          loadCustomThemes();
        } else {
          showToast(result.error || 'Failed to import theme', 'error', 'Import Error');
        }
      } catch (error) {
        showToast('Error importing theme', 'error', 'Error');
      }
    });
  }

  // Download template button
  const downloadTemplateBtn = getById('download-template-btn');
  if (downloadTemplateBtn) {
    downloadTemplateBtn.addEventListener('click', async () => {
      try {
        const result = await window.electronAPI.downloadThemeTemplate();

        if (result.success) {
          showToast(`Template saved to: ${result.path}`, 'success', 'Template Downloaded');
        } else {
          showToast(result.error || 'Failed to download template', 'error', 'Download Error');
        }
      } catch (error) {
        showToast('Error downloading template', 'error', 'Error');
      }
    });
  }

  // View documentation link
  const viewDocsLink = getById('view-docs-link');
  if (viewDocsLink) {
    viewDocsLink.addEventListener('click', (e) => {
      e.preventDefault();
      // TODO: Open documentation in browser or show help dialog
      showToast('Documentation coming soon!', 'info', 'Documentation');
    });
  }
}

/**
 * Load and display custom themes
 */
async function loadCustomThemes() {
  try {
    customThemes = await window.electronAPI.getCustomThemes();
    renderCustomThemesList();
  } catch (error) {
  }
}

/**
 * Render custom themes list
 */
function renderCustomThemesList() {
  const container = getById('custom-themes-list');
  if (!container) return;

  if (customThemes.length === 0) {
    container.innerHTML = `
      <div class="empty-state-small" style="padding: 24px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
        <p>No custom themes installed yet</p>
        <small>Import a theme file to get started</small>
      </div>
    `;
    return;
  }

  container.innerHTML = customThemes.map(theme => `
    <div class="custom-theme-item">
      <div class="custom-theme-info">
        <div class="custom-theme-preview" style="background: linear-gradient(135deg, ${theme.primaryColor || '#888'}, ${theme.secondaryColor || '#666'})"></div>
        <div class="custom-theme-details">
          <h4 class="custom-theme-name">${theme.name}</h4>
          <p class="custom-theme-path">${theme.fileName}</p>
        </div>
      </div>
      <div class="custom-theme-actions">
        <button class="btn btn-secondary btn-compact" data-theme-id="${theme.id}" data-action="apply">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Apply</span>
        </button>
        <button class="btn btn-secondary btn-compact" data-theme-id="${theme.id}" data-action="delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span>Delete</span>
        </button>
      </div>
    </div>
  `).join('');

  // Add event listeners for theme actions
  container.querySelectorAll('[data-action="apply"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const themeId = btn.dataset.themeId;
      try {
        // Use theme loader to apply the theme
        if (themeLoaderInstance && typeof themeLoaderInstance.loadTheme === 'function') {
          themeLoaderInstance.loadTheme(themeId);
          showToast('Theme applied successfully!', 'success', 'Theme Applied');
        } else {
          showToast('Error: Theme loader not available', 'error', 'Error');
        }
      } catch (error) {
        showToast('Error applying theme', 'error', 'Error');
      }
    });
  });

  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const themeId = btn.dataset.themeId;
      const theme = customThemes.find(t => t.id === themeId);

      const confirmed = await showConfirm(
        `Are you sure you want to delete the theme "${theme?.name}"?`,
        {
          title: 'Delete Theme',
          confirmText: 'Delete',
          cancelText: 'Cancel',
          type: 'warning'
        }
      );

      if (confirmed) {
        try {
          await window.electronAPI.deleteCustomTheme(themeId);
          showToast('Theme deleted successfully!', 'success', 'Theme Deleted');

          // Refresh theme loader
          if (themeLoaderInstance && typeof themeLoaderInstance.refreshThemes === 'function') {
            await themeLoaderInstance.refreshThemes();
          }

          loadCustomThemes();
        } catch (error) {
          showToast('Error deleting theme', 'error', 'Error');
        }
      }
    });
  });
}
