/**
 * Dialog Component
 * Base dialog functionality for pre-existing HTML dialogs
 * Uses shared modal utilities from modal-base.js for consistent behavior
 */

import { getById, getAll } from '../utils/dom.js';

/**
 * Setup overlay click handler for a dialog element
 * Extracted from ModalComponent pattern for consistency
 * @param {HTMLElement} overlay - The dialog overlay element
 */
function setupOverlayClickHandler(overlay) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
}

/**
 * Setup close button handler for a dialog element
 * @param {HTMLElement} btn - The close button element
 */
function setupCloseButtonHandler(btn) {
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
}

/**
 * Initialize all dialogs
 * Sets up close handlers for all pre-existing dialog elements
 */
export function initializeDialogs() {
  // Close buttons
  const closeButtons = getAll('.dialog-close, [data-close]');
  closeButtons.forEach(btn => setupCloseButtonHandler(btn));

  // Close dialog when clicking overlay (consistent with ModalComponent)
  const overlays = getAll('.dialog-overlay');
  overlays.forEach(overlay => setupOverlayClickHandler(overlay));
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
