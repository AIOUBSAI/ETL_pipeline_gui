/**
 * Confirmation Dialog Component
 * Displays a custom confirmation modal with OK/Cancel buttons
 * Now extends ModalComponent to eliminate duplication
 */

import { escapeHtml } from '../utils/dom.js';
import { createIconString, IconNames } from '../utils/icons.js';
import { ModalComponent } from './modal-base.js';

/**
 * Confirmation Dialog class
 */
class ConfirmDialog extends ModalComponent {
  /**
   * @param {string} message - Confirmation message
   * @param {Object} options - Options object
   */
  constructor(message, options = {}) {
    const {
      title = 'Confirm',
      confirmText = 'OK',
      cancelText = 'Cancel',
      type = 'warning'
    } = options;

    // Initialize parent with modal options
    super({
      closeOnOverlayClick: true,
      closeOnEscape: true,
      animationDuration: 300
    });

    this.message = message;
    this.title = title;
    this.confirmText = confirmText;
    this.cancelText = cancelText;
    this.type = type;
    this.resolvePromise = null;
  }

  /**
   * Get icon name based on dialog type
   */
  getIconName() {
    switch (this.type) {
      case 'success':
        return IconNames.CHECK;
      case 'error':
        return IconNames.X_CIRCLE;
      case 'warning':
        return IconNames.ALERT_TRIANGLE;
      default:
        return IconNames.INFO;
    }
  }

  /**
   * Build dialog content
   */
  buildContent() {
    // Create overlay and content
    this.createOverlay('confirm-overlay');
    this.content = document.createElement('div');
    this.content.className = `confirm-dialog ${this.type}`;

    const icon = createIconString(this.getIconName(), { size: 24 });

    this.content.innerHTML = `
      <div class="confirm-header">
        <div class="confirm-icon ${this.type}">
          ${icon}
        </div>
        <h3 class="confirm-title">${escapeHtml(this.title)}</h3>
      </div>
      <div class="confirm-content">
        <p>${escapeHtml(this.message)}</p>
      </div>
      <div class="confirm-footer">
        <button class="btn btn-secondary confirm-cancel-btn" data-action="cancel">
          ${this.cancelText}
        </button>
        <button class="btn btn-primary confirm-ok-btn" data-action="confirm">
          ${this.confirmText}
        </button>
      </div>
    `;

    this.overlay.appendChild(this.content);
  }

  /**
   * Setup button event listeners
   */
  setupButtonHandlers() {
    const confirmBtn = this.content.querySelector('.confirm-ok-btn');
    const cancelBtn = this.content.querySelector('.confirm-cancel-btn');

    confirmBtn.addEventListener('click', () => this.handleClose(true));
    cancelBtn.addEventListener('click', () => this.handleClose(false));
  }

  /**
   * Handle dialog close with result
   */
  handleClose(confirmed) {
    if (this.resolvePromise) {
      this.resolvePromise(confirmed);
    }
    this.close(confirmed);
  }

  /**
   * Show the dialog and return a promise
   */
  showAsync() {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;

      // Build and show
      this.buildContent();
      this.setupCloseHandlers();
      this.setupButtonHandlers();
      this.show();

      // Focus confirm button for accessibility
      this.focusElement('.confirm-ok-btn', 100);
    });
  }
}

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
  const dialog = new ConfirmDialog(message, options);
  return dialog.showAsync();
}
