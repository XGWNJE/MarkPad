import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildFlat, initialSvg, prepareDirectories, root } from '../asset-tools.mjs';

const simple = (id, slug, color) => ({ id, url: `https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/${slug}.svg`, provider: 'Simple Icons 16.35.0', license: 'CC0-1.0', licenseUrl: 'https://github.com/simple-icons/simple-icons/blob/16.35.0/LICENSE.md', color });
const lobe = (id, slug) => ({ id, url: `https://unpkg.com/@lobehub/icons-static-svg@1.95.1/icons/${slug}.svg`, provider: 'Lobe Icons 1.95.1', license: 'MIT', licenseUrl: 'https://github.com/lobehub/lobe-icons/blob/master/LICENSE' });
const official = (id, url, extra = {}) => ({ id, url, provider: 'Official public brand asset', license: 'No explicit reuse license found; trademark remains with its owner', licenseUrl: null, ...extra });
const fallback = (id, initial, color, reason, attemptedUrls=[]) => ({ id, initial, color, fallbackReason: reason, attemptedUrls, provider: 'MarkPad editable initial fallback', license: 'Project-authored fallback; not an official logo', licenseUrl: null });
const redrawn = (id,basisUrl,customSvg,notes) => ({ id, basisUrl, customSvg, provider: 'Simplified editable SVG from visually inspected official public logo', license: 'No explicit reuse license found; trademark remains with its owner', licenseUrl:null, notes });

