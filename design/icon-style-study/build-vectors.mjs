import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { sanitizeSvg } from '../../core/icons/IconSanitizer.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require(process.env.MARKPAD_SHARP_PATH || 'sharp'); }
catch { sharp = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')); }
const samples = [
  ['chatgpt', 'ChatGPT', '对话与推理', 'AI'],
  ['deepseek', 'DeepSeek', '深入检索', 'AI'],
  ['huggingface', 'Hugging Face', '模型协作', 'AI'],
  ['github', 'GitHub', '代码与分支', '开发'],
  ['figma', 'Figma', '设计与协作', '设计'],
  ['bilibili', 'BiliBili', '视频社区', '视频'],
  ['youtube', 'YouTube', '视频播放', '视频'],
  ['123pan', '123云盘', '云端存储', '工具'],
  ['gmail', 'Gmail', '轻量收信', '邮箱'],
  ['outlook', 'Outlook', '邮件与日程', '邮箱'],
  ['tencentcloud', '腾讯云', '云服务与计算', '工具'],
  ['visionguard', 'VisionGuard 控制台', '视觉与监测', '自用'],
  ['archive', '长期留存', '归档收藏', '文件夹'],
  ['share', '分享', '资源与分享', '文件夹'],
  ['visual', '视觉', '创作与灵感', '文件夹'],
].map(([id, title, meaning, group]) => ({ id, title, meaning, group }));

const styles = [
  { id: 'A', name: '品牌彩色扁平', short: '原色 · 平面', route: '保留品牌', material: '干净色块 / 统一留白', format: 'SVG', folder: 'a-brand-flat', colors: ['#111111', '#4285f4', '#f7c84b'] },
  { id: 'B', name: '品牌单色浮雕', short: '石白 · 浮雕', route: '保留品牌', material: '中性石色 / 轻浮雕', format: 'SVG', folder: 'b-brand-relief', colors: ['#716c63', '#c7c1b6', '#efebe3'] },
  { id: 'C', name: '原创双色几何', short: '松绿 · 杏橙', route: '原创语义', material: '几何轮廓 / 双色点睛', format: 'SVG', folder: 'c-original-duotone', colors: ['#255e59', '#ed996d', '#edf0e9'] },
  { id: 'D', name: '原创柔和立体', short: '海盐 · 轻立体', route: '原创语义', material: '圆润形体 / 柔光渐变', format: 'SVG', folder: 'd-original-soft', colors: ['#477e8a', '#c4e3df', '#f6b78b'] },
  { id: 'E', name: '品牌软陶材质', short: '原色 · 软陶', route: '保留品牌', material: '哑光软陶 / 柔和投影', format: 'PNG', folder: 'e-brand-clay', colors: ['#517bd1', '#f3bb74', '#ece3d7'] },
  { id: 'F', name: '原创磨砂玻璃', short: '青绿 · 透光', route: '原创语义', material: '磨砂透光 / 橙色点睛', format: 'PNG', folder: 'f-original-glass', colors: ['#9acfc9', '#e9a777', '#d8eeeb'] },
];

const primitive = {
  chatgpt: '<path fill="P" d="M8 14a7 7 0 0 1 7-7h28a7 7 0 0 1 7 7v18a7 7 0 0 1-7 7H27L15 48v-9a7 7 0 0 1-7-7Z"/><path fill="S" d="M32 27h16a8 8 0 0 1 8 8v12h-7v8l-11-8h-6a8 8 0 0 1-8-8v-4a8 8 0 0 1 8-8Z"/><path fill="W" d="m28 14 2.3 5.7L36 22l-5.7 2.3L28 30l-2.3-5.7L20 22l5.7-2.3Z"/>',
  deepseek: '<path fill="P" d="M29 7a20 20 0 1 0 0 40A20 20 0 0 0 29 7Zm0 8a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z" fill-rule="evenodd"/><path d="m43 43 13 13" stroke="P" stroke-width="9" stroke-linecap="round"/><path d="M22 28c3-7 10-7 14-2M22 33c4-3 9-2 12 1" fill="none" stroke="S" stroke-width="4" stroke-linecap="round"/><circle cx="31" cy="23" r="3" fill="S"/>',
  huggingface: '<path d="M18 19 44 17 32 45Z" fill="none" stroke="P" stroke-width="5" stroke-linejoin="round"/><circle cx="18" cy="19" r="11" fill="P"/><circle cx="44" cy="17" r="10" fill="S"/><circle cx="32" cy="45" r="12" fill="P"/><path d="m26 44 4 4 8-8" fill="none" stroke="W" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  github: '<path d="m18 13-10 12 10 12M46 27l10 12-10 12" fill="none" stroke="P" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 13v18c0 9 11 4 11 12" fill="none" stroke="P" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="12" r="6" fill="S"/><circle cx="43" cy="49" r="6" fill="S"/><circle cx="32" cy="33" r="4" fill="P"/>',
  figma: '<path d="m14 42 8-19 23-12 9 9-13 23-19 8Z" fill="P"/><path d="m22 23 19 20M16 49l15-15" fill="none" stroke="W" stroke-width="3" stroke-linecap="round"/><circle cx="35" cy="29" r="4" fill="S"/><rect x="7" y="48" width="10" height="10" rx="3" fill="S"/>',
  bilibili: '<path d="m21 13-6-7m28 7 6-7" fill="none" stroke="P" stroke-width="4" stroke-linecap="round"/><rect x="7" y="15" width="50" height="38" rx="11" fill="P"/><rect x="14" y="22" width="36" height="24" rx="5" fill="W"/><path d="m22 29 3 6m14-6-3 6" stroke="P" stroke-width="3.5" stroke-linecap="round"/><path d="M24 53v4m16-4v4" stroke="S" stroke-width="5" stroke-linecap="round"/>',
  youtube: '<circle cx="32" cy="32" r="25" fill="P"/><path d="m27 20 18 12-18 12Z" fill="S"/><path d="M16 52h32" stroke="S" stroke-width="4" stroke-linecap="round"/>',
  '123pan': '<path fill="P" d="M16 43a13 13 0 0 1-1-26 17 17 0 0 1 32 0 13 13 0 0 1 0 26Z"/><path d="M22 39h20M22 46h20M22 53h20" stroke="S" stroke-width="5" stroke-linecap="round"/><path d="M31 18v13m-5-5 5 5 5-5" fill="none" stroke="W" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  gmail: '<rect x="7" y="17" width="50" height="34" rx="7" fill="P"/><path d="m8 23 24 17 24-17" fill="none" stroke="W" stroke-width="3.5" stroke-linejoin="round"/><path fill="S" d="m46 5 2.5 6.5L55 14l-6.5 2.5L46 23l-2.5-6.5L37 14l6.5-2.5Z"/>',
  outlook: '<rect x="8" y="12" width="40" height="42" rx="7" fill="P"/><path d="M8 24h40" stroke="W" stroke-width="3"/><path d="M19 7v10M37 7v10" stroke="S" stroke-width="5" stroke-linecap="round"/><circle cx="44" cy="43" r="14" fill="S"/><path d="M44 35v9l6 3" fill="none" stroke="P" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  tencentcloud: '<path fill="P" d="M17 39a13 13 0 0 1-1-26 17 17 0 0 1 31 1 12 12 0 0 1 0 25Z"/><rect x="18" y="32" width="29" height="10" rx="3" fill="S"/><rect x="18" y="46" width="29" height="10" rx="3" fill="S"/><circle cx="24" cy="37" r="2" fill="P"/><circle cx="24" cy="51" r="2" fill="P"/><path d="M31 37h9M31 51h9" stroke="P" stroke-width="2" stroke-linecap="round"/>',
  visionguard: '<path d="M8 20V8h12m24 0h12v12m0 24v12H44m-24 0H8V44" fill="none" stroke="P" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="21" r="8" fill="P"/><path d="M18 49a14 14 0 0 1 28 0Z" fill="P"/><path d="M6 34h52" stroke="S" stroke-width="5" stroke-linecap="round"/>',
  archive: '<path fill="P" d="M7 14a6 6 0 0 1 6-6h13l7 7h18a6 6 0 0 1 6 6v29a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6Z"/><rect x="17" y="25" width="30" height="23" rx="4" fill="S"/><path d="M17 30h30M28 36h8" stroke="P" stroke-width="3" stroke-linecap="round"/>',
  share: '<path fill="P" d="M7 14a6 6 0 0 1 6-6h13l7 7h18a6 6 0 0 1 6 6v29a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6Z"/><path d="m24 36 19-9m-19 9 19 10" stroke="S" stroke-width="3"/><circle cx="22" cy="36" r="5" fill="S"/><circle cx="44" cy="26" r="5" fill="S"/><circle cx="44" cy="47" r="5" fill="S"/>',
  visual: '<path fill="P" d="M7 14a6 6 0 0 1 6-6h13l7 7h18a6 6 0 0 1 6 6v29a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6Z"/><circle cx="40" cy="29" r="5" fill="S"/><path fill="S" d="m16 47 11-15 8 10 5-6 8 11Z"/>',
};

function figma() {
  return '<svg viewBox="0 0 38 57"><path d="M19 38H9.5a9.5 9.5 0 0 0 0 19A9.5 9.5 0 0 0 19 47.5Z" fill="#0ACF83"/><path d="M0 28.5a9.5 9.5 0 0 1 9.5-9.5H19v19H9.5A9.5 9.5 0 0 1 0 28.5Z" fill="#A259FF"/><path d="M0 9.5A9.5 9.5 0 0 1 9.5 0H19v19H9.5A9.5 9.5 0 0 1 0 9.5Z" fill="#F24E1E"/><path d="M19 0h9.5a9.5 9.5 0 0 1 0 19H19Z" fill="#FF7262"/><circle cx="28.5" cy="28.5" r="9.5" fill="#1ABCFE"/></svg>';
}

const extraBrands = {
  figma: figma(),
  gmail: '<svg viewBox="0 0 64 48"><path fill="#4285F4" d="M4 8h8v36H4a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z"/><path fill="#34A853" d="M52 8h8a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4h-8Z"/><path fill="#EA4335" d="M12 8 32 23 52 8v14L32 37 12 22Z"/><path fill="#FBBC04" d="m52 8 5-4a4.4 4.4 0 0 1 7 3.5V18l-12 9Z"/><path fill="#C5221F" d="M0 7.5A4.4 4.4 0 0 1 7 4l5 4v19L0 18Z"/></svg>',
  '123pan': '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="17" fill="#397EFF"/><g fill="none" stroke="#fff" stroke-width="5.5" stroke-linejoin="round"><path d="M12 17v30M19 18h8c9 0 9 14 0 14h-8v14h16M40 18h6c10 0 10 14 0 14h-7m7 0c10 0 10 14 0 14h-7"/></g></svg>',
};

function sourceGroup(svg, size = 174) {
  const opening = svg.match(/<svg\b([^>]*)>/i)?.[1] || '';
  let box = opening.match(/viewBox="([^"]+)"/i)?.[1]?.split(/[ ,]+/).map(Number);
  if (!box) box = [0, 0, Number(opening.match(/width="(\d+)/)?.[1] || 24), Number(opening.match(/height="(\d+)/)?.[1] || 24)];
  const [x, y, w, h] = box;
  const scale = size / Math.max(w, h);
  const dx = (256 - w * scale) / 2 - x * scale;
  const dy = (256 - h * scale) / 2 - y * scale;
  const inherited = opening.match(/\b(?:fill|fill-rule|stroke)="[^"]+"/g)?.join(' ') || '';
  const body = svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/g, '').replace(/currentColor/g, '#262825');
  return `<g transform="translate(${dx} ${dy}) scale(${scale})" ${inherited.replace(/currentColor/g, '#262825')} ${inherited.includes('fill=') ? '' : 'fill="#262825"'}>${body}</g>`;
}

