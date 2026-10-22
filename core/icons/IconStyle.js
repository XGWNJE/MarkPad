export const ICON_STYLE_KEY = 'bookmarkIconStyle';
export const ICON_STYLES = Object.freeze({ clay: '品牌软陶', flat: '彩色扁平' });

export function getIconStyle(storage = globalThis.localStorage) {
  const value = storage?.getItem(ICON_STYLE_KEY);
  return Object.hasOwn(ICON_STYLES, value) ? value : 'clay';
}

export function setIconStyle(value, storage = globalThis.localStorage) {
  if (!Object.hasOwn(ICON_STYLES, value)) return false;
  storage?.setItem(ICON_STYLE_KEY, value);
  return true;
}
