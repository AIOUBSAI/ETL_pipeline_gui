/**
 * Toast Notification Component
 * Displays temporary notification messages
 * Now extends ModalComponent to eliminate duplication
 */

import { escapeHtml } from '../utils/dom.js';
import { createIconString, IconNames } from '../utils/icons.js';
import { ModalComponent } from './modal-base.js';

/**
 * Toast Notification class
 */
class Toast extends ModalComponent {
  /**
   * @param {string} message - Toast message
   * @param {string} type - Toast type (info, success, error)
   * @param {string} title - Toast title (optional)
   * @param {boolean} autoClose - Auto close after 5 seconds
   */
  constructor(message, type = 'info', title = '', autoClose = true) {
    // Toast doesn't need overlay click or escape handlers (not modal-like)
    super({
      closeOnOverlayClick: false,
      closeOnEscape: false,
      animationDuration: 300
    });

    this.message = message;
    this.type = type;
    this.title = title;
    this.autoClose = autoClose;
    this.autoCloseTimer = null;
  }

  /**
   * Get icon and title based on type
   */
  getIconAndTitle() {
    let iconName = '';
    let defaultTitle = '';

    switch (this.type) {
      case 'success':
        iconName = IconNames.CHECK;
        defaultTitle = this.title || 'Success';
        break;
      case 'error':
        iconName = IconNames.X_CIRCLE;
        defaultTitle = this.title || 'Error';
        break;
      default:
        iconName = IconNames.INFO;
        defaultTitle = this.title || 'Information';
    }

    return { iconName, defaultTitle };
  }

  /**
   * Build toast content
   */
  buildContent() {
    // Toast doesn't use overlay, just a direct element
    this.overlay = document.createElement('div');
    this.overlay.className = `toast ${this.type}`;

    const { iconName, defaultTitle } = this.getIconAndTitle();
    const icon = createIconString(iconName, { size: 20 });
    const closeIcon = createIconString(IconNames.CLOSE, { size: 14 });

    this.overlay.innerHTML = `
      <div class="toast-header">
        <div class="toast-title">
          ${icon}
          <span>${escapeHtml(defaultTitle)}</span>
        </div>
        <button class="toast-close">
          ${closeIcon}
        </button>
      </div>
      <div class="toast-content">
        ${escapeHtml(this.message)}
      </div>
      <div class="toast-footer">
        <button class="btn btn-primary btn-sm toast-ok-btn">OK</button>
      </div>
    `;
  }

  /**
   * Setup button event listeners
   */
  setupButtonHandlers() {
    const closeBtn = this.overlay.querySelector('.toast-close');
    const okBtn = this.overlay.querySelector('.toast-ok-btn');

    closeBtn.addEventListener('click', () => this.handleClose());
    okBtn.addEventListener('click', () => this.handleClose());
  }

  /**
   * Handle toast close
   */
  handleClose() {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }

    // Use custom animation for toast
    if (this.overlay) {
      this.overlay.style.animation = 'notificationFadeOut 0.3s ease';
    }

    // Close after animation
    setTimeout(() => {
      this.destroy();
    }, this.options.animationDuration);
  }

  /**
   * Show the toast
   */
  display() {
    // Build content and show
    this.buildContent();
    this.setupButtonHandlers();

    // Toast shows directly without overlay animation
    document.body.appendChild(this.overlay);
    this.isOpen = true;

    // Setup auto-close
    if (this.autoClose) {
      this.autoCloseTimer = setTimeout(() => {
        this.handleClose();
      }, 5000);
    }
  }

  /**
   * Override destroy to clear auto-close timer
   */
  destroy() {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    super.destroy();
  }
}

/**
 * Show a toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type (info, success, error)
 * @param {string} title - Toast title (optional)
 * @param {boolean} autoClose - Auto close after 5 seconds
 */
export function showToast(message, type = 'info', title = '', autoClose = true) {
  const toast = new Toast(message, type, title, autoClose);
  toast.display();
}
