/**
 * Themes Dialog
 * Theme browser and selector with visual theme creator
 */

import { getById, getAll } from '../utils/dom.js';
import { showToast } from '../components/toast.js';
import { loadDialog } from '../utils/templateLoader.js';

let themeLoader = null;
let currentThemeFilter = 'all';
let currentSearchQuery = '';
let customThemeColors = {};
let selectedCategory = 'auto';

/**
 * Initialize themes dialog
 * @param {Object} themeLoaderInstance - Theme loader instance
 */
export async function initializeThemesDialog(themeLoaderInstance) {
  // Load the themes dialog template
  await loadDialog('themes', 'templates/dialogs/themes.html');

  themeLoader = themeLoaderInstance;

  // Initialize tab navigation
  initializeThemesTabs();

  // Initialize search input
  const searchInput = getById('theme-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase();
      populateThemesDialog();
    });
  }

  // Initialize filter buttons
  const filterButtons = getAll('.theme-filter-buttons .filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentThemeFilter = btn.dataset.category;
      populateThemesDialog();
    });
  });

  // Listen for dialog opened event
  window.addEventListener('dialogOpened', (e) => {
    if (e.detail.dialogName === 'themes') {
      populateThemesDialog();
    }
  });

  // Listen for theme refresh events
  window.addEventListener('themesRefreshed', () => {
    populateThemesDialog();
  });

  // Populate themes on initialization
  populateThemesDialog();
}

/**
 * Populate themes dialog with theme cards
 */
function populateThemesDialog() {
  const themesGrid = getById('themes-grid');
  if (!themesGrid || !themeLoader) return;

  const allThemes = themeLoader.getAvailableThemes();
  const currentTheme = themeLoader.getCurrentTheme();

  // Filter themes by category
  let filteredThemes = allThemes;
  if (currentThemeFilter !== 'all') {
    filteredThemes = filteredThemes.filter(theme => theme.category === currentThemeFilter);
  }

  // Filter themes by search query
  if (currentSearchQuery) {
    filteredThemes = filteredThemes.filter(theme =>
      theme.name.toLowerCase().includes(currentSearchQuery) ||
      theme.family.toLowerCase().includes(currentSearchQuery)
    );
  }

  // Clear grid
  themesGrid.innerHTML = '';

  // Show empty state if no themes match
  if (filteredThemes.length === 0) {
    themesGrid.innerHTML = `
      <div class="themes-grid-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <p>No themes found</p>
      </div>
    `;
    return;
  }

  // Populate themes grid
  filteredThemes.forEach(theme => {
    const themeCard = createThemeCard(theme, currentTheme);
    themesGrid.appendChild(themeCard);
  });

  // Update current theme name
  updateCurrentThemeName();
}

/**
 * Create a theme card element
 * @param {Object} theme - Theme object
 * @param {string} currentTheme - Current theme ID
 * @returns {HTMLElement} Theme card element
 */
