// Settings path data is copied from Lucide @lucide/icons v1.23.0 (ISC).
const ICONS = {
  'bookmark-plus': [
    '<path d="M7 4.75A2.25 2.25 0 0 1 9.25 2.5h5.5A2.25 2.25 0 0 1 17 4.75v15.5l-5-3-5 3V4.75Z"/>',
    '<path d="M15 7h4"/>',
    '<path d="M17 5v4"/>'
  ],
  'folder-plus': [
    '<path d="M3.5 7.25A2.25 2.25 0 0 1 5.75 5h4l2 2.25h6.5a2.25 2.25 0 0 1 2.25 2.25v7.75a2.25 2.25 0 0 1-2.25 2.25H5.75a2.25 2.25 0 0 1-2.25-2.25v-10Z"/>',
    '<path d="M12 11v5"/>',
    '<path d="M9.5 13.5h5"/>'
  ],
  menu: [
    '<path d="M5 7h14"/>',
    '<path d="M5 12h14"/>',
    '<path d="M5 17h14"/>'
  ],
  settings: [
    '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>',
    '<circle cx="12" cy="12" r="3"/>'
  ],
  x: [
    '<path d="m7 7 10 10"/>',
    '<path d="m17 7-10 10"/>'
  ],
  trash: [
    '<path d="M5 7h14"/>',
    '<path d="M10 11v5"/>',
    '<path d="M14 11v5"/>',
    '<path d="M8 7l1 12h6l1-12"/>',
    '<path d="M10 7V5h4v2"/>'
  ],
  folder: [
    '<path d="M3.5 7.25A2.25 2.25 0 0 1 5.75 5h4l2 2.25h6.5a2.25 2.25 0 0 1 2.25 2.25v7.75a2.25 2.25 0 0 1-2.25 2.25H5.75a2.25 2.25 0 0 1-2.25-2.25v-10Z"/>'
  ],
  bookmark: [
    '<path d="M7 4.75A2.25 2.25 0 0 1 9.25 2.5h5.5A2.25 2.25 0 0 1 17 4.75v15.5l-5-3-5 3V4.75Z"/>'
  ],
  grid: [
    '<rect x="4" y="4" width="6" height="6" rx="1.4"/>',
    '<rect x="14" y="4" width="6" height="6" rx="1.4"/>',
    '<rect x="4" y="14" width="6" height="6" rx="1.4"/>',
    '<rect x="14" y="14" width="6" height="6" rx="1.4"/>'
  ]
};

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function iconSvg(name, options = {}) {
  const paths = ICONS[name];
  if (!paths) {
    throw new Error(`Unknown icon: ${name}`);
  }

  const className = options.className || 'app-icon';
  const title = options.title ? `<title>${escapeAttribute(options.title)}</title>` : '';

  return [
    `<svg class="${escapeAttribute(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor"`,
    ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">',
    title,
    paths.join(''),
    '</svg>'
  ].join('');
}

export function setIcon(target, name, options = {}) {
  if (!target) return null;
  target.innerHTML = iconSvg(name, options);
  target.dataset.iconRendered = name;
  return target.firstElementChild;
}

export function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((target) => {
    setIcon(target, target.dataset.icon);
  });
}
