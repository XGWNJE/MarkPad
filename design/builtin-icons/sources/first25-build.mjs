import fs from 'node:fs/promises';
import path from 'node:path';
import {buildFlat,initialSvg,makeReferenceSheet,root} from '../asset-tools.mjs';

const sourceDir=path.join(root,'sources');
export const ids=['123community','civitai','jpsmile','imyshare','ghxi','laogou','rutracker','byrut','kkpans','xclient','ipastore','greasyfork','macked','cgown','adobeae','c4dsky','gfxcamp','wszyk','aplaybox','lookae','blenderco','lanzou','pixabay','aigei','heiliaowang'];
const initials={'123community':['S','#5477fc'],ghxi:['G','#4c9f62'],ipastore:['I','#7553bb'],macked:['M','#303d54'],c4dsky:['C','#358fb3'],wszyk:['W','#ff7b4c'],aigei:['A','#3ca786'],heiliaowang:['H','#262825']};
const colors={greasyfork:'#670000',pixabay:'#191b26'};

export async function buildIds(selected){
 for(const id of selected){
  let svg;
  if(initials[id])svg=initialSvg(...initials[id]);
  else if(id==='adobeae'){
   const mark=await fs.readFile(path.join(sourceDir,'adobeae-clear-brand.svg'),'utf8');
   const paths=(mark.match(/<path\b[^>]*\/>/g)||[]).join('');
   svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect y=".3" width="24" height="23.4" rx="4.25" fill="#fff"/><g fill="#a77bd5">${paths}</g></svg>`;
  }
  else if(id==='lanzou')svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 44"><path d="M13 39C0 39 0 23 11 22C8 9 23 5 30 13C35-4 56 1 55 18C68 18 69 39 55 39Z" fill="#fff" stroke="#ff2a13" stroke-width="3.5" stroke-linejoin="round"/></svg>';
  else{
   let file=path.join(sourceDir,`${id}-traced.svg`);
   try{svg=await fs.readFile(file,'utf8');}catch{svg=await fs.readFile(path.join(sourceDir,`${id}-official.svg`),'utf8');}
  }
  if(colors[id])svg=svg.replace(/<svg\b/,'<svg fill="'+colors[id]+'"');
  if(id==='rutracker'&&svg.includes('0 0 320 90')){
   const body=svg.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'');
   svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 22 58 48"><defs><clipPath id="ru-crop"><rect x="0" y="22" width="58" height="48"/></clipPath></defs><g clip-path="url(#ru-crop)">${body}</g></svg>`;
  }
  await buildFlat(id,svg,{size:180});
 }
}
if(process.argv[2]){
 const wave=Number(process.argv[2]);const selected=ids.slice((wave-1)*9,wave*9);
 await buildIds(selected);
 console.log(await makeReferenceSheet(selected,`first25-${wave}`));
}
