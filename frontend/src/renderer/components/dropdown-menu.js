/**
 * Dropdown Menu Component
 * Handles main dropdown menu in title bar
 */

import { getById, getAll } from '../utils/dom.js';
import { openDialog } from './dialog.js';
import { getState, subscribe } from '../core/state.js';
import { logoutAdmin } from '../dialogs/login.js';
import { initializeIcons } from '../utils/icons.js';

/**
 * Initialize dropdown menu
 */
export function initializeDropdownMenu() {
  // Initialize icons in dropdown menu
  const menuContainer = document.querySelector('.menu-container');
  if (menuContainer) {
    initializeIcons(menuContainer);
  }

  const menuBtn = getById('menu-btn');
  const dropdownMenu = getById('dropdown-menu');
  const dropdownItems = getAll('.dropdown-item');

  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdownMenu?.classList.toggle('active');
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-container')) {
      dropdownMenu?.classList.remove('active');
    }
  });

  // Handle dropdown item clicks
  dropdownItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const dialogName = item.dataset.dialog;
      const action = item.dataset.action;

      if (action === 'logout') {
        logoutAdmin();
      } else if (dialogName) {
        openDialog(dialogName);
      }

      dropdownMenu?.classList.remove('active');
    });
  });

  // Update admin status display
  updateAdminStatus();

  // Subscribe to login state changes
  subscribe('isAdminLoggedIn', () => {
    updateAdminStatus();
  });

  // Subscribe to current user changes
  subscribe('currentUser', () => {
    updateAdminStatus();
  });

  // Listen for user login success
  document.addEventListener('userLoginSuccess', () => {
    updateAdminStatus();
  });

  // Listen for admin login success
  document.addEventListener('adminLoginSuccess', () => {
    updateAdminStatus();
  });

  // Listen for logout
  document.addEventListener('adminLogout', () => {
    updateAdminStatus();
  });
}

/**
 * Update admin status in dropdown menu
 */
function updateAdminStatus() {
  const currentUser = getState('currentUser');
  const isAdminLoggedIn = getState('isAdminLoggedIn');
  const adminStatusItem = getById('admin-status-item');
  const loginItem = getById('login-menu-item');
  const logoutItem = getById('logout-menu-item');

  // Check if any user is logged in (admin or regular user)
  const isLoggedIn = currentUser !== null && currentUser !== undefined && currentUser !== '';

  if (isLoggedIn) {
    // Someone is logged in - show status and logout, hide login
    adminStatusItem?.classList.remove('hidden');
    logoutItem?.classList.remove('hidden');
    loginItem?.classList.add('hidden');

    // Update status text based on user type
    const statusText = adminStatusItem?.querySelector('span');
    if (statusText) {
      // Check currentUser value directly for more reliable status display
      if (currentUser === 'admin') {
        statusText.textContent = 'Logged in as Admin';
        statusText.style.color = 'var(--color-success)';
      } else if (currentUser === 'user') {
        statusText.textContent = 'Logged in as User';
        statusText.style.color = 'var(--color-warning, #e5c890)';
      } else {
        // Fallback for unexpected state
        statusText.textContent = `Logged in as ${currentUser}`;
        statusText.style.color = 'var(--color-text-secondary)';
      }
    }
  } else {
    // Nobody is logged in - hide status and logout, show login
    adminStatusItem?.classList.add('hidden');
    logoutItem?.classList.add('hidden');
    loginItem?.classList.remove('hidden');
  }
}
