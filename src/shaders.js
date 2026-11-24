// شیدرهای GLSL ES 3.00 — همهٔ «نقاشی» شهر (پنجره‌ها، مه، آسمان، خیابان خیس) این‌جا در GPU انجام می‌شود
export const COMMON = `#version 300 es
precision highp float;
uniform vec3 u_cam; uniform float u_time, u_fogD, u_exposure, u_wet, u_sat;
uniform vec3 u_fogA, u_fogB, u_amb, u_sun, u_hor, u_zen, u_glow;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+17.1; a*=.5; } return s; }
vec3 fogColor(vec3 dir){ float g=pow(max(dot(dir,vec3(0.,0.,-1.)),0.),3.); return mix(u_fogA,u_fogB,g); }
vec3 applyFog(vec3 c, vec3 wp){ vec3 v=wp-u_cam; float d=length(v); float f=1.-exp(-pow(d*u_fogD,1.6)); f*=1.-.35*clamp(wp.y/60.,0.,1.); return mix(c,fogColor(v/max(d,1e-3)),clamp(f,0.,1.)); }
vec3 grade(vec3 c){ c=1.-exp(-c*u_exposure*1.15); float l=dot(c,vec3(.299,.587,.114)); float red=max(c.r-(c.g+c.b)*.5,0.); vec3 g=mix(vec3(l),c,u_sat); g+=vec3(red*.8,-red*.15,-red*.15)*(1.-u_sat)*.9; return pow(max(g,0.),vec3(.92)); }
`;
export const BOX_VS = `#version 300 es
layout(location=0) in vec3 a_p; layout(location=1) in vec3 a_n;
layout(location=2) in vec3 i_c; layout(location=3) in vec3 i_s; layout(location=4) in vec3 i_col; layout(location=5) in vec3 i_k;
uniform mat4 u_vp; uniform float u_flip;
out vec3 v_wp; out vec3 v_n; out vec3 v_col; out vec3 v_k;
void main(){ vec3 wp=i_c+a_p*i_s; v_wp=wp; v_n=a_n; v_col=i_col; v_k=i_k; gl_Position=u_vp*vec4(wp.x,wp.y*u_flip,wp.z,1.); }`;
export const BOX_FS = COMMON + `
in vec3 v_wp; in vec3 v_n; in vec3 v_col; in vec3 v_k;
uniform float u_reveal, u_lamp, u_lit; out vec4 o;
void main(){
  if(u_reveal<1.){ float n=h21(floor(v_wp.xz*.35)+floor(v_wp.y*.3)); if(n>u_reveal*1.05) discard; }
  vec3 N=normalize(v_n), col=v_col, L=normalize(vec3(.25,.55,-.75));
  vec3 light=u_amb*(.55+.45*N.y)+u_sun*max(dot(N,L),0.);
  if(v_k.x<.5){
    if(abs(N.y)<.5){
      float along=abs(N.x)>.5? v_wp.z : v_wp.x; vec2 g=vec2(along/2.7, v_wp.y/3.5); vec2 cell=floor(g), f=fract(g);
      float r=h21(cell+v_k.z), r2=h21(cell*1.7+v_k.z+3.1);
      float dd=length(v_wp-u_cam), det=smoothstep(230.,70.,dd)*smoothstep(.1,.45,abs(dot(N,(u_cam-v_wp)/max(dd,1e-3))))*smoothstep(1.1,.3,fwidth(g.x)+.6*fwidth(g.y));
      bool win = f.x>.2&&f.x<.8&&f.y>.2&&f.y<.78&&v_wp.y>2.2;
      if(det<.02){ col=mix(col*(.75+.25*h21(floor(g/6.))), vec3(1.,.8,.5)*.55, clamp(v_k.y*u_lit,0.,.9)*.35*step(2.2,v_wp.y)); }
      else if(win){
        float on=step(r,clamp(v_k.y*u_lit,0.,.95));
        vec3 wc=mix(vec3(1.,.8,.5),vec3(.7,.88,1.),r2)*(.5+.9*h21(cell+v_k.z*3.1));
        float fl=1.+.08*sin(u_time*3.+r*40.)*step(.85,r2);
        vec3 glass=vec3(.025,.04,.055)+u_hor*.12+vec3(.04)*pow(1.-abs(N.y),2.)*smoothstep(0.,40.,v_wp.y);
        vec3 wcol=on>.5? wc*1.5*fl : glass; col=mix(mix(col,vec3(1.,.8,.5)*.55*clamp(v_k.y*u_lit,0.,.9),.35),wcol,det); if(on>.5) light=mix(light,vec3(1.),det);
      } else {
        col*=1.-.18*smoothstep(.88,1.,f.y)*det; col*=.9+.2*mix(.5,h21(floor(g*vec2(1.,2.))),det);
      }
      col*=.68+.32*smoothstep(0.,26.,v_wp.y);
    } else if(N.y>.5) col*=.45;
  } else if(v_k.x>1.5){ col*=1.9; light=vec3(1.); }
  vec3 c=col*light;
  c+=v_col*vec3(1.,.68,.4)*u_lamp*exp(-v_wp.y/6.5)*.55*(v_k.x<1.5?1.:0.);
  c=applyFog(c,vec3(v_wp.x,abs(v_wp.y),v_wp.z));
  o=vec4(grade(c),1.);
}`;
export const GROUND_VS = `#version 300 es
layout(location=0) in vec2 a_p; uniform mat4 u_vp; uniform vec2 u_ctr; out vec3 v_wp;
void main(){ vec3 wp=vec3(u_ctr.x+a_p.x*260., 0., u_ctr.y+a_p.y*260.); v_wp=wp; gl_Position=u_vp*vec4(wp,1.); }`;
export const GROUND_FS = COMMON + `
in vec3 v_wp; uniform float u_lamp, u_rain, u_biome, u_water; uniform vec3 u_g1, u_g2, u_gp; out vec4 o;
float lampPool(vec2 p){ float zz=mod(p.y-10.+8.,16.)-8.; float a=exp(-(pow(abs(p.x)-6.8,2.)+zz*zz)/26.); return a; }
void main(){
  vec2 p=v_wp.xz; float ax=abs(p.x);
  float k=floor(-p.y/48.); float zc=-(k+.5)*48.; float ik=mod(k,4.); bool inter=ik<.5||ik>3.5; float dz=p.y-zc;
  bool cross_ = inter && abs(dz)<7.5;
  vec3 col; float walk=0.;
  float dg=length(v_wp-u_cam), det=smoothstep(110.,25.,dg);
  float nz=fbm(p*.8), nz2=mix(.5,fbm(p*5.),det);
  float water=0.;
  if(u_biome>.5){
    float wx=19.+sin(p.y*.04)*3.+sin(p.y*.11)*1.2;
    float nn=fbm(p*.12), n2=mix(.5,fbm(p*2.5),det);
    col=mix(u_g1,u_g2,nn)*(.8+.4*n2);
    float trail=smoothstep(2.3,1.3,abs(p.x)+(n2-.5)*.8);
    col=mix(col,u_gp*(.75+.5*n2),trail*.9);
    if(u_biome<1.5){ col*=.7+.5*smoothstep(.35,.75,fbm(p*.5+7.)); }
    else if(u_biome<2.5){ col*=.93+.07*sin(p.x*3.+nn*8.+p.y*.5); }
    else if(u_biome<3.5){ col+=vec3(step(.985,h21(floor(p*6.)))*det*.3); }
    else if(u_biome<4.5){ float fl=step(.982,h21(floor(p*3.)))*det*(1.-trail); col=mix(col,mix(vec3(1.,.9,.3),vec3(.95,.3,.4),h21(floor(p*3.)+4.)),fl); }
    else if(u_biome<5.5){
      if(p.x>wx){ water=1.; float d=p.x-wx; col=mix(vec3(.12,.42,.5),vec3(.02,.18,.3),smoothstep(0.,25.,d));
        col+=vec3(.5,.7,.75)*pow(max(sin(p.x*.8+u_time*1.1+p.y*.3)*sin(p.y*.6-u_time*.7),0.),6.)*.25*det;
        col=mix(col,vec3(.95),smoothstep(2.5,0.,d)*(.5+.5*sin(p.y*.9+u_time*2.))*.6); }
      else col*=1.-.3*smoothstep(4.,0.,wx-p.x);
    } else { col*=.8+.4*h21(floor(p*8.))*det; }
    col*=u_amb*.9+u_sun*.5;
  } else
  if(ax<7.||cross_){
    col=vec3(.07,.075,.08)*(.7+.6*nz2);
    if(!cross_||ax<7.){ float dash=mix(.5,step(mod(p.y,6.),3.),smoothstep(260.,90.,dg)); col=mix(col,vec3(.75,.7,.5),dash*smoothstep(.2,.12,ax)*.8*step(.01,ax)); col=mix(col,vec3(.7,.68,.55),smoothstep(.22,.1,abs(ax-6.4))*.6); }
    if(inter && abs(abs(dz)-9.)<1.2 && ax<7.){ float z=step(.5,fract(p.x*.55)); col=mix(col,vec3(.8),z*.7); }
  } else if(ax<10.6){ walk=1.; vec2 g=p/1.6; vec2 f=fract(g); float seam=mix(.85,smoothstep(.0,.04,min(f.x,f.y)),det); col=mix(vec3(.05),vec3(.17,.17,.16)*(.7+.5*nz2),seam); if(ax<7.3) col=vec3(.2)*(.8+.3*nz); }
  else col=vec3(.03);
  float pud=smoothstep(.45,.62,fbm(p*.35+3.))*u_wet;
  float pool=lampPool(p)*u_lamp*step(u_biome,.5);
  col+=vec3(1.,.72,.42)*pool*.35*(.4+.6*u_wet);
  vec3 V=normalize(u_cam-v_wp); float fres=pow(1.-max(V.y,0.),3.);
  float refl=clamp(u_wet*(.35+.5*pud)+ (1.-walk)*u_wet*.15,0.,.85); refl=mix(refl,min(refl+.25,.95),fres); refl=max(refl,u_water*water*.62);
  float rip=u_rain*u_wet*pud*(.5+.5*sin(length(fract(p*.7)-.5)*60.-u_time*9.))*.07*det; col+=rip;
  float alpha=1.-refl; vec3 c=col;
  c=applyFog(c,v_wp);
  o=vec4(grade(c),clamp(alpha,0.,1.));
}`;
export const SKY_VS = `#version 300 es
out vec2 v_ndc; void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); v_ndc=p*2.-1.; gl_Position=vec4(v_ndc,1.,1.); }`;
export const SKY_FS = COMMON + `
in vec2 v_ndc; uniform mat4 u_invVP; uniform float u_cloud, u_stars, u_aiOn, u_aiMix, u_aiYaw; uniform sampler2D u_ai0, u_ai1; out vec4 o;
void main(){
  vec4 a=u_invVP*vec4(v_ndc,1.,1.); vec3 d=normalize(a.xyz/a.w-u_cam); float h=d.y;
  vec3 c=mix(u_hor,u_zen,pow(clamp(h,0.,1.),.5));
  float g=pow(max(dot(d,vec3(0.,0.,-1.)),0.),5.); c+=u_glow*g*exp(-abs(h)*3.2)*.9;
  c+=u_glow*.25*exp(-abs(h)*9.);
  if(h>0.){ vec2 q=d.xz/(h+.22)*1.3+vec2(u_time*.012,0.); float cl=smoothstep(.35,.85,fbm(q)); c=mix(c,c*1.45+u_hor*.35,cl*u_cloud); float s=step(.9972,h21(floor(d.xz/(h+.1)*220.)))*u_stars*(1.-cl); c+=vec3(s)*.8; }
  if(u_aiOn>.5){
    float az=atan(d.x,-d.z)/1.22+.5+u_aiYaw; float u=1.-abs(1.-2.*fract(az*.5)); float v=.42+1.29*h;
    if(v>0.&&v<1.){ vec2 uv=vec2(u,1.-v); vec3 t=mix(texture(u_ai0,uv).rgb,texture(u_ai1,uv).rgb,u_aiMix);
      float lum=clamp(dot(u_amb,vec3(.333))*1.9,.22,1.05); float a=smoothstep(0.,.07,v)*smoothstep(1.,.9,v);
      c=mix(c,t*lum,a*.95); }
  }
  c=mix(c,fogColor(d),smoothstep(.35,0.,h)*.8);
  o=vec4(grade(c),1.);
}`;
// حالت «فقط پس‌زمینهٔ هوش مصنوعی»: تصویر تمام‌صفحه (cover) با پارالاکس افقی هنگام راه رفتن
export const BG_FS = COMMON + `
in vec2 v_ndc; uniform float u_aiMix, u_scroll, u_asp, u_imgAsp, u_yoff, u_lum; uniform sampler2D u_ai0, u_ai1; out vec4 o;
void main(){
  vec2 uv=v_ndc*.5+.5; vec2 s=u_asp>u_imgAsp?vec2(1.,u_imgAsp/u_asp):vec2(u_asp/u_imgAsp,1.);
  vec2 q=(uv-.5)*s+.5; q.y+=u_yoff*s.y; q.y=clamp(q.y,0.,1.);
  float x=q.x+u_scroll; q.x=1.-abs(1.-2.*fract(x*.5));
  vec2 t=vec2(q.x,1.-q.y); vec3 c=mix(texture(u_ai0,t).rgb,texture(u_ai1,t).rgb,u_aiMix)*u_lum;
  o=vec4(grade(c),1.);
}`;
// کاراکتر تصویری: بیلبورد استوانه‌ای رو به دوربین با آلفا
export const SPR_VS = `#version 300 es
uniform mat4 u_vp; uniform vec3 u_base, u_right; uniform vec2 u_size; uniform float u_flip, u_tilt, u_xf, u_sy; out vec2 v_uv; out vec3 v_wp;
void main(){ vec2 c=vec2(float(gl_VertexID&1), float((gl_VertexID>>1)&1)); float x=(c.x-.5)*u_size.x*u_xf, y=c.y*u_size.y*u_sy; float ct=cos(u_tilt), st=sin(u_tilt); vec2 r=vec2(x*ct-y*st, x*st+y*ct);
  vec3 w=u_base+u_right*r.x+vec3(0.,r.y,0.); v_wp=w; v_uv=vec2(c.x,1.-c.y); gl_Position=u_vp*vec4(w.x,w.y*u_flip,w.z,1.); }`;
