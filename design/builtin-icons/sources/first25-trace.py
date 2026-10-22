"""Trace clear, public brand raster sources into editable path-only SVGs.
No generated clay output is modified by this source-preparation script.
"""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parent
CONFIG={
 'rutracker':('png',(0,88,218,192),1,'red'),
 'jpsmile':('png',None,8,None),
 'imyshare':('png',None,3,None),
 'laogou':('png',None,1,'white'),
 'xclient':('png',(0,0,190,200),2,None),
 'adobeae':('png',(0,10,42,43),3,None),
 'gfxcamp':('png',None,5,'dark'),
 'lookae':('png',(0,0,61,58),3,None),
 'blenderco':('png',None,2,None),
 'cgown':('jpg',(25,0,70,49),3,'white'),
 'aplaybox':('png',(0,0,85,80),4,None),
}

for id,(ext,crop,k,remove) in CONFIG.items():
 p=ROOT/f'{id}-official.{ext}'
 if not p.exists(): continue
 im=Image.open(p).convert('RGBA')
 if crop:
  x,y,w,h=crop;im=im.crop((x,y,x+w,y+h))
 a=np.array(im);rgb=a[:,:,:3];mask=a[:,:,3]>=96
 if remove=='white':mask &= np.min(rgb,axis=2)<210
 if remove=='dark':mask &= np.max(rgb,axis=2)>95
 if remove=='red':mask &= (rgb[:,:,0]>120)&(rgb[:,:,0].astype(float)>rgb[:,:,1]*1.3)&(rgb[:,:,0].astype(float)>rgb[:,:,2]*1.1)
 pixels=rgb[mask].astype(np.float32)
 if not len(pixels): raise ValueError(id)
 if k==1: centers=np.array([[237,64,82] if remove=='red' else [20,23,22]],dtype=np.uint8);labels=np.zeros(len(pixels),dtype=np.int32)
 else:
  cv2.setRNGSeed(19)
  _,labels,centers=cv2.kmeans(pixels,k,None,(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,60,.2),5,cv2.KMEANS_PP_CENTERS)
  centers=np.uint8(centers);labels=labels[:,0]
 labelmap=np.full(mask.shape,-1,np.int32);labelmap[mask]=labels
 parts=[]
 for j,c in enumerate(centers):
  layer=np.uint8(labelmap==j)*255
  contours,_=cv2.findContours(layer,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
  ds=[]
  for contour in contours:
   if abs(cv2.contourArea(contour))<1.2: continue
   q=cv2.approxPolyDP(contour,.45,True)[:,0,:]
   if len(q)<3: continue
   ds.append('M'+' '.join(f'{int(x)},{int(y)}' for x,y in q)+'Z')
  if ds:
   color=f'#{c[0]:02x}{c[1]:02x}{c[2]:02x}'
   parts.append(f'<path fill="{color}" stroke="{color}" stroke-width="1" stroke-linejoin="round" fill-rule="evenodd" d="{" ".join(ds)}"/>')
 ys,xs=np.where(mask)
 view=(float(xs.min())-.5,float(ys.min())-.5,float(xs.max()-xs.min())+2,float(ys.max()-ys.min())+2)
 box=' '.join(f'{n:g}'for n in view)
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}">{"".join(parts)}</svg>'
 (ROOT/f'{id}-traced.svg').write_text(svg,encoding='utf-8')
 print(id,im.width,im.height,len(svg))
