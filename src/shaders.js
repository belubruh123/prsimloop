// All GLSL. Shared snippets are separate strings so the palette and lighting
// model live in exactly one place (and repeated text compresses well).

const V = '#version 300 es\n';
const P = V + 'precision highp float;\n';

// --- shared palette + helpers -------------------------------------------------
export const PAL = `
const vec3 SKYT=vec3(.50,.45,.90);
const vec3 SKYH=vec3(1.,.82,.73);
const vec3 SUND=normalize(vec3(-.35,.62,-.45));
const vec3 SUNC=vec3(1.,.93,.80);
const vec3 BNC=vec3(.88,.70,.76);
float hsh(vec2 p){return fract(sin(dot(p,vec2(41.,289.)))*45758.5453);}
float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x),mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x),f.y);}
`;

const LIGHT = `
vec3 lit(vec3 n,vec3 alb,vec3 wp,vec3 cam){
float d=max(dot(n,SUND),0.);
vec3 hemi=mix(BNC,SKYT*1.2,n.y*.5+.5);
vec3 c=alb*(hemi*.5+SUNC*(d*.7+.3)*.85);
vec3 v=normalize(cam-wp);
c+=SUNC*pow(1.-max(dot(n,v),0.),3.)*.2;
return c;}
vec3 fogit(vec3 c,float dist,float k){
return mix(c,SKYH*.97,clamp(1.-exp(-dist*dist*k),0.,1.));}
`;

// --- instanced objects --------------------------------------------------------
export const VS_MAIN = V + `
layout(location=0)in vec3 a_p;
layout(location=1)in vec3 a_n;
layout(location=2)in vec2 a_t;
layout(location=3)in vec3 i_p;
layout(location=4)in vec3 i_s;
layout(location=5)in vec4 i_q;
layout(location=6)in vec4 i_c;
layout(location=7)in vec4 i_u;
uniform mat4 u_vp;
out vec3 v_n;out vec2 v_t;out vec4 v_c;out vec3 v_w;
vec3 qr(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
void main(){
vec3 w=qr(i_q,a_p*i_s)+i_p;
v_w=w;
v_n=normalize(qr(i_q,a_n/max(abs(i_s),1e-4)));
v_t=i_u.xy+a_t*i_u.zw;
v_c=i_c;
gl_Position=u_vp*vec4(w,1.);}`;

// u_par = (emissive, alphaCut, fogK, time)
export const FS_MAIN = P + PAL + LIGHT + `
in vec3 v_n;in vec2 v_t;in vec4 v_c;in vec3 v_w;
uniform sampler2D u_tex,u_paint;
uniform vec3 u_cam;
uniform vec4 u_par;
uniform vec2 u_des;
out vec4 o;
void main(){
vec4 tx=texture(u_tex,v_t);
float a=tx.a*v_c.a;
if(a<u_par.y)discard;
vec3 alb=tx.rgb*v_c.rgb;
// scenery is drained until the paint map says this patch has been restored
if(u_des.x>.5){
float pt=texture(u_paint,v_w.xz*u_des.y+.5).r;
float g=dot(alb,vec3(.32,.5,.18));
alb=mix(vec3(g*.58)*vec3(.74,.73,.92),alb,pt*.92+.08);}
vec3 c=mix(lit(v_n,alb,v_w,u_cam),alb*1.35,u_par.x);
o=vec4(fogit(c,length(v_w-u_cam),u_par.z),a);}`;

// --- sky ----------------------------------------------------------------------
// Fullscreen triangle; the view ray is rebuilt from the camera basis so we never
// need a matrix inverse.
export const VS_SKY = V + `
out vec2 v_uv;
void main(){
vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
v_uv=p*2.-1.;
gl_Position=vec4(v_uv,1.,1.);}`;

export const FS_SKY = P + PAL + `
in vec2 v_uv;
uniform vec3 u_r,u_u,u_f;
uniform vec2 u_asp;
uniform float u_t;
out vec4 o;
void main(){
vec3 d=normalize(u_f+u_r*v_uv.x*u_asp.x+u_u*v_uv.y*u_asp.y);
float y=d.y;
vec3 c=mix(SKYH,SKYT,smoothstep(-.04,.92,y));
// cloud sea below the horizon, deepening to soft lilac straight down
c=mix(c,mix(vec3(.97,.93,1.),vec3(.72,.66,.86),smoothstep(-.05,-.6,y)),smoothstep(.02,-.14,y));
// soft banded clouds
float b=nz(vec2(atan(d.z,d.x)*2.2+u_t*.012,y*6.-u_t*.004))*nz(vec2(atan(d.z,d.x)*5.,y*11.));
c=mix(c,vec3(1.,.97,.99),smoothstep(.34,.74,b)*smoothstep(.02,.34,y)*smoothstep(.9,.45,y)*.7);
// sun glow + disc
float s=max(dot(d,SUND),0.);
c+=SUNC*pow(s,7.)*.35+vec3(1.,.98,.94)*smoothstep(.9986,.9993,s)*.9;
// gentle vignette
c*=1.-.22*dot(v_uv,v_uv)*.5;
o=vec4(c,1.);}`;

