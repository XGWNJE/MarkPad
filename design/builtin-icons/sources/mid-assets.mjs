import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFlat, initialSvg, makeReferenceSheet, prepareDirectories, root } from '../asset-tools.mjs';

const ids = ['missav','redcap','sefan','tapnow','artstation','pixiv','ggac','huaban','wallhaven','zcool','afdian','iconfont','dribbble','awwwards','funletu','comfyui','liblib','jimeng','runninghub','photomosh','ps6b','pencil','stitch','gptimages','aiart'];
const simple = ['artstation','pixiv','zcool','afdian','dribbble','awwwards'];
const sourceDir = path.join(root, 'sources');
const records = [];
await prepareDirectories();
const wrap = s => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${s}</svg>`;
const redraws = {
  tapnow: wrap('<defs><linearGradient id="tap-a" x2="0" y2="1"><stop stop-color="#fff37b"/><stop offset="1" stop-color="#59eacc"/></linearGradient><linearGradient id="tap-b"><stop stop-color="#fff395"/><stop offset=".6" stop-color="#ff9bd2"/><stop offset="1" stop-color="#e19cff"/></linearGradient><linearGradient id="tap-c"><stop stop-color="#157aee"/><stop offset=".45" stop-color="#47caff"/><stop offset="1" stop-color="#e3b5ff"/></linearGradient></defs><path d="M25 8C33-4 51 0 56 12c5 13-4 26-17 26S17 20 25 8Z" fill="url(#tap-a)"/><path d="M6 13C15 5 28 11 31 20l6 24c3 14-12 22-22 13C7 49-4 24 6 13Z" fill="url(#tap-b)"/><path d="M32 22c10-7 20 0 25 9 5 11 1 25-6 28-6 3-23 1-28-5-7-9-1-26 9-32Z" fill="url(#tap-c)" opacity=".93"/>'),
  ggac: wrap('<rect x="1" y="1" width="62" height="62" rx="10" fill="#ffcb05"/><path d="M32 6 51 19v8l-7-5v28L32 59 13 47V21l8-5v27l5 4V11Zm0 8v35l5-4V19Z" fill="#111"/>'),
  liblib: wrap('<rect x="1" y="1" width="62" height="62" rx="13" fill="#0878f9"/><path d="M14 44 33 9l5 17-10 14h10l7 15H14l10-11Z" fill="#fff"/>'),
  runninghub: wrap('<path d="M7 4h26c31 0 35 37 14 48l10 10H33L19 46h14c15 0 15-24 0-24h-8v40H7Z" fill="#00c99a"/>'),
  pencil: wrap('<defs><linearGradient id="pen-metal"><stop stop-color="#24272a"/><stop offset=".19" stop-color="#d0d3d7"/><stop offset=".48" stop-color="#f8f9fa"/><stop offset=".8" stop-color="#e7e8eb"/><stop offset="1" stop-color="#51565c"/></linearGradient></defs><path d="M10 5h44v31L32 60 10 36Z" fill="url(#pen-metal)" stroke="#464b50" stroke-width="2" stroke-linejoin="round"/><path d="M13 8h38v27L32 55 13 35Z" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.2"/>'),
  stitch: wrap('<rect x="1" y="1" width="62" height="62" rx="14" fill="#080c0b"/><rect x="7" y="22" width="50" height="20" rx="10" fill="#f1f4f5"/><circle cx="27" cy="32" r="2.6" fill="#080c0b"/><circle cx="37" cy="32" r="2.6" fill="#080c0b"/>')
};
const redrawUrls = {
  tapnow:'https://fe-assets.tapnow.media/7ad370fbd58d60ca3fe69efcd10d257144faa85e/assets/favicons/apple-touch-icon.png',
  ggac:'https://cdn-prd.ggac.com/ggac/assets/image/favicon.png',
  liblib:'https://www.liblib.art/favicon.ico',
  runninghub:'https://www.runninghub.ai/assets/images/logo.png',
  pencil:'https://www.pen.dev/apple-touch-icon.png',
  stitch:'https://www.gstatic.com/labs-code/stitch/favicon-192x192.png'
};
const direct = {
  iconfont:'https://img.alicdn.com/imgextra/i4/O1CN01Z5paLz1O0zuCC7osS_!!6000000001644-55-tps-83-82.svg',
  photomosh:'https://moshpro.app/favicon.svg',
  gptimages:'https://gptimges.com/favicon.svg',
  comfyui:'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/comfyui-color.svg',
  jimeng:'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/jimeng-color.svg'
};
for (const id of simple) direct[id] = `https://cdn.simpleicons.org/${id}`;
const fallbacks = {
  missav:['M','#4a355e','https://missav.ws/','Official origin returned HTTP 403; no reusable vector mark found.'],
  redcap:['R','#b64e53',null,'Local hotspot entry; no device or private management page was accessed.'],
  sefan:['S','#4e7c91','https://ma.sefan.pw/','Official origin returned HTTP 404; no reusable mark found.'],
  huaban:['H','#d6485c','https://huaban.com/','Public origin returned browser-verification markup; no reusable vector mark found.'],
  wallhaven:['W','#466a60','https://wallhaven.cc/','Official horizontal raster wordmark is too wide for a small icon; an editable W initial is used.'],
  funletu:['F','#e9923d','https://pan.funletu.com/','Original public origin redirects to an unrelated service; its mark was not adopted.'],
  ps6b:['P','#38759e','https://help2.ps6b.com/','Public origin has an expired TLS certificate; no certificate bypass was used.'],
  aiart:['A','#303636','https://aiart.pics/','Official 32px stacked wordmark has no reusable vector source; an editable A initial is used.']
};
const downloads = await Promise.all(Object.entries(direct).map(async ([id,url]) => {
  const response = await fetch(url,{signal:AbortSignal.timeout(25000)});
  if(!response.ok) throw new Error(`${id}: ${response.status}`);
  const raw = await response.text();
  if(!raw.includes('<svg')) throw new Error(`${id}: response is not SVG`);
  await fs.writeFile(path.join(sourceDir,`${id}-source.svg`), raw);
  return [id,raw];
}));
const sources = Object.fromEntries(downloads);
for(const id of ids){
  let svg, record;
  if(redraws[id]){
    svg=redraws[id];
    await fs.writeFile(path.join(sourceDir,`${id}-redraw.svg`), svg+'\n');
    record={id,kind:'reviewed-vector-redraw',sourceUrl:redrawUrls[id],license:'Brand artwork rights retained by its owner; no separate reuse license was published.',note:'Editable simplified vector redraw from the official public mark; not a claim of an official supplied vector.'};
  }else if(sources[id]){
    svg=sources[id].replace(/^[\s\S]*?(?=<svg)/,'');
    if(id==='photomosh')svg=svg.replace(/class="st0"/g,'fill="#fff"');
    if(id==='iconfont'){
      svg=svg.replace('<svg ','<svg viewBox="0 0 83 82" ');
      const definitions={};
      for(const m of svg.matchAll(/<path\b[^>]*\bid="([^"]+)"[^>]*\/>/g))definitions[m[1]]=m[0].replace(/\s+id="[^"]+"/,'');
      svg=svg.replace(/<use\b[^>]*(?:xlink:)?href="#([^"]+)"[^>]*\/>/g,(_,key)=>definitions[key]||'');
    }
    if(id==='gptimages')svg=svg.replace('viewBox="0 0 100 100"','viewBox="13 16 69 69"');
    record={id,kind:'downloaded-vector',sourceUrl:direct[id],license:simple.includes(id)?'CC0-1.0 (Simple Icons); brand trademark rights remain with the owner.':['comfyui','jimeng'].includes(id)?'MIT (@lobehub/icons-static-svg 1.95.1); brand trademark rights remain with the owner.':'Brand artwork rights retained by its owner; no separate reuse license was published.'};
  }else{
    const [letter,color,sourceUrl,note]=fallbacks[id];
    // F has no built-in glyph in the shared helper; draw it explicitly.
    svg=letter==='F'?wrap(`<rect x="1" y="1" width="62" height="62" rx="16" fill="${color}"/><path d="M18 14h30v10H29v8h16v10H29v12H18Z" fill="#fff"/>`):initialSvg(letter,color);
    record={id,kind:'initial-fallback',initial:letter,sourceUrl,license:'Original MarkPad initial artwork.',note};
    await fs.writeFile(path.join(sourceDir,`${id}-initial.svg`),svg+'\n');
  }
  await buildFlat(id,svg,{size:180});
  records.push({...record,flat:`assets/bookmark-icons/flat/${id}.svg`,reference:`design/builtin-icons/references/${id}.png`});
}
await fs.writeFile(path.join(sourceDir,'mid-sources.json'),JSON.stringify({worker:'mid-25',ids,records},null,2)+'\n');
for(let i=0;i<ids.length;i+=9)console.log(await makeReferenceSheet(ids.slice(i,i+9),`mid-${i/9+1}`));
console.log(JSON.stringify(records.map(x=>({id:x.id,kind:x.kind}))));
