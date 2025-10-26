/**
 * Command Palette Component
 * Keyboard-driven command launcher with fuzzy search
 */

import { getState } from '../core/state.js';
import { loadDialog } from '../utils/templateLoader.js';
import { initializeIcons } from '../utils/icons.js';
import { getAllCommands, parseShortcut } from '../utils/command-registry.js';
import { showToast } from './toast.js';

class CommandPalette {
  constructor() {
    this.isOpen = false;
    this.selectedIndex = 0;
    this.allCommands = [];
    this.filteredCommands = [];
    this.inputElement = null;
    this.resultsElement = null;
    this.emptyElement = null;
  }

  /**
   * Initialize the command palette
   */
  async init() {
    // Load the command palette template
    await loadDialog('command-palette', 'templates/dialogs/command-palette.html');

    // Get DOM elements
    this.inputElement = document.getElementById('command-palette-input');
    this.resultsElement = document.getElementById('command-palette-results');
    this.emptyElement = document.getElementById('command-palette-empty');
    this.overlay = document.getElementById('dialog-command-palette');

    // Initialize commands
    this.buildCommandList();

    // Setup event listeners
    this.setupEventListeners();

    // Initialize icons
    initializeIcons();
  }

  /**
   * Build the list of all available commands
   * Now reads from the centralized command registry
   */
  buildCommandList() {
    // Get all commands from registry
    this.allCommands = getAllCommands();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Global keyboard shortcut (Ctrl/Cmd + K)
    document.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Input field events
    if (this.inputElement) {
      this.inputElement.addEventListener('input', () => {
        this.handleSearch();
      });

      this.inputElement.addEventListener('keydown', (e) => {
        this.handleKeyDown(e);
      });
    }

    // Close on overlay click
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      });
    }

    // Update commands when projects change
    document.addEventListener('projectsLoaded', () => {
      this.buildCommandList();
    });
  }

  /**
   * Handle keyboard navigation
   */
  handleKeyDown(e) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.close();
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.selectNext();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.selectPrevious();
        break;

      case 'Enter':
        e.preventDefault();
        this.executeSelected();
        break;
    }
  }

  /**
   * Handle search/filter
   */
  handleSearch() {
    const query = this.inputElement.value.toLowerCase().trim();

    if (!query) {
      this.filteredCommands = [...this.allCommands];
    } else {
      // Fuzzy search
      this.filteredCommands = this.allCommands.filter(cmd => {
        const searchText = `${cmd.title} ${cmd.description} ${cmd.keywords.join(' ')}`.toLowerCase();
        return searchText.includes(query);
      });
    }

    this.selectedIndex = 0;
    this.render();
  }

  /**
   * Render the command list
   */
  render() {
    if (this.filteredCommands.length === 0) {
      this.resultsElement.style.display = 'none';
      this.emptyElement.style.display = 'flex';
      return;
    }

    this.resultsElement.style.display = 'block';
    this.emptyElement.style.display = 'none';

    // Group by category
    const grouped = {};
    this.filteredCommands.forEach(cmd => {
      if (!grouped[cmd.category]) {
        grouped[cmd.category] = [];
      }
      grouped[cmd.category].push(cmd);
    });

    // Render sections
    let html = '';
    let globalIndex = 0;

    Object.entries(grouped).forEach(([category, commands]) => {
      html += `<div class="command-palette-section">`;
      html += `<div class="command-palette-section-title">${category}</div>`;

      commands.forEach(cmd => {
        const isSelected = globalIndex === this.selectedIndex;
        const shortcutBadge = cmd.shortcut ? `<div class="command-palette-item-shortcut">${this.formatShortcut(cmd.shortcut)}</div>` : '';
        html += `
          <button
            class="command-palette-item ${isSelected ? 'selected' : ''}"
            data-index="${globalIndex}"
            data-command-id="${cmd.id}"
          >
            <div class="command-palette-item-icon" data-icon="${cmd.icon}" data-icon-size="16"></div>
            <div class="command-palette-item-content">
              <div class="command-palette-item-title">${cmd.title}</div>
              <div class="command-palette-item-description">${cmd.description}</div>
            </div>
            ${shortcutBadge}
          </button>
        `;
        globalIndex++;
      });

      html += `</div>`;
    });

    this.resultsElement.innerHTML = html;

    // Initialize icons
    initializeIcons();

    // Add click handlers
    this.resultsElement.querySelectorAll('.command-palette-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.selectedIndex = index;
        this.executeSelected();
      });
    });

    // Scroll selected into view
    this.scrollToSelected();
  }

  /**
   * Select next command
   */
  selectNext() {
    if (this.filteredCommands.length === 0) return;

    this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
    this.render();
  }

  /**
   * Select previous command
   */
  selectPrevious() {
    if (this.filteredCommands.length === 0) return;

    this.selectedIndex = this.selectedIndex - 1;
    if (this.selectedIndex < 0) {
      this.selectedIndex = this.filteredCommands.length - 1;
    }
    this.render();
  }

  /**
   * Scroll selected item into view
   */
  scrollToSelected() {
    const selectedItem = this.resultsElement.querySelector('.command-palette-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }

  /**
   * Format keyboard shortcut for display
   * @param {string} shortcut - Shortcut string (e.g., "Ctrl+Shift+R")
   * @returns {string} Formatted shortcut HTML
   */
  formatShortcut(shortcut) {
    if (!shortcut) return '';

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    // Split shortcut into parts
    const parts = shortcut.split('+');

    // Replace Ctrl with Cmd on Mac, format each key
    const formatted = parts.map(part => {
      let key = part;
      if (isMac) {
        if (key === 'Ctrl') key = '⌘';
        else if (key === 'Shift') key = '⇧';
        else if (key === 'Alt') key = '⌥';
      }
      return `<kbd>${key}</kbd>`;
    }).join('');

    return formatted;
  }

  /**
   * Execute the selected command
   */
  executeSelected() {
    const selectedCommand = this.filteredCommands[this.selectedIndex];
    if (selectedCommand && selectedCommand.action) {
      this.close();
      setTimeout(() => {
        selectedCommand.action();
      }, 100);
    }
  }

  /**
   * Open the command palette
   */
  open() {
    if (this.isOpen) return;

    this.isOpen = true;
    this.overlay.classList.add('active');
    this.inputElement.value = '';
    this.filteredCommands = [...this.allCommands];
    this.selectedIndex = 0;

    // Rebuild commands to include latest projects
    this.buildCommandList();
    this.filteredCommands = [...this.allCommands];

    this.render();

    // Focus input
    setTimeout(() => {
      this.inputElement.focus();
    }, 50);
  }

  /**
   * Close the command palette
   */
  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.overlay.classList.remove('active');
    this.inputElement.value = '';
  }

  /**
   * Toggle the command palette
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
}

// Export singleton instance
export const commandPalette = new CommandPalette();

/**
 * Initialize the command palette
 */
export async function initializeCommandPalette() {
  await commandPalette.init();
}
