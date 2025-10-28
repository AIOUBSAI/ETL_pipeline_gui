/**
 * Theme IPC Handlers
 * Handles custom theme import, export, and management
 */

const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { successResponse, errorResponse } = require('../utils/ipc-response');

/**
 * Get custom themes directory path (in userData/custom-themes folder)
 */
function getCustomThemesDir() {
  // Lazy-load app only when this function is called (at runtime)
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'custom-themes');
}

/**
 * Ensure custom themes directory exists
 */
async function ensureCustomThemesDir() {
  const customThemesDir = getCustomThemesDir();
  try {
    await fs.access(customThemesDir);
  } catch {
    await fs.mkdir(customThemesDir, { recursive: true });
  }
}

/**
 * Parse theme metadata from CSS file
 * @param {string} content - CSS file content
 * @returns {Object} Theme metadata
 */
function parseThemeMetadata(content) {
  const metadata = {
    name: 'Custom Theme',
    author: 'Unknown',
    category: 'dark',
    description: ''
  };

  // Extract metadata from comments
  const nameMatch = content.match(/\/\*\s*@theme-name:\s*(.+?)\s*\*\//);
  const authorMatch = content.match(/\/\*\s*@theme-author:\s*(.+?)\s*\*\//);
  const categoryMatch = content.match(/\/\*\s*@theme-category:\s*(.+?)\s*\*\//);
  const descMatch = content.match(/\/\*\s*@theme-description:\s*(.+?)\s*\*\//);

  if (nameMatch) metadata.name = nameMatch[1];
  if (authorMatch) metadata.author = authorMatch[1];
  if (categoryMatch) metadata.category = categoryMatch[1];
  if (descMatch) metadata.description = descMatch[1];

  return metadata;
}

/**
 * Validate theme CSS file
 * @param {string} content - CSS file content
 * @returns {Object} Validation result
 */
function validateThemeFile(content) {
  // Check for required CSS variables
  const requiredVars = [
    '--ctp-base',
    '--ctp-text',
    '--ctp-mauve',
    '--ctp-red',
    '--ctp-green'
  ];

  const missingVars = requiredVars.filter(varName => !content.includes(varName));

  if (missingVars.length > 0) {
    return {
      valid: false,
      error: `Missing required CSS variables: ${missingVars.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Extract primary colors for theme preview
 * @param {string} content - CSS file content
 * @returns {Object} Color values
 */
function extractColors(content) {
  const colors = {};

  const primaryMatch = content.match(/--ctp-mauve:\s*(#[0-9a-fA-F]{6}|rgba?\([^)]+\))/);
  const secondaryMatch = content.match(/--ctp-blue:\s*(#[0-9a-fA-F]{6}|rgba?\([^)]+\))/);

  if (primaryMatch) colors.primaryColor = primaryMatch[1];
  if (secondaryMatch) colors.secondaryColor = secondaryMatch[1];

  return colors;
}

/**
 * Calculate relative luminance of a color
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} Relative luminance (0-1)
 */
function calculateLuminance(r, g, b) {
  // Convert to 0-1 range
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  // Calculate relative luminance
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Auto-detect if theme is light or dark based on base color
 * @param {string} content - CSS file content
 * @returns {string} 'light' or 'dark'
 */
function detectThemeCategory(content) {
  // Extract --ctp-base color
  const baseMatch = content.match(/--ctp-base:\s*(#[0-9a-fA-F]{6}|rgba?\([^)]+\))/);

  if (!baseMatch) {
    // Fallback: check metadata
    const categoryMatch = content.match(/\/\*\s*@theme-category:\s*(.+?)\s*\*\//);
    return categoryMatch ? categoryMatch[1].trim() : 'dark';
  }

  const color = baseMatch[1];

  // Parse hex color
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const luminance = calculateLuminance(r, g, b);

    // If luminance > 0.5, it's a light theme
    return luminance > 0.5 ? 'light' : 'dark';
  }

  // Parse rgba/rgb color
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);

    const luminance = calculateLuminance(r, g, b);
    return luminance > 0.5 ? 'light' : 'dark';
  }

  // Default to dark
  return 'dark';
}

/**
 * Register theme IPC handlers
 */
function registerThemeHandlers() {
  // Select theme file
  ipcMain.handle('select-file', async (event, options) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        ...options
      });

      if (result.canceled) {
        return successResponse({ filePath: null, canceled: true });
      }

      return successResponse({ filePath: result.filePaths[0], canceled: false });
    } catch (error) {
      return errorResponse(error, { filePath: null, canceled: true });
    }
  });

  // Import custom theme
  ipcMain.handle('import-theme', async (_event, filePath) => {
    try {
      await ensureCustomThemesDir();

      // Read theme file
      const content = await fs.readFile(filePath, 'utf-8');

      // Validate theme
      const validation = validateThemeFile(content);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Parse metadata
      const metadata = parseThemeMetadata(content);
      const colors = extractColors(content);

      // Auto-detect theme category (light/dark)
      const detectedCategory = detectThemeCategory(content);

      // Override metadata category with detected one
      metadata.category = detectedCategory;

      // Generate safe filename from theme name
      const safeName = metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const themeId = safeName;
      const fileName = `${themeId}.css`;
      const customThemesDir = getCustomThemesDir();
      const destPath = path.join(customThemesDir, fileName);

      // Check if theme already exists
      try {
        await fs.access(destPath);
        throw new Error(`Theme "${metadata.name}" already exists. Please rename it or delete the existing one first.`);
      } catch (error) {
        // If it's not an ENOENT error, rethrow it
        if (error.code !== 'ENOENT' && !error.message.includes('already exists')) {
          throw error;
        }
        // File doesn't exist, proceed
      }

      // Update CSS content with detected category
      const updatedContent = content.replace(
        /\/\*\s*@theme-category:\s*.+?\s*\*\//,
        `/* @theme-category: ${detectedCategory} */`
      );

      // Write theme file
      await fs.writeFile(destPath, updatedContent || content);

      return successResponse({
        themeId,
        themeName: metadata.name,
        category: detectedCategory
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Get custom themes list - scans all CSS files in custom themes directory
  ipcMain.handle('get-custom-themes', async () => {
    try {
      await ensureCustomThemesDir();

      const customThemesDir = getCustomThemesDir();
      const files = await fs.readdir(customThemesDir);
      const cssFiles = files.filter(f => f.endsWith('.css'));

      const themes = await Promise.all(
        cssFiles.map(async (file) => {
          try {
            const filePath = path.join(customThemesDir, file);
            const content = await fs.readFile(filePath, 'utf-8');

            // Parse metadata from CSS
            const metadata = parseThemeMetadata(content);
            const colors = extractColors(content);
            const category = detectThemeCategory(content);

            // Generate theme ID from filename
            const themeId = path.basename(file, '.css');

            return {
              id: themeId,
              fileName: file,
              filePath: filePath, // Full absolute path for loading
              name: metadata.name,
              author: metadata.author,
              category: category,
              description: metadata.description,
              ...colors
            };
          } catch (error) {
            return null;
          }
        })
      );

      return successResponse({ themes: themes.filter(Boolean) });
    } catch (error) {
      return errorResponse(error, { themes: [] });
    }
  });

  // Apply custom theme (not needed anymore - theme loader will handle it)
  ipcMain.handle('apply-custom-theme', async (_event, themeId) => {
    try {
      const customThemesDir = getCustomThemesDir();
      const themePath = path.join(customThemesDir, `${themeId}.css`);

      // Check if theme exists
      await fs.access(themePath);

      return successResponse({ themeId });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Delete custom theme
  ipcMain.handle('delete-custom-theme', async (_event, themeId) => {
    try {
      const customThemesDir = getCustomThemesDir();
      const cssPath = path.join(customThemesDir, `${themeId}.css`);

      // Delete CSS file only (no more JSON metadata files)
      await fs.unlink(cssPath);

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Save theme directly to themes folder (from theme creator)
  ipcMain.handle('save-custom-theme', async (_event, { themeName, cssContent, category: categoryPreference }) => {
    try {
      await ensureCustomThemesDir();

      // Generate safe filename
      const safeName = themeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const themeId = safeName;
      const fileName = `${themeId}.css`;
      const customThemesDir = getCustomThemesDir();
      const destPath = path.join(customThemesDir, fileName);

      // Check if theme already exists
      try {
        await fs.access(destPath);
        throw new Error(`Theme "${themeName}" already exists. Please choose a different name.`);
      } catch (error) {
        // If it's not an ENOENT error, rethrow it
        if (error.code !== 'ENOENT' && !error.message.includes('already exists')) {
          throw error;
        }
        // File doesn't exist, proceed
      }

      // Determine final category
      let finalCategory;
      if (categoryPreference && categoryPreference !== 'auto') {
        // User manually selected a category
        finalCategory = categoryPreference;
      } else {
        // Auto-detect category from colors
        finalCategory = detectThemeCategory(cssContent);
      }

      // Update CSS content with final category
      const updatedContent = cssContent.replace(
        /\/\*\s*@theme-category:\s*.+?\s*\*\//,
        `/* @theme-category: ${finalCategory} */`
      );

      // Write theme file
      await fs.writeFile(destPath, updatedContent || cssContent);

      return successResponse({
        themeId,
        themeName,
        category: finalCategory
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Download theme template
  ipcMain.handle('download-theme-template', async () => {
    try {
      const result = await dialog.showSaveDialog({
        title: 'Save Theme Template',
        defaultPath: 'my-custom-theme.css',
        filters: [
          { name: 'CSS Files', extensions: ['css'] }
        ]
      });

      if (result.canceled) {
        return successResponse({ path: null, canceled: true });
      }

      // Read template from project root
      const templatePath = path.join(__dirname, '../../../theme-template.css');
      const templateContent = await fs.readFile(templatePath, 'utf-8');

      // Write to user-selected location
      await fs.writeFile(result.filePath, templateContent);

      return successResponse({ path: result.filePath, canceled: false });
    } catch (error) {
      return errorResponse(error, { path: null, canceled: true });
    }
  });

  // Load custom theme CSS content (for rendering in browser)
  ipcMain.handle('load-custom-theme-content', async (_event, filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return successResponse({ content });
    } catch (error) {
      return errorResponse(error, { content: '' });
    }
  });
}

module.exports = { registerThemeHandlers };
