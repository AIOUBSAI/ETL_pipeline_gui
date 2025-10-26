/**
 * Simple Dialogs
 * Loads dialogs that don't need custom JavaScript logic
 */

import { loadDialog } from '../utils/templateLoader.js';

/**
 * Initialize simple dialogs (export, import, community, bug-report)
 */
export async function initializeSimpleDialogs() {
  // Load all simple dialog templates in parallel
  await Promise.all([
    loadDialog('export', 'templates/dialogs/export.html'),
    loadDialog('import', 'templates/dialogs/import.html'),
    loadDialog('community', 'templates/dialogs/community.html'),
    loadDialog('bug-report', 'templates/dialogs/bug-report.html')
  ]);
}
