/**
 * Release Notes Dialog
 * Displays markdown release notes with Mermaid diagram support
 */

import { getById } from '../utils/dom.js';
import { loadDialog } from '../utils/templateLoader.js';
import { extractData } from '../utils/ipc-handler.js';

/**
 * Load mermaid library from local file
 */
let mermaidLoaded = false;
let mermaidLib = null;

async function loadMermaid() {
  if (mermaidLoaded && mermaidLib) {
    console.log('Mermaid already loaded, reusing instance');
    return mermaidLib;
  }

  console.log('Loading mermaid library from ./lib/mermaid.min.js');

  try {
    // Load from local lib folder (offline-compatible)
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './lib/mermaid.min.js';  // Local copy in renderer folder
      script.onload = () => {
        console.log('Mermaid script loaded successfully');
        resolve();
      };
      script.onerror = (err) => {
        console.error('Failed to load mermaid script from ./lib/mermaid.min.js', err);
        reject(err);
      };
      script.async = true;
      document.head.appendChild(script);
    });

    mermaidLib = window.mermaid;

    if (!mermaidLib) {
      throw new Error('Mermaid library loaded but window.mermaid is undefined');
    }

    console.log('Initializing mermaid...');
    // Initialize mermaid
    mermaidLib.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'var(--font-mono, monospace)',
    });

    mermaidLoaded = true;
    console.log('Mermaid initialized successfully');
    return mermaidLib;
  } catch (error) {
    console.error('Failed to load mermaid library:', error);
    return null;
  }
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
 * Load and render release notes with mermaid support
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

    // Fetch processed HTML from main process (markdown converted)
    const response = await window.electronAPI.readReleaseNotes();
    const htmlContent = extractData(response, 'html');

    // Render the HTML
    contentContainer.innerHTML = `<div class="markdown-content">${htmlContent}</div>`;

    // Load mermaid and render diagrams
    const mermaidElements = contentContainer.querySelectorAll('code.language-mermaid');

    if (mermaidElements.length > 0) {
      const mermaid = await loadMermaid();

      if (mermaid) {
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
            // Leave the code block as-is if rendering fails
          }
        }
      } else {
        console.warn('Mermaid library not available - diagrams shown as code');
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
