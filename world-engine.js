/* Sudio Live World Engine — deterministic, APK-friendly hybrid generation.
 * The director selects a district grammar; the generator creates persistent,
 * seeded chunks. No network, model download, or per-frame inference is required.
 */
(function(root){
  'use strict';
  const VERSION='1.1.0', CHUNK_WIDTH=960, MAX_CACHE=9, WORLD_VERSION=2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function hash32(n){let x=(n|0)+0x9e3779b9;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return (x^(x>>>15))>>>0}
  function random(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}
  const DISTRICTS=[
    {id:'old-town',label:'محله قدیمی',height:[180,390],density:.88,accent:.18},
    {id:'industrial',label:'منطقه صنعتی',height:[120,260],density:.62,accent:.34},
    {id:'downtown',label:'مرکز شهر',height:[280,490],density:1,accent:.22},
    {id:'quiet',label:'خیابان خلوت',height:[100,230],density:.38,accent:.12}
  ];
  function director(seed,index,context){
    // Lightweight semantic director. A compact on-device model can later
    // implement the same interface without changing the renderer.
    const r=random(hash32(seed^Math.imul(index+1,0x45d9f3b)));
    const mood=context&&context.mood||'noir';
    let weights=[.32,.22,.30,.16];
    if(index>0&&index%5===0)weights=[.15,.15,.55,.15];
    if(index>0&&index%7===0)weights=[.12,.48,.12,.28];
    let n=r(),district=0;for(let i=0;i<weights.length;i++){n-=weights[i];if(n<=0){district=i;break}}
    return {district:DISTRICTS[district].id,mood,weather:(index%4===3?'mist':'clear'),storyBeat:index%6===0?'landmark':(index%3===0?'transition':'street'),density:DISTRICTS[district].density};
  }
  function makeChunk(seed,index,context){
    const plan=director(seed,index,context),district=DISTRICTS.find(d=>d.id===plan.district)||DISTRICTS[0];
    const r=random(hash32(seed^Math.imul(index+17,0x27d4eb2d))),buildings=[],props=[];
    let x=24,slot=0;
    while(x<CHUNK_WIDTH-80){
      if(r()>district.density){x+=90+r()*110;continue}
      const w=95+r()*105,h=district.height[0]+r()*(district.height[1]-district.height[0]);
      buildings.push({id:'b'+index+'-'+slot++,x:x,y:520-h,w,h,levels:Math.max(2,Math.floor(h/48)),style:Math.floor(r()*4),lit:Math.floor(r()*8),sign:r()>.72,accent:r()<district.accent});
      x+=w+22+r()*52;
    }
    const count=3+Math.floor(r()*5);
    for(let i=0;i<count;i++){
      const kinds=['lamp','hydrant','bin','poster','bench','bollard','phonebooth','newspaper'];
      props.push({id:'p'+index+'-'+i,type:kinds[Math.floor(r()*kinds.length)],x:40+r()*(CHUNK_WIDTH-80),y:520,scale:.7+r()*.65,accent:r()>.76,collisionRadius:26});
    }
    if(plan.storyBeat==='landmark'){props.push({id:'landmark-'+index,type:'phonebooth',x:CHUNK_WIDTH*.5,y:520,scale:1.25,accent:true,collisionRadius:34,landmark:true})}return {index,seed:hash32(seed^index),x:index*CHUNK_WIDTH,width:CHUNK_WIDTH,plan,buildings,props};
  }
  class LiveWorld{
    constructor(options){options=options||{};this.seed=(Number(options.seed)>>>0)||20261119;this.version=WORLD_VERSION;this.cache=new Map();this.context={mood:options.mood||'noir'};this.lastWindow=null;this.generated=0;this.hits=0}
    setMood(mood){this.context.mood=mood||'noir'}
    getChunk(index){if(this.cache.has(index)){this.hits++;return this.cache.get(index)}const chunk=makeChunk(this.seed,index,this.context);this.cache.set(index,chunk);this.generated++;this.evict(index);return chunk}
    evict(center){if(this.cache.size<=MAX_CACHE)return;const entries=[...this.cache.keys()].sort((a,b)=>Math.abs(b-center)-Math.abs(a-center));while(this.cache.size>MAX_CACHE)this.cache.delete(entries.shift())}
    getVisibleChunks(camera,width){const first=Math.floor(camera/CHUNK_WIDTH)-1,last=Math.floor((camera+width)/CHUNK_WIDTH)+1,out=[];for(let i=first;i<=last;i++)out.push(this.getChunk(i));this.lastWindow={first,last};return out}
    getNearbyProps(worldX,radius){radius=Math.max(0,Number(radius)||0);const first=Math.floor((worldX-radius)/CHUNK_WIDTH),last=Math.floor((worldX+radius)/CHUNK_WIDTH),out=[];for(let i=first;i<=last;i++){const chunk=this.getChunk(i);for(const prop of chunk.props){const x=chunk.x+prop.x,dx=x-worldX;if(Math.abs(dx)<=radius)out.push({...prop,worldX:x,chunkIndex:i,distance:dx})}}return out.sort((a,b)=>Math.abs(a.distance)-Math.abs(b.distance))} interactAt(worldX,radius){const target=this.getNearbyProps(worldX,radius||110)[0];if(!target)return {ok:false,message:'چیزی برای تعامل در نزدیکی نیست'};const actions={phonebooth:'کیوسک تلفن بررسی شد؛ آماده اتصال به رویداد داستانی',newspaper:'روزنامه پیدا شد؛ سرنخ داستانی ثبت شد',lamp:'چراغ خیابان بررسی شد',bench:'نیمکت خیابان پیدا شد',hydrant:'شیر آتش‌نشانی بررسی شد',bin:'سطل خیابانی بررسی شد',poster:'پوستر خیابانی بررسی شد',bollard:'مانع مسیر شناسایی شد'};return {ok:true,id:target.id,type:target.type,worldX:target.worldX,message:actions[target.type]||'شیء خیابانی بررسی شد'}}snapshot(){return {version:this.version,seed:this.seed,mood:this.context.mood}}
    stats(){return {version:VERSION,seed:this.seed,cached:this.cache.size,generated:this.generated,cacheHits:this.hits,chunkWidth:CHUNK_WIDTH}}
  }
  function create(options){return new LiveWorld(options)}
  const api={version:VERSION,chunkWidth:CHUNK_WIDTH,create,makeChunk,director,hash32};
  root.SudioWorld=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
