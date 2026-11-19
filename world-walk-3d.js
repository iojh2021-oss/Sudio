import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const stage=document.getElementById('worldWalkStage');
const status=document.getElementById('worldWalkStatus');
const startButton=document.getElementById('worldWalkStart');
const stopButton=document.getElementById('worldWalkStop');
if(!stage||!startButton)return;

let renderer,scene,camera,clock,hero,active=false,raf=0,resizeObserver;
const keys={forward:false,back:false,left:false,right:false};
const chunks=new Map(),rain=null,world={distance:0,quality:'mobile'};
const mats={};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(seed)=>{let x=seed|0;return()=>{x=(x+0x6D2B79F5)|0;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296}};
function material(color,roughness=.8,metalness=0,emissive=0x000000,intensity=0){return new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity:intensity})}
function box(parent,w,h,d,mat,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=true;parent.add(m);return m}
function makeCharacter(){
 const root=new THREE.Group();const coat=material(0x11151a,.88),coatEdge=material(0x242b32,.8),skin=material(0x9b8170),hat=material(0x090b0e),shoe=material(0x07090b,.65),glow=material(0x242a30,.5,.1,0x8b9aa8,.15);
 const torso=box(root,.62,.9,.34,coat,0,1.12,0);torso.rotation.x=-.04;
 const head=new THREE.Mesh(new THREE.SphereGeometry(.22,16,12),skin);head.position.set(0,1.82,0);root.add(head);
 const brim=box(root,.48,.055,.43,hat,0,2.01,0);box(root,.32,.19,.32,hat,0,2.11,0);
 const scarf=box(root,.64,.12,.36,coatEdge,0,1.55,-.015);
 const arms=[],legs=[];
 for(const side of [-1,1]){
  const arm=new THREE.Group();arm.position.set(side*.38,1.48,0);root.add(arm);
  const sleeve=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.48,4,8),coatEdge);sleeve.rotation.z=side*.13;sleeve.position.y=-.28;arm.add(sleeve);
  const hand=new THREE.Mesh(new THREE.SphereGeometry(.085,10,8),skin);hand.position.set(side*.04,-.56,.01);arm.add(hand);arms.push(arm);
  const leg=new THREE.Group();leg.position.set(side*.18,.72,0);root.add(leg);
  const trouser=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.53,4,8),coat);trouser.position.y=-.34;leg.add(trouser);
  const foot=box(leg,.22,.12,.42,shoe,0,-.65,-.1);legs.push(leg);
 }
 root.userData={arms,legs,torso,head,scarf,hat:brim};root.position.set(0,0,5);return root;
}
function addBuilding(group,r,side,z){
 const width=5+r()*5,height=15+r()*35,depth=12+r()*13,x=side*(8+width/2+r()*3);
 const facade=material([0x20262c,0x292d31,0x343638,0x1b2229][Math.floor(r()*4)],.92);
 const b=box(group,width,height,depth,facade,x,height/2,z);
 const trim=material(0x55504a,.85),dark=material(0x080b0e,.55),windowMat=new THREE.MeshStandardMaterial({color:0xe6d8b8,emissive:0xffd99a,emissiveIntensity:1.25,roughness:.3});
 // Cornice and recessed ground-floor details.
 box(group,width+.28,.22,depth+.2,trim,x,height-.4,z);
 box(group,width+.4,.32,depth+.35,trim,x,height*.22,z);
 const cols=Math.max(2,Math.floor(width/1.15)),rows=Math.max(3,Math.floor((height-3)/2.1));
 const winGeo=new THREE.PlaneGeometry(.42,.82),darkGeo=new THREE.PlaneGeometry(.48,.9);
 const lit=[],unlit=[];
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const wx=x-width/2+.7+col*((width-1.4)/Math.max(1,cols-1)),wy=2+row*2.05;
  const m=new THREE.Mesh(r()>.42?winGeo:darkGeo,r()>.28?windowMat:dark);
  m.position.set(wx,wy,z+depth/2+.012);group.add(m);
  if(m.material===windowMat)lit.push(m);
 }
 // Side-wall windows add scale and parallax.
 for(const sideSign of [-1,1]){
  for(let row=0;row<Math.min(rows,12);row++)for(let col=0;col<2;col++){
   const m=new THREE.Mesh(new THREE.PlaneGeometry(.42,.8),r()>.6?windowMat:dark);
   m.rotation.y=sideSign*Math.PI/2;m.position.set(x+sideSign*(width/2+.012),2+row*2.1,z-depth/2+2+col*3);group.add(m);
  }
 }
 // fire escape rails
 if(r()>.45){const railMat=material(0x090d11,.6,.5);for(let level=1;level<Math.min(5,Math.floor(height/5));level++){const y=level*4+2;box(group,width*.72,.055,.12,railMat,x,y,z+depth/2+.13);for(let k=-2;k<=2;k++)box(group,.045,.7,.06,railMat,x+k*width*.14,y-.35,z+depth/2+.13)}}
}
function makeChunk(index){
 if(chunks.has(index))return chunks.get(index);
 const group=new THREE.Group(),r=rand(918273+index*7919),start=-index*52;
 const asphalt=material(0x10161d,.2,.28),curb=material(0x55585b,.85),sidewalk=material(0x24292d,.9);
 box(group,17,.12,52,asphalt,0,-.08,start-26);
 for(const side of [-1,1]){
  box(group,3,.25,52,sidewalk,side*10,-.02,start-26);
  box(group,.25,.28,52,curb,side*8.55,.04,start-26);
  for(let b=0;b<3;b++)addBuilding(group,r,side,start-8-b*17);
  // Street lamps with warm practical light.
  for(let k=0;k<2;k++){
   const z=start-8-k*25,x=side*7.7,metal=material(0x101418,.45,.7),bulb=new THREE.MeshStandardMaterial({color:0xffe5bd,emissive:0xffc77c,emissiveIntensity:2.2});
   box(group,.09,4,.09,metal,x,2,z);box(group,.7,.08,.08,metal,x-side*.28,4,z);
   const lamp=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),bulb);lamp.position.set(x-side*.55,3.94,z);group.add(lamp);
   if(index===0&&k===0){const light=new THREE.PointLight(0xffc98c,13,13,2);light.position.set(x-side*.55,3.7,z);group.add(light)}
  }
 }
 // Wet-road reflection streaks and lane markings.
 const reflectionMats=[0x6b747a,0x9a9a8d,0x3e5967].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.12,depthWrite:false}));
 for(let i=0;i<22;i++){const w=.04+r()*.28,len=1+r()*6,x=(r()-.5)*7,z=start-r()*52;const streak=box(group,w,.008,len,reflectionMats[i%3],x,.003,z);streak.rotation.y=(r()-.5)*.12}
 for(let i=0;i<8;i++)box(group,.12,.012,2.4,material(0x55585a,.9),0,.005,start-i*7-3);
 scene.add(group);chunks.set(index,group);
 // Keep a small streaming window around the player.
 for(const [key,obj] of chunks)if(Math.abs(key-index)>3){scene.remove(obj);disposeGroup(obj);chunks.delete(key)}
 return group;
}
function disposeGroup(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose()})}
function addRain(){
 const count=renderer.capabilities.isWebGL2?850:420,positions=new Float32Array(count*3);
 for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*28;positions[i*3+1]=Math.random()*18;positions[i*3+2]=-Math.random()*55}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const rainMat=new THREE.PointsMaterial({color:0xb9c8d2,size:.045,transparent:true,opacity:.45,depthWrite:false});
 const points=new THREE.Points(geo,rainMat);scene.add(points);return points;
}
async function loadBackdrop(){
 try{
  const response=await fetch('./generated-world/manifest.json',{cache:'no-cache'});if(!response.ok)return;
  const manifest=await response.json();const tile=manifest.tiles?.[0];if(!tile?.file)return;
  const tex=await new THREE.TextureLoader().loadAsync('./generated-world/'+tile.file);
  tex.colorSpace=THREE.SRGBColorSpace;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(100,46),new THREE.MeshBasicMaterial({map:tex,transparent:false,fog:false}));
  plane.position.set(0,22,-95);scene.add(plane);
  status.textContent='صحنه سه‌بعدی فعال؛ تصویر AI برای پس‌زمینهٔ دوردست بارگذاری شد.';
 }catch(_){status.textContent='صحنه سه‌بعدی فعال؛ هنوز تصویر FLUX در Manifest موجود نیست.'}
}
function init(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x101a24);scene.fog=new THREE.FogExp2(0x9aa0a2,.012);
 camera=new THREE.PerspectiveCamera(65,1,.1,220);camera.position.set(0,4.1,10.5);
 const hemi=new THREE.HemisphereLight(0x9caab9,0x111318,1.2);scene.add(hemi);
 const moon=new THREE.DirectionalLight(0x9fb2c7,1.35);moon.position.set(-8,18,12);scene.add(moon);
 const glow=new THREE.PointLight(0xffdfb2,45,65,1.8);glow.position.set(0,13,-48);scene.add(glow);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300),material(0x10151b,.22,.22));ground.rotation.x=-Math.PI/2;ground.position.y=-.17;ground.position.z=-80;scene.add(ground);
 for(let i=0;i<5;i++)makeChunk(i);
 hero=makeCharacter();scene.add(hero);
 renderer=new THREE.WebGLRenderer({antialias:!(/Android|iPhone|iPad/i.test(navigator.userAgent)),powerPreference:'high-performance',alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
 renderer.shadowMap.enabled=false;stage.prepend(renderer.domElement);
 clock=new THREE.Clock();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);resize();
 world.rain=addRain();loadBackdrop();
}
function resize(){if(!renderer||!camera)return;const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
function move(dt){
 const forward=(keys.forward?1:0)-(keys.back?1:0),side=(keys.right?1:0)-(keys.left?1:0),moving=forward!==0||side!==0;
 const speed=5.2*dt;hero.position.z-=forward*speed;hero.position.x=clamp(hero.position.x+side*speed,-4.8,4.8);
 hero.position.z=clamp(hero.position.z,-45,7);
 const t=clock.elapsedTime,amp=moving?Math.sin(t*10)*.48:Math.sin(t*1.6)*.035;
 hero.userData.legs[0].rotation.x=amp;hero.userData.legs[1].rotation.x=-amp;
 hero.userData.arms[0].rotation.x=-amp*.72;hero.userData.arms[1].rotation.x=amp*.72;
 hero.position.y=moving?Math.abs(Math.sin(t*10))*.035:0;
 const target=new THREE.Vector3(hero.position.x*.45,2.65,hero.position.z-12);
 camera.position.lerp(new THREE.Vector3(hero.position.x*.32,4.0,hero.position.z+10.5),1-Math.exp(-dt*3.4));
 camera.lookAt(target);
 const chunkIndex=Math.max(0,Math.floor(-hero.position.z/52));for(let i=chunkIndex;i<chunkIndex+5;i++)makeChunk(i);
 world.distance=Math.max(world.distance,-hero.position.z);
 if(world.rain){const a=world.rain.geometry.attributes.position;for(let i=0;i<a.count;i++){let y=a.getY(i)-dt*17;if(y<0)y=16+Math.random()*3;a.setY(i,y)}a.needsUpdate=true;world.rain.position.z=hero.position.z-18}
}
function frame(){if(!active)return;raf=requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.04);move(dt);renderer.render(scene,camera)}
function key(e,down){const map={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};const k=map[e.code];if(k){keys[k]=down;e.preventDefault()}}
function clearKeys(){Object.keys(keys).forEach(k=>keys[k]=false)}
function bind(){
 window.addEventListener('keydown',e=>key(e,true));window.addEventListener('keyup',e=>key(e,false));window.addEventListener('blur',clearKeys);
 stage.querySelectorAll('[data-walk]').forEach(btn=>{const k=btn.dataset.walk;btn.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true;btn.setPointerCapture?.(e.pointerId)});['pointerup','pointercancel','lostpointercapture'].forEach(type=>btn.addEventListener(type,()=>keys[k]=false))});
}
function start(){if(active)return;try{if(!renderer)init();active=true;clock.start();frame();bind();startButton.disabled=true;status.textContent='جهان سه‌بعدی آماده است؛ با WASD یا دکمه‌های لمسی حرکت کن.'}catch(e){status.textContent='خطای راه‌اندازی WebGL: '+e.message}}
function stop(){active=false;cancelAnimationFrame(raf);clearKeys();startButton.disabled=false;if(renderer)renderer.render(scene,camera);status.textContent='جهان متوقف شد. برای ادامه دوباره وارد شو.'}
startButton.addEventListener('click',start);stopButton.addEventListener('click',stop);
