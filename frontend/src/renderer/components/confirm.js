/**
 * Confirmation Dialog Component
 * Displays a custom confirmation modal with OK/Cancel buttons
 */

import { escapeHtml } from '../utils/dom.js';
import { createIconString, IconNames } from '../utils/icons.js';

/**
 * Show a confirmation dialog
 * @param {string} message - Confirmation message
 * @param {Object} options - Options object
 * @param {string} options.title - Dialog title (default: "Confirm")
 * @param {string} options.confirmText - Confirm button text (default: "OK")
 * @param {string} options.cancelText - Cancel button text (default: "Cancel")
 * @param {string} options.type - Dialog type (info, warning, error, success) (default: "warning")
 * @returns {Promise<boolean>} - Promise that resolves to true if confirmed, false if cancelled
 */
export function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const {
      title = 'Confirm',
      confirmText = 'OK',
      cancelText = 'Cancel',
      type = 'warning'
    } = options;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    // Create dialog container
    const dialog = document.createElement('div');
    dialog.className = `confirm-dialog ${type}`;

    // Select icon based on type
    let iconName = '';
    switch (type) {
      case 'success':
        iconName = IconNames.CHECK;
        break;
      case 'error':
        iconName = IconNames.X_CIRCLE;
        break;
      case 'warning':
        iconName = IconNames.ALERT_TRIANGLE;
        break;
      default:
        iconName = IconNames.INFO;
    }

    const icon = createIconString(iconName, { size: 24 });

    dialog.innerHTML = `
      <div class="confirm-header">
        <div class="confirm-icon ${type}">
          ${icon}
        </div>
        <h3 class="confirm-title">${escapeHtml(title)}</h3>
      </div>
      <div class="confirm-content">
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="confirm-footer">
        <button class="btn btn-secondary confirm-cancel-btn" data-action="cancel">
          ${cancelText}
        </button>
        <button class="btn btn-primary confirm-ok-btn" data-action="confirm">
          ${confirmText}
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Add animation
    setTimeout(() => overlay.classList.add('active'), 10);

    const closeDialog = (confirmed) => {
      overlay.classList.remove('active');
      setTimeout(() => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      }, 300);
      resolve(confirmed);
    };

    // Button event listeners
    const confirmBtn = dialog.querySelector('.confirm-ok-btn');
    const cancelBtn = dialog.querySelector('.confirm-cancel-btn');

    confirmBtn.addEventListener('click', () => closeDialog(true));
    cancelBtn.addEventListener('click', () => closeDialog(false));

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog(false);
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeDialog(false);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Focus confirm button for accessibility
    setTimeout(() => confirmBtn.focus(), 100);
  });
}
