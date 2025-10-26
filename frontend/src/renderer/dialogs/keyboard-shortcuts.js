/**
 * Keyboard Shortcuts Dialog
 * Displays all available keyboard shortcuts in the application
 */

import { loadDialog } from '../utils/templateLoader.js';
import { initializeIcons } from '../utils/icons.js';

/**
 * Initialize keyboard shortcuts dialog
 */
export async function initializeKeyboardShortcutsDialog() {
  // Load the dialog template
  await loadDialog('keyboard-shortcuts', 'templates/dialogs/keyboard-shortcuts.html');

  // Listen for dialog opened event to update platform-specific keys
  window.addEventListener('dialogOpened', async (e) => {
    if (e.detail.dialogName === 'keyboard-shortcuts') {
      updatePlatformKeys();
    }
  });
}

/**
 * Update keyboard shortcuts to show platform-specific modifier keys
 */
function updatePlatformKeys() {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (isMac) {
    // Replace Ctrl with Cmd on macOS
    const allKeys = document.querySelectorAll('#keyboard-shortcuts-content .key');
    allKeys.forEach(key => {
      if (key.textContent.trim() === 'Ctrl') {
        key.textContent = 'Cmd';
      }
    });
  }

  // Re-initialize icons after DOM update
  initializeIcons(document.getElementById('keyboard-shortcuts-content'));
}