export const SPR_FS = COMMON + `
in vec2 v_uv; in vec3 v_wp; uniform sampler2D u_tex; uniform float u_lamp; out vec4 o;
void main(){ vec4 t=texture(u_tex,v_uv); if(t.a<.04) discard; vec3 light=u_amb*1.9+u_sun*.8+u_glow*.25+.12+vec3(1.,.7,.42)*u_lamp*.18; vec3 c=t.rgb*light; c=applyFog(c,vec3(v_wp.x,abs(v_wp.y),v_wp.z)); o=vec4(grade(c),t.a); }`;
export const PT_VS = `#version 300 es
layout(location=0) in vec3 a_p; layout(location=1) in vec3 a_c; layout(location=2) in vec2 a_s; uniform mat4 u_vp; uniform float u_flip, u_scale, u_time; uniform vec3 u_camP;
out vec3 v_c; out float v_a;
void main(){ vec3 wp=vec3(a_p.x,a_p.y*u_flip,a_p.z); float d=length(wp-u_camP); gl_Position=u_vp*vec4(wp,1.);
  float fl=1.+.06*sin(u_time*7.+a_p.x*3.+a_p.z)*step(.5,a_s.y); gl_PointSize=clamp(a_s.x*u_scale*fl/max(d,1.),1.,220.); v_c=a_c; v_a=clamp(1.-d/320.,0.,1.); }`;