function mono(svg) {
  return svg.replace(/(fill|stroke)="(#[0-9a-f]{3,8}|currentColor|white|black)"/gi, (_, kind, color) => {
    let hex = color.replace('#', '');
    if (hex.length === 3) hex = [...hex].map(x => x + x).join('');
    if (color === 'white') hex = 'ffffff';
    if (color === 'black' || color === 'currentColor') hex = '222222';
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    const luma = (r * .2126 + g * .7152 + b * .0722) / 255;
    const base = Math.round(119 + luma * 111);
    const neutral = [base + 4, base, base - 9].map(n => Math.min(255, n).toString(16).padStart(2, '0')).join('');
    return `${kind}="#${neutral}"`;
  });
}

function canvas(body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none"><defs>${defs}</defs>${body}</svg>`;
}

const defs = '<filter id="relief" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="3" dy="5" stdDeviation="2.2" flood-color="#6e6659" flood-opacity=".36"/><feDropShadow dx="-1.5" dy="-2" stdDeviation="1" flood-color="#ffffff" flood-opacity=".95"/></filter>';
const softDefs = '<linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a4d2d0"/><stop offset=".45" stop-color="#629eaa"/><stop offset="1" stop-color="#326474"/></linearGradient><linearGradient id="peach" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe1bd"/><stop offset=".5" stop-color="#f6b78b"/><stop offset="1" stop-color="#d47c60"/></linearGradient><filter id="soft" x="-35%" y="-35%" width="170%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation=".6" flood-color="#294d59" flood-opacity=".28"/><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#294d59" flood-opacity=".15"/></filter>';

