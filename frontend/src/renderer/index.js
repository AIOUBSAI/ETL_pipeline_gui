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
import { InitializationManager, defineComponent } from './utils/init-manager.js';

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
  const initManager = new InitializationManager();
  const startTime = Date.now();

  // Define critical components (app fails if these fail)
  const criticalComponents = [
    defineComponent('Theme System', async () => {
      themeLoader = new ThemeLoader();
      await themeLoader.init();
    }, true),
  ];

  // Define optional components (app continues if these fail)
  const optionalComponents = [
    defineComponent('Title Bar', () => initializeTitleBar()),
    defineComponent('Sidebar Toggle', () => initializeSidebarToggle()),
    defineComponent('Navigation', () => initializeNavigation(handleViewChange)),
    defineComponent('Help Menu', () => initializeHelpMenu()),
    defineComponent('Dashboard View', () => initializeDashboard()),
    defineComponent('Pipeline View', async () => await initializePipelineView()),
    defineComponent('Settings Dialog', async () => await initializeSettingsDialog(themeLoader)),
    defineComponent('Themes Dialog', async () => await initializeThemesDialog(themeLoader)),
    defineComponent('Plugins Dialog', async () => await initializePluginsDialog(themeLoader)),
    defineComponent('Login Dialog', async () => await initializeLoginDialog()),
    defineComponent('Simple Dialogs', async () => await initializeSimpleDialogs()),
    defineComponent('Release Notes Dialog', async () => await initializeReleaseNotesDialog()),
    defineComponent('Keyboard Shortcuts Dialog', async () => await initializeKeyboardShortcutsDialog()),
    defineComponent('Command Palette', async () => await initializeCommandPalette()),
    defineComponent('Keyboard Shortcuts', () => initializeKeyboardShortcuts()),
    defineComponent('Dialog Close Buttons', () => initializeDialogs()),
    defineComponent('Notification Manager', async () => await notificationManager.init()),
    defineComponent('Sound Manager', async () => await soundManager.init()),
    defineComponent('Admin Session Check', () => checkAdminSession()),
    defineComponent('Dropdown Menu', () => initializeDropdownMenu()),
    defineComponent('Icons', () => initializeIcons()),
    defineComponent('Version Display', async () => await initializeVersionDisplay()),
    defineComponent('Settings Loader', async () => await loadSettings()),
    defineComponent('Project Loader', async () => await loadProjects()),
  ];

  // Initialize critical components first
  const criticalSuccess = await initManager.initializeComponents(criticalComponents, {
    stopOnCriticalFailure: true,
  });

  // If critical components failed, don't continue
  if (!criticalSuccess) {
    console.error('Critical component initialization failed. App cannot start.');
    return;
  }

  // Initialize optional components (don't stop on failures)
  await initManager.initializeComponents(optionalComponents, {
    stopOnCriticalFailure: false,
  });

  // Log initialization summary
  initManager.logSummary();

  // Calculate elapsed time and ensure minimum splash screen duration
  const elapsed = Date.now() - startTime;
  const minSplashDuration = 1000; // 1 second minimum
  const remainingTime = Math.max(0, minSplashDuration - elapsed);

  // Hide splash screen after minimum duration
  setTimeout(() => {
    hideSplashScreen();
  }, remainingTime);
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
