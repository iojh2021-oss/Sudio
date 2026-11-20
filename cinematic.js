/* Sudio Cinematic Backdrop — procedural noir city in the style of foggy art-deco street photography.
 * Honest scope: this is a real-time 2D procedural renderer (layered skyline tiles, fog, glow, wet-road
 * reflections, vintage cars). It is NOT a diffusion model; it approximates the look, it does not
 * reproduce a photograph. Far layers are baked into cached offscreen tiles so per-frame cost is a few drawImage calls.
 */
(function(root){
  'use strict';
  const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
  const TILE_W=1100,TILE_H=540,CELL=110,PER_TILE=TILE_W/CELL,MAX_TILES=30;
  const LAYERS=[
    {par:.05,fog:.66,hmin:150,hmax:300,wmin:56,wmax:92,lit:.16,col:[48,60,70],tower:.14,seed:101},
    {par:.11,fog:.46,hmin:190,hmax:380,wmin:62,wmax:100,lit:.22,col:[30,40,49],tower:.16,seed:211},
    {par:.22,fog:.24,hmin:230,hmax:430,wmin:70,wmax:104,lit:.3,col:[16,23,30],tower:.12,seed:307}
  ];
  const cache=new Map();let seedBase=0;
  function mk(w,h){const c=(typeof OffscreenCanvas!=='undefined')?new OffscreenCanvas(w,h):document.createElement('canvas');c.width=w;c.height=h;return c}
  function tint(mood){return mood==='red'?[255,190,160]:mood==='mono'?[235,235,235]:[255,232,176]}
  // One building: stepped art-deco tiers, crown, lit windows.
  function building(g,x,base,w,h,seed,L,tn){
    const tiers=h>260?3:h>170?2:1;let cw=w,cx=x,top=base,rem=h;
    for(let t=0;t<tiers;t++){
      const th=t===tiers-1?rem:rem*(t===0?.58:.6);
      const grad=g.createLinearGradient(cx,0,cx+cw,0),c=L.col;
      grad.addColorStop(0,'rgb('+(c[0]*.7|0)+','+(c[1]*.7|0)+','+(c[2]*.75|0)+')');
      grad.addColorStop(.45,'rgb('+(c[0]*1.25|0)+','+(c[1]*1.25|0)+','+(c[2]*1.2|0)+')');
      grad.addColorStop(1,'rgb('+(c[0]*.5|0)+','+(c[1]*.5|0)+','+(c[2]*.55|0)+')');
      g.fillStyle=grad;g.fillRect(cx,top-th,cw,th);
      g.fillStyle='rgba(0,0,0,.35)';g.fillRect(cx+cw*.8,top-th,cw*.2,th);            // shaded side
      g.fillStyle='rgba(170,185,190,.18)';g.fillRect(cx,top-th,cw,2);                 // cornice highlight
      // windows
      const cols=Math.max(2,Math.floor(cw/9)),rows=Math.max(2,Math.floor(th/13)),ww=cw/cols,hh=th/rows;
      for(let r=0;r<rows;r++)for(let k=0;k<cols;k++){
        const n=seed*13+t*977+r*71+k*113;
        if(hash(n)<L.lit){g.fillStyle='rgba('+tn[0]+','+tn[1]+','+tn[2]+','+(.35+hash(n+5)*.5).toFixed(2)+')';g.fillRect(cx+k*ww+ww*.22,top-th+r*hh+hh*.2,ww*.5,hh*.55)}
      }
      top-=th;rem-=th;cx+=cw*.11;cw*=.78;
    }
    if(h>300){g.fillStyle='rgba(8,12,16,.9)';const n=Math.floor(cw/4);for(let i=0;i<n;i+=2)g.fillRect(cx+i*4,top-7,4,7);g.fillRect(cx+cw/2-1,top-26,2,26)}   // crown crenellation + spire
  }
  function tile(li,ti,mood){
    const key=li+':'+ti+':'+mood+':'+seedBase,hit=cache.get(key);
    if(hit){cache.delete(key);cache.set(key,hit);return hit}
    const L=LAYERS[li],c=mk(TILE_W,TILE_H),g=c.getContext('2d'),tn=tint(mood),base=TILE_H;
    for(let j=0;j<PER_TILE;j++){
      const gi=ti*PER_TILE+j,s=L.seed+gi*31+seedBase;
      if(hash(s+1)<.12)continue;                                        // gaps between blocks
      const w=L.wmin+hash(s+2)*(L.wmax-L.wmin);
      let h=L.hmin+hash(s+3)*(L.hmax-L.hmin);
      if(hash(s+4)<L.tower)h*=1.55;                                     // occasional tall tower
      building(g,j*CELL+hash(s+5)*(CELL-w),base,w,Math.min(h,TILE_H-8),s,L,tn);
    }
    // depth fog baked per layer: opaque at the horizon fading upward
    const f=g.createLinearGradient(0,0,0,TILE_H);
    f.addColorStop(0,'rgba(150,158,156,'+(L.fog*.25)+')');f.addColorStop(1,'rgba(176,178,168,'+(L.fog*.9)+')');
    g.globalCompositeOperation='source-atop';g.fillStyle=f;g.fillRect(0,0,TILE_W,TILE_H);g.globalCompositeOperation='source-over';
    cache.set(key,c);while(cache.size>MAX_TILES)cache.delete(cache.keys().next().value);
    return c;
  }
  function layerTiles(li,camera,fn){
    const off=camera*LAYERS[li].par,first=Math.floor(off/TILE_W)-0,last=Math.floor((off+1280)/TILE_W);
    for(let t=first;t<=last;t++)fn(tile(li,t,fn.mood),t*TILE_W-off);
  }
  const baked={};
  function bake(key,w,h,fn){let c=baked[key];if(c)return c;c=mk(w,h);fn(c.getContext('2d'));return baked[key]=c}
  let far=null,farKey='';
  function drawBackdrop(g,W,H,camera,time,mood){
    mood=mood||'noir';const hor=520;
    // far plate (sky + glow + farthest skyline + mist) barely moves: re-composed only when it shifts by a whole pixel
    const key=mood+':'+Math.round(camera*LAYERS[0].par)+':'+seedBase;
    if(!far)far=mk(W,hor);
    if(key!==farKey){
      farKey=key;const k=far.getContext('2d');k.clearRect(0,0,W,hor);
      k.drawImage(bake('sky',W,hor,(q)=>{
        const sk=q.createLinearGradient(0,0,0,hor);
        sk.addColorStop(0,'#03060a');sk.addColorStop(.38,'#141b21');sk.addColorStop(.72,'#4a5453');sk.addColorStop(1,'#b3b3a6');
        q.fillStyle=sk;q.fillRect(0,0,W,hor);
        const gl=q.createRadialGradient(W*.55,hor-60,10,W*.55,hor-60,520);
        gl.addColorStop(0,'rgba(255,248,226,.78)');gl.addColorStop(.3,'rgba(232,230,212,.34)');gl.addColorStop(1,'rgba(232,230,212,0)');
        q.fillStyle=gl;q.fillRect(0,0,W,hor);
      }),0,0);
      const fn=(img,x)=>k.drawImage(img,x,hor-TILE_H);fn.mood=mood;layerTiles(0,camera,fn);
      k.drawImage(bake('mist',W,260,(q)=>{const m=q.createLinearGradient(0,0,0,260);m.addColorStop(0,'rgba(190,190,176,0)');m.addColorStop(1,'rgba(196,196,182,.30)');q.fillStyle=m;q.fillRect(0,0,W,260)}),0,hor-260);
    }
    g.drawImage(far,0,0);
    // drifting smoke: one baked strip (wraps), scrolled by time + a little camera parallax
    const SW=1900,smoke=bake('smoke',SW,320,(k)=>{
      for(let i=0;i<9;i++){const cx=hash(i*9+1)*SW,cy=60+hash(i*9+2)*200,r=150+hash(i*9+3)*190;
        const cg=k.createRadialGradient(cx,cy,10,cx,cy,r);cg.addColorStop(0,'rgba(124,132,132,.18)');cg.addColorStop(1,'rgba(124,132,132,0)');
        k.fillStyle=cg;k.fillRect(cx-r,cy-r,r*2,r*2);k.fillRect(cx-r-SW,cy-r,r*2,r*2)}
    });
    const so=(((time*14+camera*.03)%SW)+SW)%SW;g.drawImage(smoke,-so,20);g.drawImage(smoke,SW-so,20);
    for(let li=1;li<LAYERS.length;li++){const fn=(img,x)=>g.drawImage(img,x,hor-TILE_H);fn.mood=mood;layerTiles(li,camera,fn)}
  }
  // One-point-perspective street canyon: real facade quads receding to the vanishing point (640,493).
  // Camera motion advances the depth offset, so new facades emerge from the fog continuously.
  function drawCanyon(g,W,H,camera,mood){
    const vx=640,vy=493,K=.42,tn=tint(mood),zo=camera/380,b=Math.floor(zo),f=zo-b,D=520;
    const S=z=>1/(1+K*Math.max(z,-1.6));
    for(let j=11;j>=0;j--)for(const side of [-1,1]){
      const gi=b+j,seed=gi*17+(side>0?5:0)+seedBase*3,z0=j-f-1,z1=j-f,s0=S(z0),s1=S(z1);
      let h=240+hash(seed+1)*420;if(hash(seed+2)<.2)h*=1.45;
      const x0=vx+side*D*s0,x1=vx+side*D*s1,yb0=vy+227*s0,yb1=vy+227*s1;
      const t0=yb0-h*s0,t1=yb1-h*s1,fog=Math.min(1,Math.max(0,(z1+.5)/13)),fk=Math.pow(fog,.7);
      const r=(14+(150-14)*fk)|0,gc=(20+(158-20)*fk)|0,bc=(27+(152-27)*fk)|0;
      g.fillStyle='rgb('+r+','+gc+','+bc+')';g.beginPath();g.moveTo(x0,t0);g.lineTo(x1,t1);g.lineTo(x1,yb1);g.lineTo(x0,yb0);g.closePath();g.fill();
      if(s1<.09||fk>.75)continue;
      const cols=3,rows=Math.max(4,Math.floor(h/52)),la=(1-fk)*.9;
      for(let c=0;c<cols;c++){
        const u0=c/cols+.1/cols,u1=(c+1)/cols-.2/cols,zz0=z0+(z1-z0)*u0,zz1=z0+(z1-z0)*u1,sa=S(zz0),sb=S(zz1);
        const xa=vx+side*D*sa,xb=vx+side*D*sb;
        for(let r=1;r<rows;r++){
          const n=seed*7+c*131+r*29;if(hash(n)>.34)continue;
          const v0=(r+.15)*h/rows,v1=(r+.7)*h/rows;
          g.fillStyle='rgba('+tn[0]+','+tn[1]+','+tn[2]+','+((.35+hash(n+3)*.55)*la).toFixed(2)+')';
          g.beginPath();g.moveTo(xa,vy+227*sa-v0*sa);g.lineTo(xb,vy+227*sb-v0*sb);g.lineTo(xb,vy+227*sb-v1*sb);g.lineTo(xa,vy+227*sa-v1*sa);g.closePath();g.fill();
        }
      }
    }
  }
  // wet road: mirror the lit skyline strip below the horizon, fade with distance
  function drawReflection(g,W,H,camera,mood){
    const hor=520,RH=170;g.save();
    g.beginPath();g.moveTo(W*.43,hor);g.lineTo(W*.57,hor);g.lineTo(W+120,H);g.lineTo(-120,H);g.closePath();g.clip();
    for(let li=2;li<LAYERS.length;li++){
      g.globalAlpha=.2;
      const fn=(img,x)=>{g.save();g.translate(0,hor);g.scale(1,-1);g.drawImage(img,0,TILE_H-RH,TILE_W,RH,x,0,TILE_W,RH*1.15);g.restore()};fn.mood=mood;layerTiles(li,camera,fn);
    }
    g.globalAlpha=1;
    g.drawImage(bake('rfade',W,H-hor,(k)=>{const f=k.createLinearGradient(0,0,0,H-hor);f.addColorStop(0,'rgba(60,66,68,0)');f.addColorStop(.35,'rgba(8,12,16,.55)');f.addColorStop(1,'rgba(2,4,6,.92)');k.fillStyle=f;k.fillRect(0,0,W,H-hor)}),0,hor);g.restore();
  }
  function car(g,x,y,s,dir,t){
    g.save();g.translate(x,y);g.scale(s*dir,s);
    g.fillStyle='rgba(0,0,0,.5)';g.beginPath();g.ellipse(0,2,46,7,0,0,7);g.fill();
    g.fillStyle='#07090c';g.beginPath();g.moveTo(-44,-4);g.lineTo(-44,-22);g.quadraticCurveTo(-40,-27,-30,-28);g.lineTo(-18,-44);g.quadraticCurveTo(-12,-48,-2,-48);g.lineTo(14,-48);g.quadraticCurveTo(22,-46,26,-30);g.lineTo(40,-27);g.quadraticCurveTo(46,-24,46,-12);g.lineTo(46,-4);g.closePath();g.fill();
    g.fillStyle='rgba(150,165,170,.22)';g.fillRect(-14,-43,11,13);g.fillRect(2,-43,12,13);
    g.fillStyle='#050607';g.beginPath();g.arc(-26,-2,9,0,7);g.arc(28,-2,9,0,7);g.fill();
    // headlights glow
    const hl=g.createRadialGradient(46,-16,1,46,-16,40);hl.addColorStop(0,'rgba(255,248,214,.95)');hl.addColorStop(.25,'rgba(255,240,190,.42)');hl.addColorStop(1,'rgba(255,240,190,0)');
    g.globalCompositeOperation='lighter';g.fillStyle=hl;g.fillRect(6,-56,90,80);g.globalCompositeOperation='source-over';
    g.restore();
  }
  function drawCars(g,W,H,camera,time){
    for(let i=0;i<4;i++){
      const dir=i%2?1:-1,lane=i%2?.62:.38,speed=18+i*7;
      const t=(((hash(i*7+3)*1600+time*speed*dir-camera*.4)%1700)+1700)%1700-200;
      const y=548+(i%3)*34,sc=.34+(y-520)/260;
      const x=t;car(g,x,y,sc*(1.0+lane*0.1),dir,time);
    }
  }
  function drawAtmosphere(g,W,H){
    g.drawImage(bake('atmo',W,200,(k)=>{const f=k.createLinearGradient(0,0,0,200);f.addColorStop(0,'rgba(190,190,176,0)');f.addColorStop(.55,'rgba(196,196,182,.20)');f.addColorStop(1,'rgba(196,196,182,0)');k.fillStyle=f;k.fillRect(0,0,W,200)}),0,380);
  }
  function drawVignette(g,W,H){
    g.drawImage(bake('vig',W,H,(k)=>{const v=k.createRadialGradient(W/2,H*.48,H*.35,W/2,H*.5,H*.95);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.62)');k.fillStyle=v;k.fillRect(0,0,W,H)}),0,0);
  }
  function setSeed(s){const n=(Number(s)>>>0)%100000;if(n!==seedBase){seedBase=n;cache.clear()}}
  root.SudioCinema={drawCanyon,drawBackdrop,drawReflection,drawCars,drawAtmosphere,drawVignette,setSeed,stats:()=>({tiles:cache.size}),version:'1.0.0'};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.SudioCinema;
})(typeof globalThis!=='undefined'?globalThis:this);
