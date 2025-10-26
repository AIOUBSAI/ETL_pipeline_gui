/**
 * Theme Loader Module
 * Manages dynamic theme loading and switching
 */

export class ThemeLoader {
  constructor() {
    this.currentTheme = null;
    this.themeLink = null;
    this.availableThemes = [];
    this.builtInThemes = [
      // Catppuccin Themes
      { id: 'catppuccin-latte', name: 'Catppuccin Latte', file: 'styles/themes/catppuccin-latte.css', category: 'light', family: 'catppuccin' },
      { id: 'catppuccin-frappe', name: 'Catppuccin Frappé', file: 'styles/themes/catppuccin-frappe.css', category: 'dark', family: 'catppuccin' },
      { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', file: 'styles/themes/catppuccin-mocha.css', category: 'dark', family: 'catppuccin' },
      { id: 'catppuccin-macchiato', name: 'Catppuccin Macchiato', file: 'styles/themes/catppuccin-macchiato.css', category: 'dark', family: 'catppuccin' },

      // Gruvbox Themes
      { id: 'gruvbox-light', name: 'Gruvbox Light', file: 'styles/themes/gruvbox-light.css', category: 'light', family: 'gruvbox' },
      { id: 'gruvbox-dark', name: 'Gruvbox Dark', file: 'styles/themes/gruvbox-dark.css', category: 'dark', family: 'gruvbox' },

      // Solarized Themes
      { id: 'solarized-light', name: 'Solarized Light', file: 'styles/themes/solarized-light.css', category: 'light', family: 'solarized' },
      { id: 'solarized-dark', name: 'Solarized Dark', file: 'styles/themes/solarized-dark.css', category: 'dark', family: 'solarized' },

      // Other Dark Themes
      { id: 'dracula', name: 'Dracula', file: 'styles/themes/dracula.css', category: 'dark', family: 'dracula' },
      { id: 'nord', name: 'Nord', file: 'styles/themes/nord.css', category: 'dark', family: 'nord' },
      { id: 'one-dark', name: 'One Dark', file: 'styles/themes/one-dark.css', category: 'dark', family: 'one' },
      { id: 'tokyo-night', name: 'Tokyo Night', file: 'styles/themes/tokyo-night.css', category: 'dark', family: 'tokyo' }
    ];
    this.defaultTheme = 'catppuccin-frappe';
  }

  async init() {
    // Load all themes (built-in + custom)
    await this.loadAllThemes();

    // Find the first link that points to a theme CSS file
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (let link of links) {
      if (link.href && link.href.includes('themes/')) {
        this.themeLink = link;
        break;
      }
    }

    // If no theme link found, create one
    if (!this.themeLink) {
      this.themeLink = document.createElement('link');
      this.themeLink.id = 'theme-stylesheet';
      this.themeLink.rel = 'stylesheet';
      document.head.appendChild(this.themeLink);
    }

    // Load saved theme or default
    const savedTheme = this.getSavedTheme();
    this.loadTheme(savedTheme || this.defaultTheme);
  }

  async loadAllThemes() {
    // Start with built-in themes
    this.availableThemes = [...this.builtInThemes];

    // Load custom themes from the backend (stored in userData)
    try {
      const customThemes = await window.electronAPI.getCustomThemes();

      // Add custom themes to available themes
      // Custom themes are stored with full file path from backend
      customThemes.forEach(theme => {
        this.availableThemes.push({
          id: theme.id,
          name: theme.name,
          file: theme.filePath, // Use full path from backend
          category: theme.category,
          family: 'custom',
          author: theme.author,
          description: theme.description,
          isCustom: true
        });
      });

    } catch (error) {
    }
  }

  async refreshThemes() {
    await this.loadAllThemes();
    // Dispatch event so dialogs can update
    window.dispatchEvent(new CustomEvent('themesRefreshed'));
  }

  async loadTheme(themeId) {
    let theme = this.availableThemes.find(t => t.id === themeId);

    if (!theme) {
      themeId = this.defaultTheme;
      theme = this.availableThemes.find(t => t.id === themeId);
    }

    // Handle custom themes differently (load content via IPC)
    if (theme.isCustom && theme.file) {
      try {
        const result = await window.electronAPI.loadCustomThemeContent(theme.file);
        if (result.success) {
          // Inject CSS directly as a style tag
          let customStyleTag = document.getElementById('custom-theme-style');
          if (!customStyleTag) {
            customStyleTag = document.createElement('style');
            customStyleTag.id = 'custom-theme-style';
            document.head.appendChild(customStyleTag);
          }
          customStyleTag.textContent = result.content;

          // Hide the regular theme link (not needed for custom themes)
          if (this.themeLink) {
            this.themeLink.href = '';
          }
        }
      } catch (error) {
        return;
      }
    } else {
      // Built-in theme - use regular link
      // Remove custom style tag if it exists
      const customStyleTag = document.getElementById('custom-theme-style');
      if (customStyleTag) {
        customStyleTag.remove();
      }

      // Update the theme link href
      this.themeLink.href = theme.file;
    }

    this.currentTheme = themeId;

    // Save the theme preference
    this.saveTheme(themeId);

    // Dispatch event for other components to react to theme change
    window.dispatchEvent(new CustomEvent('themeChanged', {
      detail: { themeId, themeName: theme.name }
    }));

  }

  getCurrentTheme() {
    return this.currentTheme;
  }

  getAvailableThemes() {
    return this.availableThemes;
  }

  getThemesByCategory(category) {
    return this.availableThemes.filter(t => t.category === category);
  }

  getLightThemes() {
    return this.getThemesByCategory('light');
  }

  getDarkThemes() {
    return this.getThemesByCategory('dark');
  }

  saveTheme(themeId) {
    try {
      localStorage.setItem('selectedTheme', themeId);
    } catch (e) {
    }
  }

  getSavedTheme() {
    try {
      return localStorage.getItem('selectedTheme');
    } catch (e) {
      return null;
    }
  }

  addCustomTheme(theme) {
    if (!theme.id || !theme.name || !theme.file) {
      return false;
    }

    const exists = this.availableThemes.some(t => t.id === theme.id);
    if (exists) {
      const index = this.availableThemes.findIndex(t => t.id === theme.id);
      this.availableThemes[index] = theme;
    } else {
      this.availableThemes.push(theme);
    }

    return true;
  }

  removeCustomTheme(themeId) {
    if (themeId === this.defaultTheme) {
      return false;
    }

    const index = this.availableThemes.findIndex(t => t.id === themeId);
    if (index === -1) {
      return false;
    }

    this.availableThemes.splice(index, 1);

    if (this.currentTheme === themeId) {
      this.loadTheme(this.defaultTheme);
    }

    return true;
  }
}