export const PT_FS = `#version 300 es
precision highp float; in vec3 v_c; in float v_a; out vec4 o;
void main(){ vec2 q=gl_PointCoord*2.-1.; float r=dot(q,q); if(r>1.) discard; float g=exp(-r*4.5); o=vec4(v_c*g*v_a*.85,g*v_a); }`;
export const RAIN_VS = `#version 300 es
layout(location=0) in vec4 a_r; uniform mat4 u_vp; uniform vec3 u_cam; uniform float u_time, u_len;
out float v_a;
void main(){ vec3 r=a_r.xyz; float e=a_r.w; float sp=22.+r.x*10.;
  float y=mod(r.y*34.-u_time*sp,34.); vec3 p=vec3(u_cam.x+(r.x-.5)*46., y-1., u_cam.z-4.-r.z*58.);
  p.x+=sin(u_time*.3+r.z*9.)*.6; vec3 tail=p+vec3(.5,u_len*e,.2)*1.; // پایین → بالا
  gl_Position=u_vp*vec4(mix(p,tail,e),1.); v_a=(1.-e*.9)*(.35+.65*r.z)*smoothstep(0.,2.,y); }`;
export const RAIN_FS = `#version 300 es
precision highp float; in float v_a; out vec4 o; void main(){ o=vec4(.6,.68,.78,1.)*v_a*.16; }`;
export const POST_VS = SKY_VS;
export const POST_FS = `#version 300 es
precision highp float; in vec2 v_ndc; uniform float u_time, u_grain, u_vig; out vec4 o;
float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
void main(){ float r=length(v_ndc*vec2(.9,.8)); float v=smoothstep(.55,1.45,r)*u_vig; float n=(h(v_ndc*500.+u_time*37.)-.5)*u_grain;
  o=vec4(0.,0.,0., clamp(v+max(-n,0.)*2.*(1.-v),0.,1.)); }`;
