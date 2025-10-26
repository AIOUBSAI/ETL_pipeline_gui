/**
 * Main Renderer Entry Point
 * Initializes and coordinates all app components
 */

import { ThemeLoader } from './core/theme.js';
import { state, setState } from './core/state.js';
import { initializeIcons } from './utils/icons.js';
import { initializeVersionDisplay } from './utils/version.js';
import { initializeTitleBar } from './components/titlebar.js';
import { initializeSidebarToggle, initializeNavigation } from './components/sidebar.js';
import { initializeDropdownMenu } from './components/dropdown-menu.js';
import { initializeDialogs } from './components/dialog.js';
import { initializeHelpMenu } from './components/help-menu.js';
import { initializeDashboard } from './views/dashboard/index.js';
import { loadProjects } from './views/dashboard/controls.js';
import { initializePipelineView } from './views/pipeline/index.js';
import { initializeSettingsDialog, loadSettings } from './dialogs/settings/index.js';
import { initializeThemesDialog } from './dialogs/themes.js';
import { initializePluginsDialog } from './dialogs/plugins.js';
import { initializeLoginDialog, checkAdminSession } from './dialogs/login.js';
import { initializeSimpleDialogs } from './dialogs/simple-dialogs.js';
import { initializeReleaseNotesDialog } from './dialogs/release-notes.js';
import { initializeKeyboardShortcutsDialog } from './dialogs/keyboard-shortcuts.js';
import { initializeCommandPalette } from './components/command-palette.js';
import { initializeKeyboardShortcuts } from './utils/keyboard-shortcuts.js';
import { notificationManager } from './utils/notifications.js';
import { soundManager } from './utils/sound-manager.js';

let themeLoader = null;

/**
 * Hide splash screen with fade animation
 */
function hideSplashScreen() {
  const splashScreen = document.getElementById('splash-screen');
  if (splashScreen) {
    splashScreen.classList.add('fade-out');
    setTimeout(() => {
      splashScreen.remove();
    }, 500); // Match the CSS transition duration
  }
}

/**
 * Initialize the application
 */
async function initializeApp() {
  try {
    const startTime = Date.now();

    // Initialize theme system first
    themeLoader = new ThemeLoader();
    await themeLoader.init();

    // Initialize UI components
    initializeTitleBar();
    initializeSidebarToggle();
    initializeNavigation(handleViewChange);
    initializeHelpMenu();

    // Initialize views
    initializeDashboard();
    initializePipelineView();

    // Initialize dialogs with theme loader (now async with template loading)
    await initializeSettingsDialog(themeLoader);
    await initializeThemesDialog(themeLoader);
    await initializePluginsDialog(themeLoader);
    await initializeLoginDialog();
    await initializeSimpleDialogs();
    await initializeReleaseNotesDialog();
    await initializeKeyboardShortcutsDialog();

    // Initialize command palette
    await initializeCommandPalette();

    // Initialize global keyboard shortcuts
    initializeKeyboardShortcuts();

    // Initialize dialog close buttons AFTER templates are loaded
    initializeDialogs();

    // Initialize notification and sound managers
    await notificationManager.init();
    await soundManager.init();

    // Check for existing admin session BEFORE initializing dropdown menu
    // This ensures the state is set before updateAdminStatus() is called
    checkAdminSession();

    // Initialize dropdown menu after session check
    initializeDropdownMenu();

    // Initialize all icons in the document (after dialogs are loaded)
    initializeIcons();

    // Initialize version display
    await initializeVersionDisplay();

    // Load settings on startup
    await loadSettings();

    // Load projects after settings are loaded
    await loadProjects();

    // Calculate elapsed time and ensure minimum splash screen duration
    const elapsed = Date.now() - startTime;
    const minSplashDuration = 1000; // 1 second minimum
    const remainingTime = Math.max(0, minSplashDuration - elapsed);

    // Hide splash screen after minimum duration
    setTimeout(() => {
      hideSplashScreen();
    }, remainingTime);

  } catch (error) {
    // Hide splash screen even on error
    setTimeout(() => hideSplashScreen(), 1000);
  }
}

/**
 * Handle view changes
 * @param {string} view - View name
 */
function handleViewChange(view) {
  setState('currentView', view);

  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Show selected view
  const targetView = document.getElementById(`${view}-view`);
  if (targetView) {
    targetView.classList.add('active');
  }
}

// Failsafe: Force hide splash screen after 10 seconds no matter what
setTimeout(() => {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    hideSplashScreen();
  }
}, 10000);

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
