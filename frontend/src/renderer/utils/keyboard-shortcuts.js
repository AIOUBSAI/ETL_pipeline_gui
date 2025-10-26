/**
 * Global Keyboard Shortcuts Handler
 * Manages all keyboard shortcuts in the application
 * Now reads from centralized command registry
 */

import { getCommandsWithShortcuts, parseShortcut } from './command-registry.js';

/**
 * Initialize global keyboard shortcuts
 */
export function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    // Ignore shortcuts when typing in input fields
    const isTyping = e.target.tagName === 'INPUT' ||
                     e.target.tagName === 'TEXTAREA' ||
                     e.target.isContentEditable;

    // Special case: Allow Ctrl+K in input fields for command palette
    if (modifier && e.key === 'k' && isTyping) {
      // Command palette handles this
      return;
    }

    // Skip other shortcuts when typing
    if (isTyping && e.key !== 'Escape') {
      return;
    }

    // Get all commands with shortcuts from registry
    const commands = getCommandsWithShortcuts();

    // Check if any command matches the current key combination
    for (const command of commands) {
      const shortcut = parseShortcut(command.shortcut);
      if (!shortcut) continue;

      // Match the key and modifiers
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatch = shortcut.ctrl ? modifier : !modifier;
      const shiftMatch = shortcut.shift === e.shiftKey;
      const altMatch = shortcut.alt === e.altKey;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        command.action();
        return;
      }
    }

    // Escape: Close dialogs and menus
    if (e.key === 'Escape') {
      // Close active dialog
      const activeDialog = document.querySelector('.dialog-overlay.active');
      if (activeDialog) {
        const closeButton = activeDialog.querySelector('[data-close]');
        if (closeButton) {
          closeButton.click();
        }
      }

      // Close help menu
      const helpButton = document.getElementById('help-button');
      const helpMenu = document.getElementById('help-menu');
      if (helpButton?.classList.contains('active')) {
        helpButton.classList.remove('active');
        helpMenu?.classList.remove('active');
      }

      // Close dropdown menu
      const menuBtn = document.getElementById('menu-btn');
      const dropdownMenu = document.getElementById('dropdown-menu');
      if (menuBtn?.classList.contains('active')) {
        menuBtn.classList.remove('active');
        dropdownMenu?.classList.remove('active');
      }
    }
  });
}
