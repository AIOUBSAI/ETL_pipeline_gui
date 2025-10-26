/**
 * Template Loader Utility
 * Provides efficient HTML template loading for dialogs and components
 */

// Cache for loaded templates to avoid redundant fetches
const templateCache = new Map();

/**
 * Load an HTML template from a file
 * @param {string} templatePath - Path to the template file (relative to renderer/)
 * @param {boolean} useCache - Whether to use cached version (default: true)
 * @returns {Promise<string>} The template HTML content
 */
export async function loadTemplate(templatePath, useCache = true) {
  // Check cache first
  if (useCache && templateCache.has(templatePath)) {
    return templateCache.get(templatePath);
  }

  try {
    const response = await fetch(templatePath);

    if (!response.ok) {
      throw new Error(`Failed to load template: ${templatePath} (${response.status})`);
    }

    const html = await response.text();

    // Store in cache
    if (useCache) {
      templateCache.set(templatePath, html);
    }

    return html;
  } catch (error) {
    throw error;
  }
}

/**
 * Load and inject a dialog template into the document
 * @param {string} dialogName - Name of the dialog (e.g., 'settings', 'login')
 * @param {string} templatePath - Path to the template file
 * @returns {Promise<HTMLElement>} The injected dialog element
 */
export async function loadDialog(dialogName, templatePath) {
  const html = await loadTemplate(templatePath);

  // Inject into document body
  document.body.insertAdjacentHTML('beforeend', html);

  // Return the dialog element
  const dialogElement = document.getElementById(`dialog-${dialogName}`);

  if (!dialogElement) {
    throw new Error(`Dialog element #dialog-${dialogName} not found after template injection`);
  }

  return dialogElement;
}

/**
 * Preload multiple templates in parallel
 * @param {string[]} templatePaths - Array of template paths to preload
 * @returns {Promise<void>}
 */
export async function preloadTemplates(templatePaths) {
  await Promise.all(templatePaths.map(path => loadTemplate(path, true)));
}

/**
 * Clear the template cache
 * Useful for development or when templates need to be reloaded
 */
export function clearTemplateCache() {
  templateCache.clear();
}

/**
 * Check if a template is cached
 * @param {string} templatePath - Path to check
 * @returns {boolean}
 */
export function isTemplateCached(templatePath) {
  return templateCache.has(templatePath);
}
