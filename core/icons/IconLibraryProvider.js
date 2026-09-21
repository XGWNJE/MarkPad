/**
 * Curated built-in bookmark icons.
 *
 * This list deliberately starts empty. Add a reviewed icon in a release by
 * placing its sanitized SVG and name terms here; automatic matching may only
 * inspect a bookmark title, never its URL, host, or path.
 */
export const CURATED_ICONS = Object.freeze([]);
export const ICON_MATCHER_VERSION = '2026-09-21-curated-title-only-v1';

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function matchesTitle(icon, title) {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return null;

  const terms = [icon.title, ...(icon.terms || [])]
    .map(term => String(term || '').trim())
    .filter(Boolean);
  const matchedTerm = terms.find(term => normalizedTitle.includes(normalize(term)));
  return matchedTerm || null;
}

function toCandidate(icon, matchedTerm, score = 1) {
  return {
    id: icon.id,
    slug: icon.slug || icon.id,
    title: icon.title,
    type: 'svg',
    svg: icon.svg,
    source: 'curated-library',
    sourceLabel: '内置图标库',
    confidence: score,
    matchReason: `title:${matchedTerm}`,
    matchDetails: [{
      source: 'title',
      sourceLabel: '书签名称',
      value: matchedTerm,
      matchType: '名称命中',
      score: Math.round(score * 100)
    }]
  };
}

export function findMatchingIcon(icons, title) {
  for (const icon of icons) {
    const matchedTerm = matchesTitle(icon, title);
    if (matchedTerm) return toCandidate(icon, matchedTerm);
  }
  return null;
}

export function findLibraryIcon(bookmark) {
  return findMatchingIcon(CURATED_ICONS, String(bookmark?.title || '').trim());
}

export function getLibraryIconCandidates(bookmark, options = {}) {
  const title = String(bookmark?.title || '').trim();
  const limit = options.limit || 48;
  const candidates = CURATED_ICONS
    .map(icon => {
      const matchedTerm = matchesTitle(icon, title);
      return matchedTerm ? toCandidate(icon, matchedTerm) : null;
    })
    .filter(Boolean)
    .slice(0, limit);

  return {
    signals: { title },
    queries: title ? [{ source: 'title', sourceLabel: '书签名称', value: title }] : [],
    candidates
  };
}

export function searchLibraryIcons() {
  return [];
}

export const iconLibraryStats = Object.freeze({
  source: 'curated-library',
  count: CURATED_ICONS.length,
  sources: [{ source: 'curated-library', sourceLabel: '内置图标库', count: CURATED_ICONS.length }]
});
