import { findLibraryIcon, ICON_MATCHER_VERSION } from './IconLibraryProvider.js';
import { isSvgRaw } from './IconSanitizer.js';
import { normalizeIconBackground } from './IconBackground.js';

function customIconToModel(iconData) {
  const record = typeof iconData === 'string'
    ? { data: iconData, background: { mode: 'transparent' } }
    : iconData;
  const value = record?.data;
  if (!value) return null;

  return {
    type: record.kind || (isSvgRaw(value) ? 'svg' : 'image'),
    value,
    background: normalizeIconBackground(record.background),
    source: 'custom',
    sourceLabel: isSvgRaw(value) ? '自定义 SVG' : '自定义图片',
    matchReason: 'user-selected'
  };
}

function libraryIconToModel(icon) {
  return {
    type: icon.type || 'svg',
    value: icon.svg || icon.value,
    source: icon.source,
    sourceLabel: icon.sourceLabel,
    matchReason: icon.matchReason,
    matcherVersion: ICON_MATCHER_VERSION
  };
}

/**
 * Resolves only synchronous local sources. Site-declared image resources are
 * deliberately loaded later, once the card enters the viewport.
 */
export function resolveBookmarkIcon(bookmark, options = {}) {
  const storage = options.storage;
  const libraryLookup = options.findLibraryIcon || findLibraryIcon;
  const bookmarkId = bookmark?.id;

  if (bookmarkId && storage?.getCustomIcon) {
    const customIcon = customIconToModel(storage.getCustomIcon(bookmarkId));
    if (customIcon) return customIcon;
  }

  const libraryIcon = libraryLookup(bookmark);
  return libraryIcon ? libraryIconToModel(libraryIcon) : null;
}
