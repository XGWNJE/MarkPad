// Lucide paths: https://github.com/lucide-icons/lucide/tree/20aef31db93fe4d9f398dbb15b120d99c48eef95/icons
// ISC / MIT notices: ../vendor/lucide-LICENSE.txt. No runtime dependency.
const ICONS = {
  'bookmark-plus': [
    '<path d="M12 7v6"/>',
    '<path d="M15 10H9"/>',
    '<path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>'
  ],
  'folder-plus': [
    '<path d="M12 10v6"/>',
    '<path d="M9 13h6"/>',
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'
  ],
  menu: [
    '<path d="M4 5h16"/>',
    '<path d="M4 12h16"/>',
    '<path d="M4 19h16"/>'
  ],
  settings: [
    '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>',
    '<circle cx="12" cy="12" r="3"/>'
  ],
  x: [
    '<path d="M18 6 6 18"/>',
    '<path d="m6 6 12 12"/>'
  ],
  trash: [
    '<path d="M10 11v6"/>',
    '<path d="M14 11v6"/>',
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    '<path d="M3 6h18"/>',
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
  ],
  folder: [
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'
  ],
  bookmark: [
    '<path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>'
  ],
  grid: [
    '<path d="M12 3v18"/>',
    '<path d="M3 12h18"/>',
    '<rect x="3" y="3" width="18" height="18" rx="2"/>'
  ],
  pencil: [
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    '<path d="m15 5 4 4"/>'
  ],
  'folder-input': [
    '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/>',
    '<path d="M2 13h10"/>',
    '<path d="m9 16 3-3-3-3"/>'
  ],
  image: [
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
    '<circle cx="9" cy="9" r="2"/>',
    '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
  ],
  'sliders-horizontal': [
    '<path d="M10 5H3"/>',
    '<path d="M12 19H3"/>',
    '<path d="M14 3v4"/>',
    '<path d="M16 17v4"/>',
    '<path d="M21 12h-9"/>',
    '<path d="M21 19h-5"/>',
    '<path d="M21 5h-7"/>',
    '<path d="M8 10v4"/>',
    '<path d="M8 12H3"/>'
  ],
  'rotate-ccw': [
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>',
    '<path d="M3 3v5h5"/>'
  ],
  'refresh-cw': [
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>',
    '<path d="M21 3v5h-5"/>',
    '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>',
    '<path d="M8 16H3v5"/>'
  ]
};

Object.assign(ICONS, Object.fromEntries(Object.entries({
  "plus": "<path d=\"M5 12h14\" /><path d=\"M12 5v14\" />",
  "check": "<path d=\"M20 6 9 17l-5-5\" />",
  "square-check": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /><path d=\"m16 9-5.5 5.5L8 12\" />",
  "ellipsis": "<circle cx=\"12\" cy=\"12\" r=\"1\" /><circle cx=\"19\" cy=\"12\" r=\"1\" /><circle cx=\"5\" cy=\"12\" r=\"1\" />",
  "circle-question-mark": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\" /><path d=\"M12 17h.01\" />",
  "chevron-left": "<path d=\"m15 18-6-6 6-6\" />",
  "chevron-right": "<path d=\"m9 18 6-6-6-6\" />",
  "arrow-up-from-line": "<path d=\"m18 9-6-6-6 6\" /><path d=\"M12 3v14\" /><path d=\"M5 21h14\" />",
  "copy": "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\" /><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\" />"
}).map(([name, paths]) => [name, [paths]])));

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
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">',
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
