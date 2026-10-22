import { findLibraryIcon, getLibraryIconById, ICON_MATCHER_VERSION } from './IconLibraryProvider.js';
import { isSvgRaw } from './IconSanitizer.js';
import { normalizeIconBackground } from './IconBackground.js';
import { normalizeIconScale } from './IconUploadProcessor.js';

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
    scale: normalizeIconScale(record.scale),
    source: 'custom',
    sourceLabel: isSvgRaw(value) ? '自定义 SVG' : '自定义图片',
    matchReason: 'user-selected'
  };
}

function libraryIconToModel(icon) {
  return {
    type: icon.type || 'svg',
    value: icon.svg || icon.value,
    fallbackValue: icon.fallbackValue,
    iconId: icon.id,
    style: icon.style,
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
    const record = storage.getCustomIcon(bookmarkId);
    if (record?.kind === 'builtin') {
      const selected = getLibraryIconById(record.iconId, options);
      if (selected) return { ...libraryIconToModel(selected), scale: normalizeIconScale(record.scale) };
    }
    const customIcon = customIconToModel(record);
    if (customIcon) return customIcon;
  }

  const libraryIcon = libraryLookup(bookmark, { ...options, kind: bookmark?.url ? 'website' : 'folder' });
  return libraryIcon ? libraryIconToModel(libraryIcon) : null;
}