for (const style of styles) await fs.mkdir(path.join(root, 'icons', style.folder), { recursive: true });
for (const route of ['brand', 'original']) await fs.mkdir(path.join(root, 'references', route), { recursive: true });

for (const sample of samples) {
  let brand;
  if (extraBrands[sample.id]) brand = sourceGroup(extraBrands[sample.id]);
  else if (['archive', 'share', 'visual'].includes(sample.id)) brand = `<g transform="translate(32 32) scale(3)">${primitive[sample.id].replaceAll('P', '#7c8b88').replaceAll('S', '#e6c58e').replaceAll('W', '#f5f4ed')}</g>`;
  else {
    let raw = await fs.readFile(path.join(root, 'sources', sample.id + '.svg'), 'utf8');
    if (sample.id === 'youtube') raw = raw.replace('<path ', '<path fill="#F03D37" ');
    if (sample.id === 'outlook') raw = raw.replace('<path ', '<path fill="#1476BA" ');
    brand = sourceGroup(raw, sample.id === 'huggingface' ? 216 : sample.id === 'visionguard' ? 196 : sample.id === 'tencentcloud' ? 190 : 176);
  }
  const original = primitive[sample.id];
  const flat = original.replaceAll('P', '#255e59').replaceAll('S', '#ed996d').replaceAll('W', '#edf0e9');
  const soft = original.replaceAll('P', 'url(#sea)').replaceAll('S', 'url(#peach)').replaceAll('W', '#e9f6ef');
  const outputs = {
    A: canvas(`<rect width="256" height="256" fill="#f5f3ed"/>${brand}`),
    B: canvas(`<rect width="256" height="256" fill="#dcd8d0"/><g filter="url(#relief)">${mono(brand)}</g>`, defs),
    C: canvas(`<rect width="256" height="256" fill="#edf0e9"/><g transform="translate(32 32) scale(3)">${flat}</g>`),
    D: canvas(`<g transform="translate(32 28) scale(3)" filter="url(#soft)">${soft}</g>`, softDefs),
  };
  for (const style of styles.filter(s => s.format === 'SVG')) {
    const svg = sanitizeSvg(outputs[style.id]);
    if (!svg) throw new Error(`SVG sanitization failed: ${style.id}/${sample.id}`);
    await fs.writeFile(path.join(root, 'icons', style.folder, sample.id + '.svg'), svg + '\n');
  }
  const brandRef = canvas(brand);
  const originalRef = canvas(`<g transform="translate(32 32) scale(3)">${flat}</g>`);
  await sharp(Buffer.from(brandRef)).resize(1024, 1024).png().toFile(path.join(root, 'references', 'brand', sample.id + '.png'));
  await sharp(Buffer.from(originalRef)).resize(1024, 1024).png().toFile(path.join(root, 'references', 'original', sample.id + '.png'));
}

const reviewNotes = ['bilibili', 'youtube', 'outlook'].map(sample => ({ style: 'E', sample, text: '放大后边缘有少量碎点或彩边，选定风格后需修边。' }));
const manifest = { title: 'MarkPad 图标风格研究', date: '2026-10-20', baseline: { bookmarks: 98, uniqueHosts: 93 }, samples, styles, reviewNotes };
await fs.writeFile(path.join(root, 'study-data.js'), `window.MARKPAD_ICON_STUDY = ${JSON.stringify(manifest, null, 2)};\n`);
await fs.writeFile(path.join(root, 'study.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Built 60 sanitized SVG icons and 30 transparent reference renders.');
