/**
 * Icon Utilities
 * Centralized icon rendering system using Lucide icons
 */

import { createElement } from '../../../node_modules/lucide/dist/esm/lucide.js';
import * as lucide from '../../../node_modules/lucide/dist/esm/lucide.js';

/**
 * Size presets matching the design system
 */
const SIZE_PRESETS = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48
};

/**
 * Default icon options matching theme style
 */
const DEFAULT_OPTIONS = {
  size: 16,
  strokeWidth: 2,
  color: 'currentColor'
};

/**
 * Convert icon data to SVG element
 * @param {Array} iconData - Lucide icon data [tag, attrs, children]
 * @param {Object} options - Icon options
 * @returns {SVGElement} SVG element
 */
function iconToSvg(iconData, options = {}) {
  // Clone the icon data to avoid modifying the original
  const [tag, defaultAttrs, children] = iconData;

  // Resolve size
  const size = typeof options.size === 'string'
    ? SIZE_PRESETS[options.size] || SIZE_PRESETS.md
    : options.size || DEFAULT_OPTIONS.size;

  // Merge attributes
  const attrs = {
    ...defaultAttrs,
    width: size,
    height: size,
    'stroke-width': options.strokeWidth || DEFAULT_OPTIONS.strokeWidth,
    stroke: options.color || DEFAULT_OPTIONS.color,
    fill: 'none'
  };

  if (options.class) {
    attrs.class = options.class;
  }

  // Create SVG element
  const svg = createElement([tag, attrs, children]);
  return svg;
}

/**
 * Render a Lucide icon into a DOM element
 * @param {HTMLElement} element - Target element
 * @param {string} iconName - Lucide icon name (e.g., 'Menu', 'X', 'Folder')
 * @param {Object} options - Icon options
 * @param {number|string} options.size - Size in pixels or preset name
 * @param {number} options.strokeWidth - Stroke width (default: 2)
 * @param {string} options.color - Icon color (default: 'currentColor')
 * @param {string} options.class - Additional CSS classes
 * @returns {boolean} - Success status
 */
