/* Sudio WebGL2 continuous world renderer.
 * Runs on the visitor device; no inference API, server, or Actions runtime.
 * Three.js is a rendering library, not a hosted GPU service.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

(() => {
  const stage=document.querySelector('.stage');
  const legacy=document.getElementById('scene');
  if(!stage||!legacy||!window.WebGL2RenderingContext)return;
  const canvas=document.createElement('canvas');
  canvas.id='sudioWebGL';
  canvas.setAttribute('aria-label','جهان سه‌بعدی زنده Sudio');
  Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block'});
  stage.appendChild(canvas);
  legacy.style.visibility='visible';
  legacy.style.position='relative';
  legacy.style.zIndex='0';
  canvas.style.zIndex='1';

  let renderer,scene,camera;
  try {
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
    renderer.setClearColor(0x050506,0);
  } catch(error) {
    canvas.remove();
    console.warn('Sudio WebGL unavailable; retaining Canvas renderer.',error);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  scene=new THREE.Scene();
  scene.background=null;
  scene.fog=new THREE.FogExp2(0x111820,0.00135);
  camera=new THREE.PerspectiveCamera(62,16/9,.1,2200);
  camera.position.set(0,11.5,34);
  camera.lookAt(0,5.5,-105);

  const hemi=new THREE.HemisphereLight(0x9aa9b8,0x101014,1.1);scene.add(hemi);
  const moon=new THREE.DirectionalLight(0xb8c9d8,2.1);moon.position.set(-45,85,30);scene.add(moon);
  const redLight=new THREE.PointLight(0x9c1520,32,95,2);redLight.position.set(0,10,-45);scene.add(redLight);
  const groundMat=new THREE.MeshStandardMaterial({color:0x11151a,roughness:.27,metalness:.42});
  const road=new THREE.Mesh(new THREE.PlaneGeometry(54,1800),groundMat);road.rotation.x=-Math.PI/2;road.position.set(0,-.12,-760);scene.add(road);
  const mats={
    stone:new THREE.MeshStandardMaterial({color:0x303940,roughness:.82,metalness:.12}),
    dark:new THREE.MeshStandardMaterial({color:0x111820,roughness:.68,metalness:.22}),
    glass:new THREE.MeshStandardMaterial({color:0x26333b,roughness:.18,metalness:.72,emissive:0x17232b,emissiveIntensity:.22}),
    warm:new THREE.MeshStandardMaterial({color:0x9b8870,roughness:.24,emissive:0x806343,emissiveIntensity:.85}),
    red:new THREE.MeshStandardMaterial({color:0x74151d,roughness:.42,emissive:0x35070b,emissiveIntensity:.65}),
    line:new THREE.MeshStandardMaterial({color:0x68747c,roughness:.4,metalness:.6,emissive:0x20272b})
  };
  const unitBox=new THREE.BoxGeometry(1,1,1);
  const chunks=new Map(),chunkLength=110,maxChunks=9;
  let worldOffset=0,lastTime=0,frame=0;
  const rnd=(n)=>{let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
  function addBox(group,mat,x,y,z,w,h,d){
    const mesh=new THREE.Mesh(unitBox,mat);mesh.position.set(x,y+h/2,z);mesh.scale.set(w,h,d);mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);return mesh;
  }
  function makeChunk(index){
    if(chunks.has(index))return chunks.get(index);
    const g=new THREE.Group();g.position.z=-index*chunkLength;
    const seed=(index+8192)*97.31;
    // Layered city canyons: varied silhouettes, stone cornices, recessed luminous windows.
    for(let side of [-1,1]){
      let cursor=0,slot=0;
      while(cursor<chunkLength-8){
        const n=seed+slot*19+side*7;
        const width=13+rnd(n)*12,height=19+rnd(n+3)*49,depth=18+rnd(n+5)*25;
        const x=side*(13+width*.38+rnd(n+2)*4),z=-cursor-depth*.5;
        const building=new THREE.Group();building.position.set(x,0,z);g.add(building);
        addBox(building,mats.stone,0,0,0,width,height,depth);
        addBox(building,mats.dark,0,height,0,width+1.2,1.1,depth+1.2);
        addBox(building,mats.dark,0,height*.48,side*(width*.5+.12),.45,height*.96,depth+.3);
        const cols=Math.max(2,Math.floor(width/3.4)),rows=Math.max(3,Math.floor(height/4.2));
        for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
          const lit=rnd(n+row*31+col*11)>.39;
          const wm=lit?(rnd(n+row*9+col*27)>.25?mats.warm:mats.glass):mats.dark;
          const wx=-width*.39+col*(width*.78/Math.max(1,cols-1));
          const wy=2.4+row*(height-5)/Math.max(1,rows);
          addBox(building,wm,wx,wy,depth*.501,.9,1.55,.12);
        }
        // Vertical pilasters and stepped cornices give each facade real depth.
        for(let p=0;p<=cols;p++){
          const px=-width*.46+p*(width*.92/cols);
          addBox(building,mats.dark,px,0,depth*.515,.34,height,.22);
        }
        addBox(building,mats.line,0,height*.72,depth*.523,width*.92,.32,.25);
        if(rnd(n+90)>.73)addBox(building,mats.red,0,height*.52,depth*.54,width*.3,.65,.2);
        cursor+=depth+4+rnd(n+8)*9;slot++;
      }
    }
    // Central distant skyline: ensures the vanishing point is framed by visible towers,
    // not an empty gap between the two near street canyons.
    for(let i=0;i<5;i++){
      const n=seed+700+i*43;
      const width=16+rnd(n)*12,height=48+rnd(n+4)*42,depth=15+rnd(n+8)*12;
      const x=(rnd(n+2)-.5)*20;
      const z=-24-i*17-rnd(n+9)*10;
      const tower=new THREE.Group();tower.position.set(x,0,z);g.add(tower);
      addBox(tower,mats.dark,0,0,0,width,height,depth);
      addBox(tower,mats.stone,0,height*.48,depth*.501,width*.92,height*.94,.24);
      addBox(tower,mats.line,0,height,0,width+1,1.1,depth+1);
      const cols=Math.max(3,Math.floor(width/3.2)),rows=Math.max(5,Math.floor(height/4.8));
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const lit=rnd(n+row*23+col*17)>.32;
        const wx=-width*.39+col*(width*.78/Math.max(1,cols-1));
        const wy=2.8+row*(height-6)/rows;
        addBox(tower,lit?mats.warm:mats.glass,wx,wy,depth*.505,.95,1.8,.14);
      }
      for(let p=0;p<=cols;p++){
        const px=-width*.45+p*(width*.9/cols);
        addBox(tower,mats.stone,px,0,depth*.52,.3,height,.22);
      }
    }
    // Wet asphalt lane markings and sidewalks.
    addBox(g,mats.dark,0,.05,-chunkLength/2,15,.16,chunkLength);
    for(let z=0;z<chunkLength;z+=15)addBox(g,mats.line,0,.045,-z, .16,.025,5.5);
    for(let side of [-1,1]){
      addBox(g,mats.stone,side*8.4,.16,-chunkLength/2,1.1,.32,chunkLength);
      for(let z=9;z<chunkLength;z+=31){
        addBox(g,mats.dark,side*10.8,.05,-z,.18,7,.18);
        const lamp=new THREE.PointLight(0x9aabb7,2.2,17,2);lamp.position.set(side*10.8,6,-z);g.add(lamp);
      }
    }
    // Fine wet-road highlights.
    for(let i=0;i<30;i++){
      const x=(rnd(seed+i*5)-.5)*15,z=-rnd(seed+i*8)*chunkLength;
      const glint=addBox(g,mats.glass,x,.065,z,.08+rnd(i)*.5,.018,1+rnd(i)*4);
      glint.rotation.y=(rnd(i+seed)-.5)*.18;
    }
    scene.add(g);chunks.set(index,g);
    while(chunks.size>maxChunks){const keys=[...chunks.keys()].sort((a,b)=>Math.abs(b-worldOffset/chunkLength)-Math.abs(a-worldOffset/chunkLength));const k=keys[0];scene.remove(chunks.get(k));chunks.delete(k);}
    return g;
  }
  // Rain is GPU-rendered as a single point cloud.
  const rainCount=720,rainGeo=new THREE.BufferGeometry(),rainPos=new Float32Array(rainCount*3);
  for(let i=0;i<rainCount;i++){rainPos[i*3]=(Math.random()-.5)*72;rainPos[i*3+1]=Math.random()*54;rainPos[i*3+2]=-Math.random()*210;}
  rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
  const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0x9eabb6,size:.105,transparent:true,opacity:.52,depthWrite:false}));scene.add(rain);
  // Atmospheric fog banks drift slowly at different depths.
  const fogs=[];
  for(let i=0;i<7;i++){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(75,18),new THREE.MeshBasicMaterial({color:0x9caab2,transparent:true,opacity:.045,depthWrite:false,side:THREE.DoubleSide}));
    m.position.set((rnd(i)-.5)*30,5+i*2,-35-i*24);scene.add(m);fogs.push(m);
  }
  function resize(){
    const w=stage.clientWidth||1280,h=Math.round(w*9/16);
    stage.style.aspectRatio='16 / 9';
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  function animate(t){
    requestAnimationFrame(animate);
    const dt=Math.min(.05,(t-lastTime)/1000||.016);lastTime=t;frame++;
    const slider=document.getElementById('cameraOffset');
    const requested=slider?Number(slider.value):0;
    worldOffset+=(requested-worldOffset)*Math.min(1,dt*3);
    const center=Math.floor(worldOffset/chunkLength);
    for(let i=center-3;i<=center+5;i++)makeChunk(i);
    camera.position.x=Math.sin(t*.00013)*.65;
    camera.position.y=11.5+Math.sin(t*.00031)*.18;
    camera.position.z=42;
    camera.lookAt(camera.position.x*.2,5.5,-105);
    redLight.position.x=Math.sin(t*.0004)*12;
    for(let i=0;i<rainCount;i++){
      const j=i*3;rainPos[j+1]-=dt*(17+(i%11)*1.7);rainPos[j]-=dt*2.3;
      if(rainPos[j+1]<0){rainPos[j+1]=48;rainPos[j]=(Math.random()-.5)*72;rainPos[j+2]=-Math.random()*210;}
    }
    rainGeo.attributes.position.needsUpdate=true;
    fogs.forEach((f,i)=>{f.position.x=Math.sin(t*.00007+i*2)*13;f.position.z=-35-i*24+Math.sin(t*.00005+i)*3;});
    renderer.render(scene,camera);
    if(frame===2){canvas.style.zIndex='1';}
    // Preserve the legacy scene as a fallback layer. Do not hide it based on
    // draw-call counts: only a real browser visual check can certify the new scene.
    if(frame===2){legacy.style.visibility='visible';}
    if(frame%120===0){
      const status=document.getElementById('worldStatus');
      if(status)status.textContent='WebGL2 GPU · '+chunks.size+' قطعهٔ شهر · '+renderer.info.render.calls+' فراخوانی رندر · دوربین سه‌بعدی فعال';
    }

  }
  window.addEventListener('beforeunload',()=>{observer.disconnect();renderer.dispose();});
  requestAnimationFrame(animate);
  console.info('Sudio WebGL2 local GPU world renderer active', {webgl2:!!renderer.getContext(),chunks:chunks.size});
})();