function createThemeCard(theme, currentTheme) {
  const card = document.createElement('div');
  card.className = 'theme-card-new';
  card.dataset.theme = theme.id;
  if (theme.id === currentTheme) {
    card.classList.add('active');
  }

  const previewClass = `theme-preview-${theme.id}`;

  card.innerHTML = `
    <div class="theme-card-new-preview ${previewClass}">
      <div class="theme-preview-header"></div>
      <div class="theme-preview-body">
        <div class="theme-preview-sidebar"></div>
        <div class="theme-preview-main"></div>
      </div>
    </div>
    <span class="theme-card-new-label">${theme.name}</span>
    <svg class="theme-card-new-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;

  card.addEventListener('click', async () => {
    if (themeLoader) {
      await themeLoader.loadTheme(theme.id);
      populateThemesDialog();
    }
  });

  return card;
}

/**
 * Update current theme name display
 */
function updateCurrentThemeName() {
  const currentThemeName = getById('current-theme-name');
  if (currentThemeName && themeLoader) {
    const currentTheme = themeLoader.getCurrentTheme();
    const theme = themeLoader.getAvailableThemes().find(t => t.id === currentTheme);
    currentThemeName.textContent = theme ? theme.name : 'Unknown';
  }
}

/**
 * Initialize theme tabs navigation
 */
function initializeThemesTabs() {
  const tabButtons = getAll('[data-theme-tab]');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.themeTab;

      // Update active button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Update active tab content
      const tabs = getAll('#dialog-themes .settings-tab');
      tabs.forEach(tab => tab.classList.remove('active'));

      const targetTab = getById(`theme-tab-${tabName}`);
      if (targetTab) {
        targetTab.classList.add('active');

        // Initialize theme creator if opening that tab
        if (tabName === 'creator') {
          initializeThemeCreator();
        }
      }
    });
  });
}

/**
 * Initialize theme creator with color pickers
 */
function initializeThemeCreator() {
  // Define color groups
  const colorGroups = {
    'base-colors': [
      { name: 'Base', var: '--ctp-base', default: '#282a36' },
      { name: 'Mantle', var: '--ctp-mantle', default: '#21222c' },
      { name: 'Crust', var: '--ctp-crust', default: '#191a21' },
      { name: 'Surface 0', var: '--ctp-surface0', default: '#3e4153' },
      { name: 'Surface 1', var: '--ctp-surface1', default: '#4a4d5e' },
      { name: 'Surface 2', var: '--ctp-surface2', default: '#565869' }
    ],
    'text-colors': [
      { name: 'Text', var: '--ctp-text', default: '#f8f8f2' },
      { name: 'Subtext 1', var: '--ctp-subtext1', default: '#e6e6e1' },
      { name: 'Subtext 0', var: '--ctp-subtext0', default: '#d4d4ce' },
      { name: 'Overlay 2', var: '--ctp-overlay2', default: '#9ca3af' },
      { name: 'Overlay 1', var: '--ctp-overlay1', default: '#7b8394' },
      { name: 'Overlay 0', var: '--ctp-overlay0', default: '#6272a4' }
    ],
    'accent-colors': [
      { name: 'Mauve', var: '--ctp-mauve', default: '#bd93f9' },
      { name: 'Blue', var: '--ctp-blue', default: '#6272a4' },
      { name: 'Sapphire', var: '--ctp-sapphire', default: '#8be9fd' },
      { name: 'Sky', var: '--ctp-sky', default: '#8be9fd' },
      { name: 'Teal', var: '--ctp-teal', default: '#8be9fd' },
      { name: 'Lavender', var: '--ctp-lavender', default: '#bd93f9' }
    ],
    'semantic-colors': [
      { name: 'Red', var: '--ctp-red', default: '#ff5555' },
      { name: 'Maroon', var: '--ctp-maroon', default: '#ff6e6e' },
      { name: 'Peach', var: '--ctp-peach', default: '#ffb86c' },
      { name: 'Yellow', var: '--ctp-yellow', default: '#f1fa8c' },
      { name: 'Green', var: '--ctp-green', default: '#50fa7b' },
      { name: 'Pink', var: '--ctp-pink', default: '#ff79c6' }
    ]
  };

  // Initialize colors with defaults
  Object.keys(colorGroups).forEach(groupId => {
    colorGroups[groupId].forEach(color => {
      if (!customThemeColors[color.var]) {
        customThemeColors[color.var] = color.default;
      }
    });
  });

  // Render color pickers for each group
  Object.keys(colorGroups).forEach(groupId => {
    renderColorPickers(groupId, colorGroups[groupId]);
  });

  // Initialize category selection
  const categorySelect = getById('theme-category-select');
  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      selectedCategory = e.target.value;
      updateDetectedCategoryHint();
    });
  }

  // Initialize save button
  const saveBtn = getById('save-custom-theme-btn');
  if (saveBtn) {
    // Remove old listener if exists
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', saveCustomTheme);
  }

  // Initialize reset button
  const resetBtn = getById('reset-theme-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetThemeCreator);
  }

  // Update preview and detection hint
  updateThemePreview();
  updateDetectedCategoryHint();
}

/**
 * Render color pickers for a group
 * @param {string} containerId - Container element ID
 * @param {Array} colors - Array of color definitions
 */
function renderColorPickers(containerId, colors) {
  const container = getById(containerId);
  if (!container) return;

  container.innerHTML = colors.map(color => `
    <div class="color-picker-item">
      <label class="color-picker-label">${color.name}</label>
      <div class="color-picker-input-group">
        <input type="color" class="color-picker-input" data-var="${color.var}" value="${customThemeColors[color.var] || color.default}" />
        <input type="text" class="color-hex-input" data-var="${color.var}" value="${customThemeColors[color.var] || color.default}" maxlength="7" />
      </div>
    </div>
  `).join('');

  // Add event listeners
  const colorInputs = container.querySelectorAll('.color-picker-input');
  const hexInputs = container.querySelectorAll('.color-hex-input');

  colorInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      const varName = e.target.dataset.var;
      const color = e.target.value;
      customThemeColors[varName] = color;

      // Update corresponding hex input
      const hexInput = container.querySelector(`.color-hex-input[data-var="${varName}"]`);
      if (hexInput) hexInput.value = color;

      updateThemePreview();
      updateDetectedCategoryHint();
    });
  });

  hexInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      const varName = e.target.dataset.var;
      let color = e.target.value;

      // Validate hex color
      if (/^#[0-9A-F]{6}$/i.test(color)) {
        customThemeColors[varName] = color;

        // Update corresponding color input
        const colorInput = container.querySelector(`.color-picker-input[data-var="${varName}"]`);
        if (colorInput) colorInput.value = color;

        updateThemePreview();
        updateDetectedCategoryHint();
      }
    });
  });
}

/**
 * Update theme preview
 */
function updateThemePreview() {
  const previewContainer = getById('theme-preview');
  if (!previewContainer) return;

  const mainColors = [
    { name: 'Base', var: '--ctp-base' },
    { name: 'Text', var: '--ctp-text' },
    { name: 'Mauve', var: '--ctp-mauve' },
    { name: 'Red', var: '--ctp-red' },
    { name: 'Green', var: '--ctp-green' },
    { name: 'Blue', var: '--ctp-blue' }
  ];

  previewContainer.innerHTML = mainColors.map(color => `
    <div class="theme-preview-swatch">
      <div class="theme-preview-color" style="background-color: ${customThemeColors[color.var] || '#888'}"></div>
      <span class="theme-preview-name">${color.name}</span>
    </div>
  `).join('');
}

/**
 * Detect theme category from base color luminance
 * @returns {string} 'light' or 'dark'
 */
function detectThemeCategoryFromColors() {
  const baseColor = customThemeColors['--ctp-base'];
  if (!baseColor) return 'dark';

  // Parse hex color
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? 'light' : 'dark';
}

/**
 * Update the detected category hint
 */
function updateDetectedCategoryHint() {
  const hint = getById('detected-category-hint');
  const categorySelect = getById('theme-category-select');

  if (!hint || !categorySelect) return;

  const selection = categorySelect.value;

  if (selection === 'auto') {
    const detected = detectThemeCategoryFromColors();
    hint.innerHTML = `Detected as: <strong>${detected.charAt(0).toUpperCase() + detected.slice(1)}</strong>`;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

/**
 * Save custom theme directly to themes folder
 */
async function saveCustomTheme() {
  const themeNameInput = getById('custom-theme-name');
  const themeName = themeNameInput?.value.trim();

  if (!themeName) {
    showToast('Please enter a theme name before saving.', 'error');
    return;
  }

  // Get category preference
  const categorySelect = getById('theme-category-select');
  const categoryPreference = categorySelect?.value || 'auto';

  // Generate CSS content
  const cssContent = generateThemeCSS(themeName);

  try {
    // Save theme directly to themes folder via IPC
    const result = await window.electronAPI.saveCustomTheme({
      themeName,
      cssContent,
      category: categoryPreference
    });

    if (result.success) {
      showToast(
        `Theme saved successfully as ${result.category} theme. The theme is now available in the theme selector.`,
        'success',
        `Theme "${themeName}" Created`
      );

      // Reset form - clear input AFTER resetThemeCreator
      resetThemeCreator();
      themeNameInput.value = '';
      if (categorySelect) categorySelect.value = 'auto';

      // Refresh theme loader to include the new theme
      if (themeLoader && typeof themeLoader.refreshThemes === 'function') {
        await themeLoader.refreshThemes();
      }

      // Switch to browse tab and show the new theme
      const browseTabBtn = document.querySelector('[data-theme-tab="browse"]');
      if (browseTabBtn) {
        browseTabBtn.click();
      }
    } else {
      showToast(result.error || 'Failed to save theme', 'error', 'Save Error');
    }
  } catch (error) {
    showToast('An error occurred while saving the theme. Please try again.', 'error', 'Error');
  }
}

/**
 * Generate CSS content from custom colors
 * @param {string} themeName - Theme name
 * @returns {string} CSS content
 */
function generateThemeCSS(themeName) {
  let css = `/**
 * ${themeName}
 * Created with Project Launcher Theme Creator
 */

:root {
  /* Base Colors */\n`;

  Object.keys(customThemeColors).forEach(varName => {
    css += `  ${varName}: ${customThemeColors[varName]};\n`;
  });

  css += `}

/* Theme Metadata */
/* @theme-name: ${themeName} */
/* @theme-author: Custom */
/* @theme-category: dark */
/* @theme-description: Custom theme created with Theme Creator */
`;

  return css;
}

/**
 * Reset theme creator to defaults
 */
function resetThemeCreator() {
  customThemeColors = {};
  selectedCategory = 'auto';

  // Reset category select
  const categorySelect = getById('theme-category-select');
  if (categorySelect) {
    categorySelect.value = 'auto';
  }

  initializeThemeCreator();
}
