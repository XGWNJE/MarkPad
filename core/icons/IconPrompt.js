import { getIconStyle } from './IconStyle.js';

export function buildIconPrompt(title, style = getIconStyle(), kind = 'website') {
  const name = String(title || '新网站').trim().replace(/(?:https?|file):\/\/\S+/gi, 'new website');
  const material = style === 'flat'
    ? 'Clean flat color artwork, preferably editable SVG; a 256 × 256 PNG is acceptable when the tool only supports images. Preserve the supplied silhouette and original colors. Use solid flat fills, no gradients, extrusion, texture, lighting or shadow. Place the mark on a full square #f5f3ed background. For SVG: no external references, scripts, embedded images, fonts, filters or animation; convert lettering to paths.'
    : 'Transparent PNG with a real alpha channel. Preserve the supplied silhouette and original colors. Render as softly rounded matte polymer clay with a shallow, consistent thickness, a straight-on view, broad soft light from the upper left and a restrained attached shadow. Smooth fine-grained clay, no glossy plastic, glass, metallic surfaces or deep perspective. Keep interior holes transparent.';
  const identity = kind === 'folder'
    ? 'Use the attached MarkPad folder icon as the silhouette reference: a rounded gray-green #7c8b88 folder with one simple warm-sand #e6c58e badge that represents this folder name. Preserve the same folder body, tab, proportions and front view. Change only the badge; avoid added lettering.'
    : 'Use the attached clear official logo as the identity reference. Preserve its topology, number of parts, proportions and recognizable details. If no reliable logo is supplied, ask for a reference instead of inventing a brand mark.';
  return `Create ONE MarkPad bookmark icon for ${JSON.stringify(name)}.
${identity}
${material}
Square 256 × 256 canvas, centered composition. The mark's longest side occupies 72–76% of the canvas; preserve at least 12% empty space on every side. Keep details legible at 64px. No added app tile, pedestal, surrounding frame, caption, watermark, mockup, checkerboard or extra symbols. Include lettering only when it is part of the supplied brand mark.
Return only the single icon. Do not include website addresses, account information or query parameters.`;
}
