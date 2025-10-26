/**
 * Sidebar Component
 * Handles sidebar navigation and toggle
 */

import { getById, get, getAll } from '../utils/dom.js';
import { state, setState, getState } from '../core/state.js';
import { openDialog } from './dialog.js';
import { initializeIcons } from '../utils/icons.js';

// Define which views require admin access
const PROTECTED_VIEWS = ['editor', 'database', 'reports'];

/**
 * Initialize sidebar toggle
 */
export function initializeSidebarToggle() {
  const toggleBtn = getById('sidebar-toggle');
  const sidebar = get('.sidebar');
  const titleBarSidebarSection = getById('title-bar-sidebar-section');

  // Ensure initial state matches sidebarVisible (HTML starts with sidebar-collapsed)
  // This is a no-op if HTML already has the correct classes
  if (sidebar && titleBarSidebarSection) {
    const shouldBeCollapsed = !state.sidebarVisible;

    if (shouldBeCollapsed) {
      sidebar.classList.add('sidebar-collapsed');
      titleBarSidebarSection.classList.add('collapsed');
    } else {
      sidebar.classList.remove('sidebar-collapsed');
      titleBarSidebarSection.classList.remove('collapsed');
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const newVisibility = !state.sidebarVisible;
      setState('sidebarVisible', newVisibility);

      sidebar?.classList.toggle('sidebar-collapsed', !newVisibility);
      titleBarSidebarSection?.classList.toggle('collapsed', !newVisibility);
    });
  }
}

/**
 * Initialize sidebar navigation
 * @param {Function} onViewChange - Callback when view changes
 */
export function initializeNavigation(onViewChange) {
  // Initialize icons in sidebar
  const sidebar = get('.sidebar');
  if (sidebar) {
    initializeIcons(sidebar);
  }

  const navItems = getAll('.nav-item');

  // Update protected views visual state on initialization
  updateProtectedViewsState();

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;

      // Check if view requires admin access
      if (PROTECTED_VIEWS.includes(view)) {
        const isAdminLoggedIn = getState('isAdminLoggedIn');

        if (!isAdminLoggedIn) {
          // Store the requested view for after login
          sessionStorage.setItem('requestedView', view);
          // Show login dialog
          openDialog('login');
          return;
        }
      }

      // Update active nav item
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // Notify callback
      if (onViewChange) {
        onViewChange(view);
      }
    });
  });

  // Listen for successful admin login to navigate to requested view and unlock pages
  document.addEventListener('adminLoginSuccess', () => {
    // Update protected views to be enabled
    updateProtectedViewsState();

    const requestedView = sessionStorage.getItem('requestedView');
    if (requestedView) {
      sessionStorage.removeItem('requestedView');

      // Update active nav item
      navItems.forEach(nav => {
        nav.classList.remove('active');
        if (nav.dataset.view === requestedView) {
          nav.classList.add('active');
        }
      });

      // Navigate to the requested view
      if (onViewChange) {
        onViewChange(requestedView);
      }
    }
  });

  // Listen for logout to lock protected pages
  document.addEventListener('adminLogout', () => {
    updateProtectedViewsState();
  });
}

/**
 * Update the visual state of protected views based on login status
 */
function updateProtectedViewsState() {
  const navItems = getAll('.nav-item');
  const isAdminLoggedIn = getState('isAdminLoggedIn');

  navItems.forEach(item => {
    const view = item.dataset.view;
    if (PROTECTED_VIEWS.includes(view)) {
      if (isAdminLoggedIn) {
        // Enable protected view
        item.classList.remove('disabled');
        item.removeAttribute('disabled');
        item.style.opacity = '1';
        item.style.cursor = 'pointer';
      } else {
        // Disable protected view
        item.classList.add('disabled');
        item.setAttribute('disabled', 'true');
        item.style.opacity = '0.5';
        item.style.cursor = 'not-allowed';
      }
    }
  });
}

/**
 * Check if a view is protected
 * @param {string} view - View name
 * @returns {boolean} True if view requires admin access
 */
export function isProtectedView(view) {
  return PROTECTED_VIEWS.includes(view);
}