export const CHAR_VS = `#version 300 es
layout(location=0) in vec3 a_p; layout(location=1) in vec3 a_n; uniform mat4 u_vp, u_model; uniform float u_flip;
out vec3 v_wp; out vec3 v_n;
void main(){ vec4 w=u_model*vec4(a_p,1.); v_wp=w.xyz; v_n=normalize(mat3(u_model)*a_n); gl_Position=u_vp*vec4(w.x,w.y*u_flip,w.z,1.); }`;
export const CHAR_FS = COMMON + `
in vec3 v_wp; in vec3 v_n; uniform vec3 u_col; uniform float u_emis, u_lamp; out vec4 o;
void main(){
  vec3 N=normalize(v_n), L=normalize(vec3(.25,.55,-.75));
  vec3 V=normalize(u_cam-v_wp); float rim=pow(1.-max(dot(N,V),0.),2.5);
  vec3 light=u_amb*(.6+.4*N.y)*1.8+u_sun*max(dot(N,L),0.)*1.6+u_glow*rim*.9+vec3(1.,.7,.42)*u_lamp*.25*max(-N.y*.5+.5,0.)*exp(-v_wp.y/2.);
  vec3 c=u_col*light; if(u_emis>0.) c=u_col*u_emis;
  c=applyFog(c,vec3(v_wp.x,abs(v_wp.y),v_wp.z)); o=vec4(grade(c),1.);
}`;
