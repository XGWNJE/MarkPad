import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { cropSheet, root, project, sharp } from '../asset-tools.mjs';

const sourceRecords = JSON.parse(await fs.readFile(path.join(root,'sources/mid-sources.json'),'utf8'));
const ids = sourceRecords.ids;
for(let n=1;n<=3;n++){
  const file=path.join(root,`receipts/mid-${n}.json`);
  const receipt=JSON.parse(await fs.readFile(file,'utf8'));
  const sheet=path.join(project,receipt.sheet);
  const crop=await cropSheet(sheet,receipt.ids,`mid-${n}`);
  receipt.provenance='Native ImageGen sheet generated with explicit user permission for multiple icons per sheet. Each regular cell is cropped, then centered on a 256px transparent canvas by the shared helper using its visible-alpha bounds and a 1.5% buffer; maximum rendered edge 196px. No matting, background removal, repaint or recoloring.';
  receipt.crop=crop;
  receipt.sources=sourceRecords.records.filter(x=>receipt.ids.includes(x.id));
  const metadata=await sharp(sheet).metadata();
  receipt.sheetValidation={width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha,sha256MatchesRaw:createHash('sha256').update(await fs.readFile(sheet)).digest('hex')===createHash('sha256').update(await fs.readFile(receipt.rawGeneratedPath)).digest('hex')};
  for(const item of crop){
    const {data,info}=await sharp(item.target).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=(x,y)=>data[(y*info.width+x)*info.channels+3];
    item.validation={width:info.width,height:info.height,cornerAlpha:[alpha(0,0),alpha(255,0),alpha(0,255),alpha(255,255)],bytes:(await fs.stat(item.target)).size};
  }
  await fs.writeFile(file,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({sheet:receipt.sheet,crops:crop.map(x=>({id:x.id,...x.validation,placement:x.placement}))}));
}
for(const [theme,bg,fg] of [['light','#f5f3ed','#343832'],['dark','#202420','#edf0ea']]){
  const composites=[];
  for(const [i,id] of ids.entries()){
    const left=(i%5)*192,top=Math.floor(i/5)*198;
    composites.push({input:await sharp(path.join(project,`assets/bookmark-icons/clay/${id}.png`)).resize(160,160).png().toBuffer(),left:left+16,top:top+4});
    const label=`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="28"><text x="96" y="20" font-family="Arial,sans-serif" font-size="14" fill="${fg}" text-anchor="middle">${id}</text></svg>`;
    composites.push({input:Buffer.from(label),left,top:top+165});
  }
  const target=path.join(root,`references/mid-${theme}-preview.png`);
  await sharp({create:{width:960,height:990,channels:4,background:bg}}).composite(composites).png().toFile(target);
  console.log(target);
}
