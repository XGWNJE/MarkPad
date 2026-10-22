import fs from 'node:fs/promises';
import path from 'node:path';
import {cropSheet,exportCenteredIcon,sharp,root,clayDir} from '../asset-tools.mjs';
import {ids} from './first25-build.mjs';

for(const [wave,attempt] of [[1,2],[2,1],[3,2]]){
 const source=path.join(root,`sheets/first25-${wave}-attempt${attempt}.png`);
 const results=await cropSheet(source,ids.slice((wave-1)*9,wave*9),`first25-${wave}`);
 for(const result of results)result.sourceSheet=source;
 if(wave===3){
  // Revision 2 fixes layout but fills px's intentional alpha holes with black.
  // The first native render preserves them. A safe crop excludes its neighbour.
  const sourceSheet=path.join(root,'sheets/first25-3-attempt1.png');
  const crop={left:450,top:460,width:360,height:370};
  const input=await sharp(sourceSheet).extract(crop).png().toBuffer();
  const target=path.join(clayDir,'pixabay.png');
  const placement=await exportCenteredIcon(input,target);
  const index=results.findIndex(x=>x.id==='pixabay');
  results[index]={id:'pixabay',target,sourceSheet,crop,placement,manualCrop:true,reason:'Preserve the original native transparent px counters; exclude neighbouring top-row content. Crop and placement only; no alpha masking or repainting.'};
 }
 await fs.writeFile(path.join(root,`receipts/first25-${wave}-crops.json`),JSON.stringify(results,null,2)+'\n');
 const receiptPath=path.join(root,`receipts/first25-${wave}.json`);
 try{
  const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
  receipt.exports=results;
  await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
 }catch(error){if(error.code!=='ENOENT')throw error;}
 console.log(JSON.stringify({wave,count:results.length}));
}
