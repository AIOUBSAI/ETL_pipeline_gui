/**
 * Help Menu Component
 * Handles help menu display and actions
 */

import { getById, getAll } from '../utils/dom.js';
import { openDialog } from './dialog.js';
import { showToast } from './toast.js';
import { initializeIcons } from '../utils/icons.js';

/**
 * Initialize help menu
 */
export function initializeHelpMenu() {
  // Initialize icons in help menu
  const helpContainer = document.querySelector('.help-button-container');
  if (helpContainer) {
    initializeIcons(helpContainer);
  }

  const helpButton = getById('help-button');
  const helpMenu = getById('help-menu');
  const helpMenuItems = getAll('.help-menu-item');

  if (helpButton) {
    helpButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      helpButton.classList.toggle('active');
      helpMenu?.classList.toggle('active');
    });
  }

  // Close help menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.help-button-container')) {
      helpButton?.classList.remove('active');
      helpMenu?.classList.remove('active');
    }
  });

  // Handle help menu item clicks
  helpMenuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const action = item.dataset.action;
      handleHelpAction(action);
      helpButton?.classList.remove('active');
      helpMenu?.classList.remove('active');
    });
  });
}

/**
 * Handle help menu actions
 * @param {string} action - Action name
 */
function handleHelpAction(action) {
  switch (action) {
    case 'handbook':
      showToast('Opening handbook...', 'info');
      break;
    case 'keyboard-shortcuts':
      openDialog('keyboard-shortcuts');
      break;
    case 'documentation':
      showToast('Opening documentation...', 'info');
      break;
    case 'report-bug':
      openDialog('bug-report');
      break;
    case 'request-feature':
      showToast('Opening feature request form...', 'info');
      break;
    case 'submit-feedback':
      showToast('Opening feedback form...', 'info');
      break;
    case 'ask-community':
      openDialog('community');
      break;
    case 'support-forum':
      showToast('Opening support forum...', 'info');
      break;
    case 'release-notes':
      openDialog('release-notes');
      break;
    default:
  }
}
