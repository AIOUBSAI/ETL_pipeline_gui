/**
 * Command Registry
 * Central registry for all application commands
 * Used by both keyboard shortcuts and command palette
 */

import { openDialog } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { loadProjects } from '../views/dashboard/controls.js';
import { logoutAdmin } from '../dialogs/login.js';
import { getState, setState } from '../core/state.js';

/**
 * Command registry - single source of truth for all commands
 * Each command has:
 * - id: unique identifier
 * - title: display name
 * - description: what the command does
 * - icon: lucide icon name
 * - category: grouping for command palette
 * - keywords: search terms
 * - shortcut: keyboard shortcut (optional) - format: "Ctrl+Key" or "Ctrl+Shift+Key"
 * - action: function to execute
 * - condition: optional function to check if command is available
 */
export const commands = [
  // Dialog Commands
  {
    id: 'open-settings',
    title: 'Open Settings',
    description: 'Configure application settings',
    icon: 'Settings',
    category: 'Dialogs',
    keywords: ['settings', 'preferences', 'config', 'configure'],
    shortcut: 'Ctrl+,',
    action: () => {
      openDialog('settings');
    }
  },
  {
    id: 'open-themes',
    title: 'Change Theme',
    description: 'Browse and select themes',
    icon: 'Moon',
    category: 'Dialogs',
    keywords: ['theme', 'appearance', 'dark', 'light', 'colors'],
    shortcut: 'Ctrl+T',
    action: () => {
      openDialog('themes');
    }
  },
  {
    id: 'open-plugins',
    title: 'Manage Plugins',
    description: 'Install and manage plugins',
    icon: 'Package',
    category: 'Dialogs',
    keywords: ['plugins', 'extensions', 'addons'],
    shortcut: 'Ctrl+P',
    action: () => {
      openDialog('plugins');
    }
  },
  {
    id: 'open-keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'View all keyboard shortcuts',
    icon: 'Keyboard',
    category: 'Dialogs',
    keywords: ['keyboard', 'shortcuts', 'hotkeys', 'keys'],
    shortcut: 'Ctrl+/',
    action: () => {
      openDialog('keyboard-shortcuts');
    }
  },
  {
    id: 'open-bug-report',
    title: 'Report a Bug',
    description: 'Submit a bug report',
    icon: 'Bug',
    category: 'Dialogs',
    keywords: ['bug', 'report', 'issue', 'feedback'],
    action: () => {
      openDialog('bug-report');
    }
  },
  {
    id: 'open-release-notes',
    title: 'Release Notes',
    description: 'View release notes and changelog',
    icon: 'FileText',
    category: 'Dialogs',
    keywords: ['release', 'notes', 'changelog', 'updates', 'whats new'],
    action: () => {
      openDialog('release-notes');
    }
  },

  // View Navigation
  {
    id: 'view-dashboard',
    title: 'Go to Dashboard',
    description: 'Navigate to Dashboard view',
    icon: 'LayoutDashboard',
    category: 'Navigation',
    keywords: ['dashboard', 'view', 'navigate', 'home'],
    shortcut: 'Ctrl+1',
    action: () => {
      const button = document.querySelector('[data-view="dashboard"]');
      if (button) {
        button.click();
      }
    }
  },
  {
    id: 'view-editor',
    title: 'Go to Editor',
    description: 'Navigate to Editor view',
    icon: 'PencilLine',
    category: 'Navigation',
    keywords: ['editor', 'view', 'navigate', 'code'],
    shortcut: 'Ctrl+2',
    action: () => {
      const button = document.querySelector('[data-view="editor"]');
      if (button) {
        button.click();
      } else {
        showToast('Editor requires admin access', 'warning');
      }
    }
  },
  {
    id: 'view-database',
    title: 'Go to Database',
    description: 'Navigate to Database view',
    icon: 'Database',
    category: 'Navigation',
    keywords: ['database', 'view', 'navigate', 'db'],
    shortcut: 'Ctrl+3',
    action: () => {
      const button = document.querySelector('[data-view="database"]');
      if (button) {
        button.click();
      } else {
        showToast('Database requires admin access', 'warning');
      }
    }
  },
  {
    id: 'view-reports',
    title: 'Go to Reports',
    description: 'Navigate to Reports view',
    icon: 'BarChart3',
    category: 'Navigation',
    keywords: ['reports', 'view', 'navigate', 'analytics'],
    shortcut: 'Ctrl+4',
    action: () => {
      const button = document.querySelector('[data-view="reports"]');
      if (button) {
        button.click();
      } else {
        showToast('Reports requires admin access', 'warning');
      }
    }
  },
  {
    id: 'toggle-sidebar',
    title: 'Toggle Sidebar',
    description: 'Show/hide the sidebar',
    icon: 'Menu',
    category: 'Window',
    keywords: ['sidebar', 'toggle', 'menu'],
    shortcut: 'Ctrl+B',
    action: () => {
      document.getElementById('sidebar-toggle')?.click();
    }
  },

  // Project Commands
  {
    id: 'run-project',
    title: 'Run Project',
    description: 'Execute the selected project',
    icon: 'Play',
    category: 'Projects',
    keywords: ['run', 'execute', 'start', 'project'],
    shortcut: 'Ctrl+R',
    action: () => {
      const runBtn = document.getElementById('run-btn');
      if (runBtn && !runBtn.disabled) {
        runBtn.click();
        showToast('Starting project...', 'info');
      } else {
        showToast('No project selected', 'error');
      }
    }
  },
  {
    id: 'stop-project',
    title: 'Stop Project',
    description: 'Stop the running project',
    icon: 'Square',
    category: 'Projects',
    keywords: ['stop', 'kill', 'terminate', 'project'],
    shortcut: 'Ctrl+S',
    action: () => {
      const stopBtn = document.getElementById('stop-btn');
      if (stopBtn && !stopBtn.disabled) {
        stopBtn.click();
        showToast('Stopping project...', 'info');
      } else {
        showToast('No project running', 'error');
      }
    }
  },
  {
    id: 'reload-projects',
    title: 'Reload Projects',
    description: 'Refresh the project list',
    icon: 'RefreshCw',
    category: 'Projects',
    keywords: ['reload', 'refresh', 'rescan', 'projects'],
    shortcut: 'Ctrl+Shift+R',
    action: async () => {
      await loadProjects();
      showToast('Projects reloaded', 'success');
    }
  },

  // Log Commands - REMOVED: Not needed in command palette
  // Users can use UI buttons for these simple actions

  // Authentication
  {
    id: 'login',
    title: 'Login',
    description: 'Login as admin or user',
    icon: 'LogIn',
    category: 'Account',
    keywords: ['login', 'signin', 'auth'],
    action: () => {
      const currentUser = getState('currentUser');
      if (currentUser) {
        showToast('Already logged in', 'info');
      } else {
        openDialog('login');
      }
    }
  },
  {
    id: 'logout',
    title: 'Logout',
    description: 'Logout from current session',
    icon: 'LogOut',
    category: 'Account',
    keywords: ['logout', 'signout'],
    action: () => {
      const currentUser = getState('currentUser');
      if (currentUser) {
        logoutAdmin();
        showToast('Logged out successfully', 'info');
      } else {
        showToast('Not logged in', 'info');
      }
    }
  },

  // Help
  {
    id: 'toggle-help',
    title: 'Toggle Help Menu',
    description: 'Open/close help menu',
    icon: 'HelpCircle',
    category: 'Help',
    keywords: ['help', 'support', 'documentation'],
    shortcut: 'F1',
    action: () => {
      const helpButton = document.getElementById('help-button');
      const helpMenu = document.getElementById('help-menu');
      if (helpButton && helpMenu) {
        helpButton.classList.toggle('active');
        helpMenu.classList.toggle('active');
      }
    }
  }
];

