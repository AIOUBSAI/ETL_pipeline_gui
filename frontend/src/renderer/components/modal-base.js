/**
 * Base Modal Component
 * Shared functionality for overlay-based modals (confirm, toast, dialog)
 * Eliminates ~80 lines of duplicated DOM manipulation and event handling
 */

/**
 * Base class for modal components with overlay
 */
export class ModalComponent {
  /**
   * @param {Object} options - Configuration options
   * @param {boolean} options.closeOnOverlayClick - Close modal when clicking overlay (default: true)
   * @param {boolean} options.closeOnEscape - Close modal on Escape key (default: true)
   * @param {Function} options.onClose - Callback when modal closes
   * @param {string} options.overlayClass - Custom CSS class for overlay
   * @param {number} options.animationDuration - Animation duration in ms (default: 300)
   */
  constructor(options = {}) {
    this.options = {
      closeOnOverlayClick: true,
      closeOnEscape: true,
      onClose: null,
      overlayClass: '',
      animationDuration: 300,
      ...options
    };

    this.overlay = null;
    this.content = null;
    this.isOpen = false;
    this.escapeHandler = null;
  }

  /**
   * Create and append overlay to DOM
   * @param {string} baseClass - Base CSS class for the overlay
   * @returns {HTMLElement} The created overlay element
   */
  createOverlay(baseClass = 'modal-overlay') {
    this.overlay = document.createElement('div');
    this.overlay.className = `${baseClass} ${this.options.overlayClass}`.trim();
    return this.overlay;
  }

  /**
   * Create content container
   * @param {string} baseClass - Base CSS class for content container
   * @returns {HTMLElement} The created content element
   */
  createContent(baseClass = 'modal-content') {
    this.content = document.createElement('div');
    this.content.className = baseClass;
    return this.content;
  }

  /**
   * Setup close event handlers
   */
  setupCloseHandlers() {
    // Close on overlay click
    if (this.options.closeOnOverlayClick && this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close(false);
        }
      });
    }

    // Close on Escape key
    if (this.options.closeOnEscape) {
      this.escapeHandler = (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close(false);
        }
      };
      document.addEventListener('keydown', this.escapeHandler);
    }
  }

  /**
   * Show the modal with animation
   */
  show() {
    if (!this.overlay) {
      console.error('Modal: overlay not created');
      return;
    }

    document.body.appendChild(this.overlay);
    this.isOpen = true;

    // Trigger animation after DOM insertion
    setTimeout(() => {
      this.overlay.classList.add('active');
    }, 10);
  }

  /**
   * Hide the modal with animation
   * @param {*} result - Result to pass to onClose callback
   */
  close(result) {
    if (!this.overlay || !this.isOpen) {
      return;
    }

    this.isOpen = false;
    this.overlay.classList.remove('active');

    // Remove from DOM after animation
    setTimeout(() => {
      this.destroy();

      // Call onClose callback if provided
      if (typeof this.options.onClose === 'function') {
        this.options.onClose(result);
      }
    }, this.options.animationDuration);
  }

  /**
   * Clean up modal and remove from DOM
   */
  destroy() {
    // Remove escape key handler
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }

    // Remove from DOM
    if (this.overlay && document.body.contains(this.overlay)) {
      document.body.removeChild(this.overlay);
    }

    this.overlay = null;
    this.content = null;
    this.isOpen = false;
  }

  /**
   * Focus an element inside the modal (for accessibility)
   * @param {string} selector - CSS selector for element to focus
   * @param {number} delay - Delay before focusing in ms (default: 100)
   */
  focusElement(selector, delay = 100) {
    setTimeout(() => {
      if (this.content) {
        const element = this.content.querySelector(selector);
        if (element) {
          element.focus();
        }
      }
    }, delay);
  }
}
