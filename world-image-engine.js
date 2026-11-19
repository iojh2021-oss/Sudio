/* Sudio AI image-world renderer: full-frame cinematic plates with soft transitions and IndexedDB cache. */
(()=>{'use strict';
const TILE_WIDTH=1280,DB_NAME='sudio-ai-world-v1',STORE='tiles';
function openDb(){return new Promise((resolve,reject)=>{if(!('indexedDB'in self)){reject(new Error('IndexedDB unavailable'));return}const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function cacheTile(key,blob){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(blob,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(_){}}
async function readTile(key){try{const db=await openDb();const blob=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});db.close();return blob}catch(_){return null}}
function create(){const tiles=new Map(),pending=new Set();let total=0,offline=false;
function add(entry,base,cacheVersion){if(!entry||!Number.isFinite(Number(entry.index))||!entry.file)return;const index=Number(entry.index);if(tiles.has(index)||pending.has(index))return;pending.add(index);const url=new URL(entry.file,base);url.searchParams.set('v',cacheVersion);const key='tile-'+index+'-'+cacheVersion;(async()=>{let blob=await readTile(key);if(!blob){const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error('tile HTTP '+response.status);blob=await response.blob();await cacheTile(key,blob)}return createImageBitmap(blob)})().then(bitmap=>tiles.set(index,bitmap)).catch(()=>{}).finally(()=>pending.delete(index))}
async function load(url='./generated-world/manifest.json'){try{const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error('manifest unavailable');const data=await response.json();total=Array.isArray(data.tiles)?data.tiles.length:0;offline=false;const base=new URL(url,location.href),cacheVersion=String(data.generated_at||data.version||'v1');(data.tiles||[]).forEach(t=>add(t,base,cacheVersion));return true}catch(_){offline=true;return false}}
function draw(ctx,camera,width,height){if(!tiles.size)return false;const position=Math.max(0,Number(camera)||0),index=Math.floor(position/TILE_WIDTH),phase=(position%TILE_WIDTH)/TILE_WIDTH,current=tiles.get(index);if(!current)return false;
ctx.save();ctx.globalAlpha=1;ctx.drawImage(current,0,0,width,height);
const next=tiles.get(index+1),blendStart=.68,blend=Math.max(0,Math.min(1,(phase-blendStart)/(1-blendStart)));
if(next&&blend>0){const smooth=blend*blend*(3-2*blend);ctx.globalAlpha=smooth;ctx.drawImage(next,0,0,width,height)}
ctx.restore();return true}
function status(){return{total,ready:tiles.size,offline,indices:[...tiles.keys()].sort((a,b)=>a-b)}}
return{load,draw,status,TILE_WIDTH}}
window.SudioImageWorld={create};
})();