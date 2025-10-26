/**
 * Title Bar Component
 * Handles custom title bar controls and sidebar toggle
 */

import { getById } from '../utils/dom.js';
import { initializeIcons } from '../utils/icons.js';

/**
 * Initialize title bar controls
 */
export function initializeTitleBar() {
  // Initialize icons in the title bar
  const titleBar = document.querySelector('.title-bar');
  if (titleBar) {
    initializeIcons(titleBar);
  }

  const minimizeBtn = getById('minimize-btn');
  const maximizeBtn = getById('maximize-btn');
  const closeBtn = getById('close-btn');

  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.electronAPI?.minimizeWindow) {
        window.electronAPI.minimizeWindow();
      }
    });
  }

  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.electronAPI?.maximizeWindow) {
        window.electronAPI.maximizeWindow();
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.electronAPI?.closeWindow) {
        window.electronAPI.closeWindow();
      }
    });
  }
}