/**
 * Get all commands
 * @returns {Array} All commands
 */
export function getAllCommands() {
  return commands.filter(cmd => {
    // Filter out commands with conditions that don't pass
    if (cmd.condition && !cmd.condition()) {
      return false;
    }
    return true;
  });
}

/**
 * Get command by ID
 * @param {string} id - Command ID
 * @returns {Object|null} Command or null if not found
 */
export function getCommandById(id) {
  return commands.find(cmd => cmd.id === id) || null;
}

/**
 * Execute a command by ID
 * @param {string} id - Command ID
 */
export function executeCommand(id) {
  const command = getCommandById(id);
  if (command && command.action) {
    command.action();
  }
}

/**
 * Get all commands with shortcuts
 * @returns {Array} Commands that have keyboard shortcuts
 */
export function getCommandsWithShortcuts() {
  return commands.filter(cmd => cmd.shortcut);
}

/**
 * Parse shortcut string into key components
 * @param {string} shortcut - Shortcut string (e.g., "Ctrl+Shift+R")
 * @returns {Object} Parsed shortcut info
 */
export function parseShortcut(shortcut) {
  if (!shortcut) return null;

  const parts = shortcut.split('+');
  const key = parts[parts.length - 1];
  const ctrl = parts.includes('Ctrl');
  const shift = parts.includes('Shift');
  const alt = parts.includes('Alt');

  return { key, ctrl, shift, alt };
}
