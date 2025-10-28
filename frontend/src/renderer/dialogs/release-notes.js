/**
 * Release Notes Dialog
 * Displays markdown release notes with Mermaid diagram support
 */

import { getById } from '../utils/dom.js';
import { loadDialog } from '../utils/templateLoader.js';
import { extractData } from '../utils/ipc-handler.js';
import { marked } from '../../node_modules/marked/lib/marked.esm.js';
import mermaid from '../../node_modules/mermaid/dist/mermaid.esm.min.mjs';

/**
 * Initialize libraries
 */
function initializeLibraries() {
  // Configure marked options
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: true,
    mangle: false,
  });

  // Initialize mermaid
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'var(--font-mono, monospace)',
  });
}

/**
 * Initialize release notes dialog
 */
export async function initializeReleaseNotesDialog() {
  // Load the dialog template
  await loadDialog('release-notes', 'templates/dialogs/release-notes.html');

  // Listen for dialog opened event
  window.addEventListener('dialogOpened', async (e) => {
    if (e.detail.dialogName === 'release-notes') {
      await loadReleaseNotes();
    }
  });
}

/**
 * Load and render release notes
 */
async function loadReleaseNotes() {
  const contentContainer = getById('release-notes-content');
  if (!contentContainer) return;

  try {
    // Show loading state
    contentContainer.innerHTML = `
      <div class="release-notes-loading">
        <div class="spinner"></div>
        <p>Loading release notes...</p>
      </div>
    `;

    // Initialize libraries
    initializeLibraries();

    // Fetch markdown content from main process
    const response = await window.electronAPI.readReleaseNotes();
    const markdownContent = extractData(response, 'content');

    // Convert markdown to HTML
    let htmlContent = marked.parse(markdownContent);

    // Render the HTML
    contentContainer.innerHTML = `<div class="markdown-content">${htmlContent}</div>`;

    // Find and render mermaid diagrams
    const mermaidElements = contentContainer.querySelectorAll('code.language-mermaid');

    for (let i = 0; i < mermaidElements.length; i++) {
      const element = mermaidElements[i];
      const code = element.textContent;

      try {
        // Create a unique ID for this diagram
        const id = `mermaid-diagram-${i}`;

        // Render the mermaid diagram
        const { svg } = await mermaid.render(id, code);

        // Replace the code block with the rendered SVG
        const pre = element.parentElement;
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-diagram';
        wrapper.innerHTML = svg;
        pre.replaceWith(wrapper);
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        element.parentElement.innerHTML = `
          <div class="mermaid-error">
            <p>Failed to render diagram</p>
            <pre>${code}</pre>
          </div>
        `;
      }
    }

  } catch (error) {
    console.error('Failed to load release notes:', error);
    const errorMessage = error?.message || error || 'Unknown error occurred';
    contentContainer.innerHTML = `
      <div class="release-notes-error">
        <span data-icon="AlertTriangle" data-icon-size="48"></span>
        <h3>Failed to Load Release Notes</h3>
        <p>${errorMessage}</p>
      </div>
    `;
  }
}
