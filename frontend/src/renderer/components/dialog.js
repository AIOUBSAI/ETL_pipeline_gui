/**
 * Dialog Component
 * Base dialog functionality
 */

import { getById, getAll } from '../utils/dom.js';

/**
 * Initialize all dialogs
 */
export function initializeDialogs() {
  // Close buttons
  const closeButtons = getAll('.dialog-close, [data-close]');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const dialogName = btn.dataset.close;
      if (dialogName) {
        closeDialog(dialogName);
      } else {
        const dialog = btn.closest('.dialog-overlay');
        if (dialog) {
          dialog.classList.remove('active');
        }
      }
    });
  });

  // Close dialog when clicking overlay
  const overlays = getAll('.dialog-overlay');
  overlays.forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });
}

/**
 * Open a dialog
 * @param {string} dialogName - Dialog name
 */
export function openDialog(dialogName) {
  const dialog = getById(`dialog-${dialogName}`);
  if (dialog) {
    dialog.classList.add('active');

    // Dispatch custom event for dialog-specific initialization
    window.dispatchEvent(new CustomEvent('dialogOpened', {
      detail: { dialogName }
    }));
  }
}

/**
 * Close a dialog
 * @param {string} dialogName - Dialog name
 */
export function closeDialog(dialogName) {
  const dialog = getById(`dialog-${dialogName}`);
  if (dialog) {
    dialog.classList.remove('active');
  }
}
