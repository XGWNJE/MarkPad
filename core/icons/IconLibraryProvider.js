import { BUILTIN_ICON_CATALOG } from './BuiltinIconCatalog.js';
import { getIconStyle } from './IconStyle.js';

export const CURATED_ICONS = BUILTIN_ICON_CATALOG;
export const ICON_MATCHER_VERSION = '2026-10-20-curated-title-only-v2';

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function matchesTitle(icon, title) {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return null;

  const terms = [icon.title, ...(icon.terms || [])]
    .map(term => String(term || '').trim())
    .filter(Boolean);
  const matchedTerms = terms.filter(term => icon.kind === 'folder'
    ? normalizedTitle === normalize(term)
    : normalizedTitle.includes(normalize(term)));
  matchedTerms.sort((a, b) => normalizedTitle.indexOf(normalize(a)) - normalizedTitle.indexOf(normalize(b)) || normalize(b).length - normalize(a).length);
  return matchedTerms[0] || null;
}

function matchingIcons(icons, title) {
  const normalizedTitle = normalize(title);
  return icons.map(icon => ({ icon, term: matchesTitle(icon, title) }))
    .filter(match => match.term)
    .sort((a, b) => normalizedTitle.indexOf(normalize(a.term)) - normalizedTitle.indexOf(normalize(b.term)) || normalize(b.term).length - normalize(a.term).length);
}

function toCandidate(icon, matchedTerm, style = getIconStyle()) {
  const selectedStyle = style === 'flat' ? 'flat' : 'clay';
  const flatValue = new URL(`../../assets/bookmark-icons/flat/${icon.id}.svg`, import.meta.url).href;
  return {
    id: icon.id,
    slug: icon.slug || icon.id,
    title: icon.title,
    type: icon.svg ? 'svg' : 'image',
    svg: icon.svg,
    value: icon.svg || (selectedStyle === 'flat' ? flatValue : new URL(`../../assets/bookmark-icons/clay/${icon.id}.png`, import.meta.url).href),
    fallbackValue: !icon.svg && selectedStyle === 'clay' ? flatValue : undefined,
    style: selectedStyle,
    kind: icon.kind,
    initialOnly: Boolean(icon.initialOnly),
    source: 'curated-library',
    sourceLabel: '内置图标库',
    confidence: 1,
    matchReason: matchedTerm ? `title:${matchedTerm}` : 'user-selected',
    matchDetails: matchedTerm ? [{
      source: 'title',
      sourceLabel: '书签名称',
      value: matchedTerm,
      matchType: '名称命中',
      score: 100
    }] : []
  };
}

export function findMatchingIcon(icons, title, options = {}) {
  const match = matchingIcons(icons, title)[0];
  return match ? toCandidate(match.icon, match.term, options.style) : null;
}

export function findLibraryIcon(bookmark, options = {}) {
  return findMatchingIcon(CURATED_ICONS.filter(icon => icon.kind === (options.kind || 'website')), String(bookmark?.title || '').trim(), options);
}

export function getLibraryIconById(id, options = {}) {
  const icon = CURATED_ICONS.find(item => item.id === id);
  return icon ? toCandidate(icon, null, options.style) : null;
}

export function getLibraryIconCandidates(bookmark, options = {}) {
  const title = String(bookmark?.title || '').trim();
  const limit = options.limit || 48;
  const candidates = matchingIcons(CURATED_ICONS.filter(icon => icon.kind === (options.kind || 'website')), title)
    .slice(0, limit)
    .map(match => toCandidate(match.icon, match.term, options.style));

  return {
    signals: { title },
    queries: title ? [{ source: 'title', sourceLabel: '书签名称', value: title }] : [],
    candidates
  };
}

export function searchLibraryIcons(query = '', options = {}) {
  const value = normalize(query);
  return CURATED_ICONS
    .filter(icon => !options.kind || icon.kind === options.kind)
    .filter(icon => !value || [icon.title, ...icon.terms].some(term => normalize(term).includes(value)))
    .slice(0, options.limit || CURATED_ICONS.length)
    .map(icon => toCandidate(icon, null, options.style));
}

export const iconLibraryStats = Object.freeze({
  source: 'curated-library',
  count: CURATED_ICONS.length,
  sources: [{ source: 'curated-library', sourceLabel: '内置图标库', count: CURATED_ICONS.length }]
});