// --- terrain ------------------------------------------------------------------
// a_t.xy carries world XZ remapped to 0..1 so it doubles as the paint-map lookup.
export const VS_TERR = V + `
layout(location=0)in vec3 a_p;
layout(location=1)in vec3 a_n;
layout(location=2)in vec2 a_t;
uniform mat4 u_vp;
out vec3 v_n;out vec2 v_t;out vec3 v_w;
void main(){v_n=a_n;v_t=a_t;v_w=a_p;gl_Position=u_vp*vec4(a_p,1.);}`;

export const FS_TERR = P + PAL + LIGHT + `
in vec3 v_n;in vec2 v_t;in vec3 v_w;
uniform sampler2D u_tile,u_paint;
uniform vec3 u_cam;
uniform vec4 u_par;
out vec4 o;
void main(){
// tiling pixel-art grass; rock is procedural so it needs no atlas space
vec3 gr=texture(u_tile,v_w.xz*.22).rgb;
vec3 rk=mix(vec3(.68,.62,.66),vec3(.82,.76,.78),nz(v_w.xz*1.7));
float slope=smoothstep(.85,.55,v_n.y);
vec3 alb=mix(gr,rk,slope);
// paint map drives the grey -> colour restoration
float pt=texture(u_paint,v_t).r;
float g=dot(alb,vec3(.32,.5,.18));
alb=mix(vec3(g*.60)*vec3(.76,.75,.92),alb,pt*.92+.08);
vec3 c=lit(v_n,alb,v_w,u_cam);
c=mix(c,c*vec3(1.06,1.,1.04),pt);
o=vec4(fogit(c,length(v_w-u_cam),u_par.z),1.);}`;

// --- rainbow ribbon -----------------------------------------------------------
// a_t.x = 0 at the dissolving tail, 1 at the horn. a_t.y = across the width.
export const VS_RIB = V + `
layout(location=0)in vec3 a_p;
layout(location=1)in vec3 a_n;
layout(location=2)in vec2 a_t;
uniform mat4 u_vp;
out vec2 v_t;out vec3 v_w;
void main(){v_t=a_t;v_w=a_p;gl_Position=u_vp*vec4(a_p,1.);}`;

// u_par = (alpha, flash, fogK, time)
export const FS_RIB = P + `
in vec2 v_t;in vec3 v_w;
uniform vec3 u_cam;
uniform vec4 u_par;
uniform float u_g;
out vec4 o;
vec3 rbw(float t){return .60+.40*cos(6.2832*(t+vec3(0.,.33,.67)));}
void main(){
float y=v_t.y;
// quantised bands so it reads as a rainbow, not a smear
vec3 c=mix(rbw(y*.9+.03),rbw((floor(y*7.)/7.)*.9+.03),.7);
float edge=smoothstep(0.,.10,y)*smoothstep(1.,.90,y);
float tail=smoothstep(0.,.28,v_t.x);
float a=edge*tail*u_par.x*(.88+.12*sin(v_t.x*38.-u_par.w*7.));
// the ground shadow reads as light painted on grass, not a second solid ribbon
c=mix(c,mix(c,vec3(1.),.45),u_g);
a*=mix(1.,.62+.16*sin(u_par.w*4.-v_t.x*6.),u_g);
c=mix(c,vec3(1.4),u_par.y);
float d=length(v_w-u_cam);
a*=1.-clamp(1.-exp(-d*d*u_par.z),0.,1.)*.7;
o=vec4(c,a);}`;

// --- paint-map stamping (renders soft discs into a 128x128 R8 target) ---------
export const VS_STAMP = V + `
layout(location=0)in vec2 a_p;
uniform vec4 u_d;
out vec2 v_l;
void main(){v_l=a_p;gl_Position=vec4(u_d.xy+a_p*u_d.z,0.,1.);}`;

export const FS_STAMP = P + `
in vec2 v_l;uniform float u_a;out vec4 o;
void main(){o=vec4(u_a*smoothstep(1.,.25,length(v_l)),0,0,1);}`;