export function renderIcon(element, iconName, options = {}) {
  if (!element) {
    return false;
  }

  // Get the icon from Lucide
  const iconData = lucide[iconName];

  if (!iconData) {
    return false;
  }

  try {
    // Generate SVG element
    const svg = iconToSvg(iconData, options);

    // Clear element and insert SVG
    element.innerHTML = '';
    element.appendChild(svg);

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Create and return an icon element as a string (for template literals)
 * @param {string} iconName - Lucide icon name
 * @param {Object} options - Icon options
 * @returns {string} - SVG string
 */
export function createIconString(iconName, options = {}) {
  const iconData = lucide[iconName];

  if (!iconData) {
    return '';
  }

  try {
    // Generate SVG element
    const svg = iconToSvg(iconData, options);

    // Convert to string
    return svg.outerHTML;
  } catch (error) {
    return '';
  }
}

/**
 * Initialize all icons in a container using data attributes
 * Looks for elements with data-icon attribute and renders icons
 * @param {HTMLElement} container - Container element (default: document)
 */
export function initializeIcons(container = document) {
  const iconElements = container.querySelectorAll('[data-icon]');

  iconElements.forEach(element => {
    const iconName = element.dataset.icon;
    const size = element.dataset.iconSize || element.dataset.size || 16;
    const strokeWidth = element.dataset.iconStroke || 2;
    const customClass = element.dataset.iconClass || '';

    renderIcon(element, iconName, {
      size: isNaN(size) ? size : Number(size),
      strokeWidth: Number(strokeWidth),
      class: customClass
    });
  });
}

/**
 * Update an icon in an existing element
 * @param {HTMLElement|string} elementOrId - Element or element ID
 * @param {string} iconName - New icon name
 * @param {Object} options - Icon options
 */
export function updateIcon(elementOrId, iconName, options = {}) {
  const element = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId;

  if (!element) {
    return false;
  }

  return renderIcon(element, iconName, options);
}

/**
 * Commonly used icon names mapped to Lucide names
 * Makes it easier to reference icons consistently
 */
export const IconNames = {
  // Navigation
  MENU: 'Menu',
  MORE_VERTICAL: 'MoreVertical',
  MORE_HORIZONTAL: 'MoreHorizontal',
  CHEVRON_LEFT: 'ChevronLeft',
  CHEVRON_RIGHT: 'ChevronRight',
  CHEVRON_UP: 'ChevronUp',
  CHEVRON_DOWN: 'ChevronDown',

  // Actions
  CLOSE: 'X',
  MINIMIZE: 'Minus',
  MAXIMIZE: 'Square',
  MAXIMIZE_2: 'Maximize2',
  PLAY: 'Play',
  STOP: 'Square',
  PAUSE: 'Pause',
  REFRESH: 'RefreshCw',
  RELOAD: 'RotateCw',
  SEARCH: 'Search',
  SETTINGS: 'Settings',
  EDIT: 'PencilLine',
  SAVE: 'Save',
  TRASH: 'Trash2',
  DOWNLOAD: 'Download',
  UPLOAD: 'Upload',
  COPY: 'Copy',
  CHECK: 'Check',

  // Files & Folders
  FOLDER: 'Folder',
  FOLDER_OPEN: 'FolderOpen',
  FILE: 'File',
  FILE_TEXT: 'FileText',
  FILE_CODE: 'FileCode',

  // Layout
  LAYOUT_DASHBOARD: 'LayoutDashboard',
  LAYOUT_GRID: 'LayoutGrid',
  SIDEBAR: 'PanelLeft',

  // Data
  DATABASE: 'Database',
  TABLE: 'Table',

  // Charts & Reports
  BAR_CHART: 'BarChart3',
  LINE_CHART: 'LineChart',
  PIE_CHART: 'PieChart',

  // Communication
  MAIL: 'Mail',
  MESSAGE: 'MessageSquare',
  BELL: 'Bell',

  // Users
  USER: 'User',
  USERS: 'Users',
  USER_PLUS: 'UserPlus',

  // Auth
  LOG_IN: 'LogIn',
  LOG_OUT: 'LogOut',
  LOCK: 'Lock',
  UNLOCK: 'Unlock',
  KEY: 'Key',

  // Status
  INFO: 'Info',
  CHECK_CIRCLE: 'CheckCircle2',
  X_CIRCLE: 'XCircle',
  ALERT_CIRCLE: 'AlertCircle',
  ALERT_TRIANGLE: 'AlertTriangle',
  HELP_CIRCLE: 'HelpCircle',

  // UI Elements
  CIRCLE: 'Circle',
  SQUARE: 'Square',

  // Theme & Appearance
  SUN: 'Sun',
  MOON: 'Moon',
  PALETTE: 'Palette',
  PAINTBRUSH: 'Paintbrush',
  DROPLET: 'Droplet',

  // Development
  CODE: 'Code2',
  TERMINAL: 'Terminal',
  BUG: 'Bug',
  PACKAGE: 'Package',
  BOXES: 'Boxes',
  PUZZLE: 'PuzzleIcon',

  // Books & Documentation
  BOOK: 'Book',
  BOOK_OPEN: 'BookOpen',
  GRADUATION_CAP: 'GraduationCap',

  // Misc
  HEART: 'Heart',
  STAR: 'Star',
  TAG: 'Tag',
  LINK: 'Link',
  EXTERNAL_LINK: 'ExternalLink',
  HOME: 'Home',
  GLOBE: 'Globe',
  CALENDAR: 'Calendar',
  CLOCK: 'Clock',
  MAP_PIN: 'MapPin'
};

/**
 * Get available icon names
 * @returns {string[]} Array of available Lucide icon names
 */
export function getAvailableIcons() {
  return Object.keys(lucide).filter(k => k !== 'createElement' && k !== 'icons' && typeof lucide[k] !== 'function');
}

/**
 * Check if an icon exists
 * @param {string} iconName - Icon name to check
 * @returns {boolean} True if icon exists
 */
export function iconExists(iconName) {
  return iconName in lucide && Array.isArray(lucide[iconName]);
}