const defs = [
  simple('shadcn','shadcnui','#000000'),
  simple('penpot','penpot','#000000'),
  fallback('xgwnje','X','#333333','Public homepage connection failed; no clear sanitizer-compatible vector source available.', ['https://xgwnje.cn/']),
  lobe('doubao','doubao-color'),
  lobe('kimi','kimi-color'),
  { id: 'grsai', provider: 'Simplified SVG geometry redrawn from official public header PNG', license: 'No explicit reuse license found; trademark remains with its owner', licenseUrl: null, basisUrl: 'https://grsai.com/images/logo.png', customSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="#000000"><path d="M338 156H859L723 391 625 298H423L303 504 223 362Z"/><path d="M190 417 356 705H643L726 849H278L110 557Z"/><path d="M442 467H756L892 706 811 849 672 607H525Z"/></svg>' },
  official('pansoo','https://pansoo.com/icon.svg'),
  simple('wechat','wechat','#07C160'),
  official('netcoffee','https://net.coffee/favicon.svg', { normalizeCss: true }),
  official('reactbits','https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/assets/logos/react-bits-logo-small-black.svg',{license:'MIT with Commons Clause',licenseUrl:'https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md'}),
  redrawn('vibehub','https://vibe-hub.org/assets/vh-logo-v4-tight.png','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M51 277C8 360 17 430 79 465c66 36 174 4 261-60 10-66-7-115-38-153-10 58-50 81-102 95-54 19-102-5-149-70Z" fill="#3157d5"/><path d="M146 133c0-43 57-76 126-97C180 2 97 22 55 60 0 110 20 194 51 277c28 69 66 85 126 73l80-34c-55-8-83-47-106-106-12-33-14-60-5-77Z" fill="#262626"/><path d="M146 133C194 75 293 16 367 29c74-3 112 50 112 124 0 37-8 65-14 87-18-69-54-92-94-82-64 9-117 53-171 110-30-46-47-89-54-135Z" fill="#3157d5"/><path d="M371 158c55 39 110 163 107 229-1 63-37 93-89 95-39 3-75-10-111-28 68-40 84-85 78-128-8-72-24-122-37-136 19-16 36-28 52-32Z" fill="#262626"/></svg>','Retained the official blue/charcoal interlocking ribbon structure and sampled dominant colors; simplified curves.'),
  fallback('novixlink','N','#3457a8','Public homepage responds HTTP 403; no clear reusable vector available.', ['https://novixlink.com/']),
  lobe('tripo','tripo-color'),
  simple('discord','discord','#5865F2'),
  redrawn('bybit','https://raw.githubusercontent.com/bybit-exchange/docs/master/static/img/logo_lightmode.png','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 100" fill="#222222"><path fill-rule="evenodd" d="M2 20h29c32 0 34 37 15 38 23 4 23 34-7 34H2Zm14 13v18h15c13 0 13-18 0-18Zm0 30v16h17c13 0 13-16 0-16Z"/><path d="M57 20h17l15 29 15-29h17L96 63v29H82V63Z"/><path fill-rule="evenodd" d="M128 20h29c32 0 34 37 15 38 23 4 23 34-7 34h-37Zm14 13v18h15c13 0 13-18 0-18Zm0 30v16h17c13 0 13-16 0-16Z"/><path d="M193 2h14v72h-14Z" fill="#ff9b28"/><path d="M218 20h46v14h-16v58h-14V34h-16Z"/></svg>','Rebuilt the BYBIT letter geometry from the official documentation header; retained the taller orange I; simplified, not claimed pixel-identical.'),
  official('pornhub','https://upload.wikimedia.org/wikipedia/commons/f/f1/Pornhub-logo.svg',{provider:'Wikimedia Commons brand vector',license:'Simple text logo / trademark; no additional reusable artwork license asserted',licenseUrl:'https://commons.wikimedia.org/wiki/File:Pornhub-logo.svg'}),
  redrawn('pandascrcpy','https://pandatestgrid.github.io/logo.png','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="209" fill="#000"/><path d="M165 127c-37-22-70 10-51 43-31 42-36 84-24 132 13 66 80 92 143 81 58-9 121-44 127-95 4-39-21-90-58-123-30-28-67-37-106-27-12-21-35-29-52-16Z" fill="#fff"/><circle cx="316" cy="151" r="28" fill="#fff"/><ellipse cx="213" cy="258" rx="29" ry="48" transform="rotate(32 213 258)" fill="#000"/><ellipse cx="323" cy="256" rx="22" ry="39" transform="rotate(-27 323 256)" fill="#000"/><ellipse cx="288" cy="303" rx="26" ry="15" fill="#000"/><path d="M288 313c-1 31-27 44-45 25m45-25c3 31 29 30 41 9" fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"/><path d="m369 204 12 14 31-43" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>','Simplified the clear panda face, round seal and verification tick; official 512px header retained for traceability.'),
  redrawn('superflash','https://x-superflash.com/favicon.ico','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="m76 3-7 46h28L74 73h16l-38 51 9-36H43l14-20H35Z" fill="#fff" stroke="#111" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="m72 13-9 43h21L63 80H52l15-20H46Z" fill="#111"/></svg>','Decoded official 128px favicon and manually simplified the double-lightning geometry; not an enlarged 16px source.'),
  simple('aliyun','alibabacloud','#FF6A00'),
  simple('okx','okx','#000000'),
  redrawn('qqmail','https://res.wx.qq.com/t/webmail/webmail/res/images/qqmail_favicon_96h.8d124a7.png','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="39" fill="#fff"/><path d="M46 9C25 7 8 25 8 47c0 10 3 20 9 27" fill="none" stroke="#f5b900" stroke-width="16" stroke-linecap="round"/><path d="M57 10c21 5 33 23 30 44-1 12-6 23-16 30" fill="none" stroke="#7bc41d" stroke-width="16" stroke-linecap="round"/><path d="M78 77c-21 17-49 15-63-7 19 13 38 14 55-1" fill="none" stroke="#ff4404" stroke-width="15" stroke-linecap="round"/><path d="M28 55c1-15 10-28 20-28s19 12 21 27l-7 6c-8-8-19-8-27 0Z" fill="#209bd2"/></svg>','Simplified the official 96px multicolor QQ Mail ring and blue interior mark; kept distinct from generic mail glyphs.'),
  redrawn('lisahost','https://lisahost.com/img/logo.png','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 164 200" fill="#3755be"><path d="M0 0 76 49v151L0 151Z"/><path d="m76 200 58-58 30 58Z"/></svg>','Used the standalone blue geometric L from the official clear 512px header, without the text wordmark.'),
  fallback('iproyal','I','#176c62','Official public root responds HTTP 403 and no verified clear SVG was available.', ['https://iproyal.com/']),
  lobe('grok','grok'),
  lobe('gemini','gemini-color'),
  fallback('meiguodizhi','M','#348acc','Only an unclear 32px favicon was found; do not enlarge it into final artwork.', ['https://www.meiguodizhi.com/','https://static11.meiguodizhi.com/favicon.ico']),
];

await prepareDirectories();
let records = [];
try { records = JSON.parse(await fs.readFile(path.join(root,'receipts','suffix3-sources.json'),'utf8')).assets; } catch {}
for (const def of defs) {
  if (records.some(r => r.id === def.id) && !process.argv.includes('--force')) continue;
  let raw, prepared;
  const rec = { ...def, retrievedOn: '2026-10-20', sourceFile: `sources/${def.id}.source.svg`, flat: `assets/bookmark-icons/flat/${def.id}.svg`, reference: `references/${def.id}.png` };
  if (def.url) {
    const res = await fetch(def.url, { signal: AbortSignal.timeout(18000) });
    if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
    raw = await res.text();
    if (!raw.includes('<svg')) throw new Error(`${def.id}: not SVG`);
    raw = raw.slice(raw.indexOf('<svg')).trim();
    prepared = raw;
    if (!/viewBox=/.test(prepared)) {
      const w=prepared.match(/<svg[^>]*\bwidth="([\d.]+)"/)?.[1],h=prepared.match(/<svg[^>]*\bheight="([\d.]+)"/)?.[1];
      if(w&&h)prepared=prepared.replace(/<svg\b/,`<svg viewBox="0 0 ${w} ${h}"`);
    }
    if (def.color) prepared = prepared.replace(/<svg\b/,`<svg fill="${def.color}"`);
    if (def.normalizeCss) prepared = prepared.replace(/<style>[\s\S]*?<\/style>/,'').replace(/class="s"/g,'fill="none" stroke="#1a1a1a" stroke-width="6.65" stroke-linecap="round" stroke-linejoin="round"').replace(/class="smile"/g,'fill="none" stroke="#1a1a1a" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"').replace(/class="eye"/g,'fill="#1a1a1a"');
    rec.transformation = def.normalizeCss ? 'Expanded light-mode CSS classes into SVG presentation attributes; geometry unchanged.' : 'Centered uniform scaling; retained brand fill colors.';
  } else if (def.customSvg) {
    raw = def.customSvg; prepared = raw;
    rec.transformation = 'Manually simplified the public logo into editable SVG geometry after visual inspection; no raster enlargement.' + (def.notes ? ' ' + def.notes : '');
    delete rec.customSvg;
  } else {
    raw = initialSvg(def.initial,def.color); prepared = raw;
    rec.transformation = 'Editable initial fallback generated with existing helper; not represented as official.';
  }
  await fs.writeFile(path.join(root,rec.sourceFile),raw+'\n');
  rec.sourceSha256 = crypto.createHash('sha256').update(raw+'\n').digest('hex');
  await buildFlat(def.id,prepared,{size:180});
  records = records.filter(x=>x.id!==def.id); records.push(rec);
  await fs.writeFile(path.join(root,'receipts','suffix3-sources.json'),JSON.stringify({owner:'suffix3',assets:records},null,2)+'\n');
  console.log(JSON.stringify({id:def.id,source:def.provider,ok:true}));
}
