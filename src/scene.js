import { SoftwareRenderer } from './software.js';
import { COLORS } from './levels.js';
import { same, reachableMoves, flowDuration } from './engine.js';
const T=globalThis.THREE,Y=new T.Vector3(0,1,0),V=p=>new T.Vector3(...p);
const qualityOptions={high:{ratio:1.8,shadow:2048,radial:32},low:{ratio:1,shadow:1024,radial:16}};
const PI=Math.PI;
function disposeGroup(group){
  const geo=new Set(),mat=new Set(),tex=new Set();group.traverse(o=>{if(o.geometry&&!o.geometry.userData.shared)geo.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(!m.userData.shared){mat.add(m);if(m.map&&!m.map.userData.shared)tex.add(m.map);}});});
  geo.forEach(g=>g.dispose());tex.forEach(t=>t.dispose());mat.forEach(m=>m.dispose());group.clear();
}
function roundedCurve(points,r=.255){
  const path=new T.CurvePath();let last=points[0];
  for(let i=1;i<points.length-1;i++){
    const p=points[i],a=p.clone().sub(points[i-1]).normalize(),b=points[i+1].clone().sub(p).normalize();if(Math.abs(a.dot(b))>.99)continue;
    const enter=p.clone().addScaledVector(a,-r),leave=p.clone().addScaledVector(b,r);path.add(new T.LineCurve3(last,enter));path.add(new T.QuadraticBezierCurve3(enter,p,leave));last=leave;
  }path.add(new T.LineCurve3(last,points.at(-1)));return path;
}
function texture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=4;return t;}
function label(text,accent='#95bfb1',subtitle='',width=512,height=144){return texture(width,height,(c,w,h)=>{
  c.fillStyle='#15221f';c.beginPath();c.roundRect(2,2,w-4,h-4,12);c.fill();c.strokeStyle='#53665d';c.lineWidth=2;c.stroke();c.fillStyle=accent;c.fillRect(18,22,4,h-44);c.textAlign='left';c.textBaseline='middle';c.font=`500 ${subtitle?h*.36:h*.46}px monospace`;c.fillText(text,40,subtitle?h*.40:h*.5);if(subtitle){c.fillStyle='#80988e';c.font=`${h*.18}px monospace`;c.fillText(subtitle,42,h*.77);}
});}
function dialTexture(color){return texture(256,256,(c)=>{c.translate(128,128);c.fillStyle='#10231f';c.beginPath();c.arc(0,0,123,0,PI*2);c.fill();c.strokeStyle='#758a7e';c.lineWidth=2;for(let i=0;i<=24;i++){const a=PI*.76+i*PI*1.5/24;c.beginPath();c.moveTo(Math.cos(a)*(i%4?95:84),Math.sin(a)*(i%4?95:84));c.lineTo(Math.cos(a)*107,Math.sin(a)*107);c.stroke();}c.strokeStyle=color;c.lineWidth=5;c.beginPath();c.arc(0,0,108,PI*.76,PI*1.48);c.stroke();c.fillStyle='#c7d7ce';c.textAlign='center';c.font='20px monospace';c.fillText('FLOW',0,60);c.font='26px monospace';c.fillText('0.84',0,22);});}
function weld(geometry){
  if(geometry.index)return geometry;const attrs=['position','normal','uv'],maps=new Map(),buffers={position:[],normal:[],uv:[]},idx=[];let count=0;
  for(let i=0;i<geometry.attributes.position.count;i++){
    const values=attrs.flatMap(n=>{const a=geometry.attributes[n],v=[];for(let k=0;k<(n==='uv'?2:3);k++)v.push(a?a.array[i*a.itemSize+k]:0);return v;});
    const key=values.map(n=>Math.round(n*1e5)).join(',');let j=maps.get(key);if(j===undefined){j=count++;maps.set(key,j);buffers.position.push(...values.slice(0,3));buffers.normal.push(...values.slice(3,6));buffers.uv.push(...values.slice(6));}idx.push(j);
  }
  const out=new T.BufferGeometry();for(const n of attrs)out.setAttribute(n,new T.Float32BufferAttribute(buffers[n],n==='uv'?2:3));out.setIndex(idx);geometry.dispose();return out;
}
/** Flatten immutable geometry by material. Moving parts and endpoint markers stay separate. */
function batch(group){
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),sets=new Map(),remove=[];
  group.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o.userData.unbatched||Array.isArray(o.material))return;let parent=o;while(parent&&parent!==group){if(parent.userData.unbatched||parent.userData.batchBoundary)return;parent=parent.parent;}
    const mat=o.material;if(mat.transparent||mat.transmission>0||mat.map)return;
    const id=mat.uuid+'-'+o.castShadow+'-'+o.receiveShadow;let list=sets.get(id);if(!list){list=[];sets.set(id,list);}list.push(o);remove.push(o);
  });
  for(const list of sets.values()){
    if(list.length<2)continue;const arrays={position:[],normal:[],uv:[]};let total=0;const indices=[];
    for(const o of list){const m=new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld),g=o.geometry.clone().applyMatrix4(m);const count=g.index?.count||g.attributes.position.count;for(let i=0;i<count;i++)indices.push(total+(g.index?g.index.array[i]:i));total+=g.attributes.position.count;
      for(const name of Object.keys(arrays))arrays[name].push(g.attributes[name]?.array||new Float32Array(g.attributes.position.count*(name==='uv'?2:3)));g.dispose();}
    const geo=new T.BufferGeometry();for(const [name,chunks] of Object.entries(arrays)){const out=new Float32Array(total*(name==='uv'?2:3));let k=0;for(const a of chunks){out.set(a,k);k+=a.length;}geo.setAttribute(name,new T.BufferAttribute(out,name==='uv'?2:3));}
    geo.setIndex(indices);const mesh=new T.Mesh(geo,list[0].material);mesh.castShadow=list[0].castShadow;mesh.receiveShadow=list[0].receiveShadow;group.add(mesh);
    for(const o of list){o.removeFromParent();if(!o.geometry.userData.shared)o.geometry.dispose();}
  }
}
export class CabinetScene{
  constructor(container,settings,onPick,onError){
    this.container=container;this.settings=settings;this.onPick=onPick;this.onError=onError;this.state=null;this.demo=false;this.assets=new Map();this.geoCache=new Map();
    this.scene=new T.Scene();this.scene.fog=new T.FogExp2('#15201e',.012);this.camera=new T.OrthographicCamera(-5,5,5,-5,.1,80);
    try{const canvas=document.createElement('canvas'),options={antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true};const context=canvas.getContext('webgl2',options)||canvas.getContext('webgl',options);if(!context)throw Error('WebGL unavailable');this.renderer=new T.WebGLRenderer({...options,canvas,context});}
    catch{this.renderer=new SoftwareRenderer();container.dataset.renderer='software';container.dataset.backend=this.renderer.isStudioRenderer?'studio':'legacy';}
    this.renderer.outputEncoding=T.sRGBEncoding;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.99;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.localClippingEnabled=true;this.renderer.setClearColor('#111c19',0);
    this.renderer.info.autoReset=false;container.appendChild(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','可旋转的三维流体装置。亦可用楼层布线板操作。');this.renderer.domElement.setAttribute('role','img');
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;onError('三维渲染中断；楼层布线板仍可操作。刷新可恢复。');});
    this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.contextLost=false;if(this.state)this.load(this.state,this.demo);});
    this.scene.add(new T.HemisphereLight('#d9e7df','#28342e',.55));
    this.keyLight=new T.DirectionalLight('#fff1d6',2.75);this.keyLight.position.set(-7,12,7);this.keyLight.castShadow=true;Object.assign(this.keyLight.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:40});this.keyLight.shadow.bias=-.00015;this.keyLight.shadow.normalBias=.016;this.keyLight.shadow.radius=3;this.scene.add(this.keyLight);
    const fill=new T.DirectionalLight('#b4d5ec',1.25);fill.position.set(8,7,-6);this.scene.add(fill);const rim=new T.DirectionalLight('#a5e9ce',1.9);rim.position.set(-6,4,-8);this.scene.add(rim);
    this.staticGroup=new T.Group();this.pipeGroup=new T.Group();this.guideGroup=new T.Group();this.scene.add(this.staticGroup,this.pipeGroup,this.guideGroup);this.clipPlane=new T.Plane(new T.Vector3(0,-1,0),100);
    this.raycaster=new T.Raycaster();this.pointer=new T.Vector2();this.pickables=[];this.target=new T.Vector3(0,1.4,0);this.yaw=.68;this.pitch=1.03;this.goalYaw=this.yaw;this.goalPitch=this.pitch;this.zoom=1;this.slice=false;this.drag=null;this.pointers=new Map();this.pinchDistance=0;this.velocity={yaw:0,pitch:0};this.lastTime=0;this.lastInteraction=0;this.presentation=false;
    this.createMaterials();if(!this.renderer.isSoftwareRenderer){this.createEnvironment();this.createPost();}
    this.bindEvents();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.applySettings(settings);this.resize();
  }
  createMaterials(){
    // Original procedurally generated microfinish; no network textures or fonts.
    let seed=8231;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
    const data=new Uint8Array(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++){let i=(y*128+x)*4;data[i]=128+(rand()-.5)*11;data[i+1]=128+(rand()-.5)*24;data[i+2]=255;data[i+3]=255;}
    const normal=new T.DataTexture(data,128,128,T.RGBAFormat);normal.wrapS=normal.wrapT=T.RepeatWrapping;normal.repeat.set(4,4);normal.needsUpdate=true;normal.userData.shared=true;this.normal=normal;
    this.metal=this.mat('titanium',{color:'#a8b9b0',roughness:.28,metalness:.92,normalMap:normal,normalScale:new T.Vector2(.11,.11)});
    this.chrome=this.mat('machined edges',{color:'#d6e1dc',roughness:.17,metalness:.95});
    this.dark=this.mat('anodised carbon',{color:'#172b26',roughness:.34,metalness:.7});
    this.rubber=this.mat('elastomer',{color:'#091813',roughness:.88,metalness:0});
    this.enamel=this.mat('ceramic porcelain',{color:'#d3d8c7',roughness:.27,metalness:.12,clearcoat:.55,clearcoatRoughness:.24});
    this.deck=this.mat('deck graphite',{color:'#21352e',roughness:.54,metalness:.52,normalMap:normal,normalScale:new T.Vector2(.2,.2)});
    this.brass=this.mat('satin champagne',{color:'#c9a66b',roughness:.26,metalness:.88});
    this.screw=this.mat('fasteners',{color:'#637c70',roughness:.21,metalness:.96});
    this.led=this.mat('status LED',{color:'#a8edc7',roughness:.3,emissive:'#79d7ae',emissiveIntensity:.6,metalness:.1});
    this.panelGlass=this.mat('safety glass',{color:'#d3e6dd',roughness:.095,metalness:0,transmission:.97,thickness:.025,ior:1.46,clearcoat:1});this.panelGlass.userData.glass=true;this.panelGlass.userData.fallbackOpacity=.018;
  }
  mat(name,props){if(this.assets.has(name))return this.assets.get(name);const m=new T.MeshPhysicalMaterial(props);m.color.convertSRGBToLinear();m.emissive.convertSRGBToLinear();m.userData.shared=true;this.assets.set(name,m);return m;}
  geometry(name,fn){if(this.geoCache.has(name))return this.geoCache.get(name);const g=fn();g.userData.shared=true;this.geoCache.set(name,g);return g;}
  box(w,h,d,r=.045){r=Math.min(r,w*.24,h*.35,d*.24);return this.geometry(`box:${w}:${h}:${d}:${r}`,()=>{
    if(Math.max(w,h,d)<.12)return new T.BoxGeometry(w,h,d);
    const precision=Math.max(w,h,d)>.65?6:3;
    const W=w-r*2,D=d-r*2,q=Math.min(r*.7,W*.2,D*.2),s=new T.Shape(),x=-W/2,z=-D/2;
    s.moveTo(x+q,z);s.lineTo(x+W-q,z);s.quadraticCurveTo(x+W,z,x+W,z+q);s.lineTo(x+W,z+D-q);s.quadraticCurveTo(x+W,z+D,x+W-q,z+D);s.lineTo(x+q,z+D);s.quadraticCurveTo(x,z+D,x,z+D-q);s.lineTo(x,z+q);s.quadraticCurveTo(x,z,x+q,z);
    const g=new T.ExtrudeGeometry(s,{depth:h-r*2,bevelEnabled:true,bevelSegments:precision,steps:1,bevelSize:r,bevelThickness:r,curveSegments:precision+1});g.rotateX(-PI/2);g.translate(0,-h/2+r,0);
    // Analytic normals on the swept fillet: large porcelain bevels have continuous
    // highlights, rather than the flat per-face normals of ExtrudeGeometry.
    const pos=g.attributes.position,norm=g.attributes.normal;
    for(let i=0;i<pos.count;i++){
      const px=pos.getX(i),py=pos.getY(i),pz=pos.getZ(i);
      const dx=Math.max(0,Math.abs(px)-(W/2-q)),dz=Math.max(0,Math.abs(pz)-(D/2-q));
      const distance=Math.hypot(dx,dz),out=Math.max(0,distance-q),dy=Math.max(0,Math.abs(py)-(h/2-r));
      const nx=distance?Math.sign(px)*dx/distance*out:0,nz=distance?Math.sign(pz)*dz/distance*out:0,ny=Math.sign(py)*dy,len=Math.hypot(nx,ny,nz);
      if(len>1e-6)norm.setXYZ(i,nx/len,ny/len,nz/len);
    }
    return weld(g);
  });}
  mesh(geo,mat,g,p=[0,0,0]){const m=new T.Mesh(geo,mat);m.position.set(...p);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
  b(g,w,h,d,p,mat=this.metal,r=.04){return this.mesh(this.box(w,h,d,r),mat,g,p);}
  cyl(g,r,h,p,mat=this.metal,radial=32,r2=r){return this.mesh(this.geometry(`cyl:${r}:${h}:${radial}:${r2}`,()=>new T.CylinderGeometry(r,r2,h,radial,1,false)),mat,g,p);}
  ring(g,r,t,p,mat=this.chrome){const m=this.mesh(this.geometry(`ring:${r}:${t}`,()=>new T.TorusGeometry(r,t,8,40)),mat,g,p);m.rotation.x=PI/2;return m;}
  tube(g,a,b,r,mat=this.metal,radial=16){const d=V(b).sub(V(a)),len=d.length();if(len<.001)return null;const m=this.cyl(g,r,len,V(a).add(V(b)).multiplyScalar(.5).toArray(),mat,radial);m.quaternion.setFromUnitVectors(Y,d.normalize());return m;}
  lathe(g,profile,p,mat=this.chrome){const key=profile.flat().join(',');return this.mesh(this.geometry('lathe:'+key,()=>new T.LatheGeometry(profile.map(p=>new T.Vector2(...p)),40)),mat,g,p);}
  screwAt(g,p,axis='y',size=.027){const m=this.cyl(g,size,.016,p,this.chrome,6);if(axis==='z')m.rotation.x=PI/2;if(axis==='x')m.rotation.z=PI/2;return m;}
  plate(g,text,p,w=.5,h=.15,accent='#a7c5b8',subtitle=''){const tex=label(text,accent,subtitle);const m=this.mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,transparent:true}),g,p);m.castShadow=false;m.receiveShadow=false;return m;}
  gauge(g,p,r=.11,accent='#8bd8b4',value=.6){
    const body=this.cyl(g,r+.018,.07,p,this.chrome);body.rotation.x=PI/2;
    const disk=this.mesh(new T.CircleGeometry(r,40),new T.MeshBasicMaterial({map:dialTexture(accent)}),g,[p[0],p[1],p[2]+.037]);disk.castShadow=false;
    const hand=new T.Group();hand.position.set(p[0],p[1],p[2]+.043);hand.rotation.z=-.8;hand.userData.unbatched=true;g.add(hand);const m=this.b(hand,r*.66,.012,.012,[r*.3,0,0],this.brass,.003);m.castShadow=false;this.needles.push({hand,base:-.8,value});
    this.mesh(new T.SphereGeometry(.018,10,6),this.chrome,g,[p[0],p[1],p[2]+.046]);
  }
  createEnvironment(){
    const room=new T.Scene();room.background=new T.Color('#253c34');
    const box=new T.Mesh(new T.BoxGeometry(30,20,30),new T.MeshBasicMaterial({color:'#62776c',side:T.BackSide}));room.add(box);
    const softbox=(p,w,h,c)=>{const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(...c),side:T.DoubleSide}));m.position.set(...p);m.lookAt(0,1,0);room.add(m);};
    softbox([-7,8,7],8,10,[4.6,4.2,3.5]);softbox([6,5,-5],5,12,[2.2,3.1,3.8]);softbox([-4,2,-8],2,12,[1.5,3.2,2.6]);softbox([0,10,1],9,3,[3.0,3.4,3.1]);
    try{const pmrem=new T.PMREMGenerator(this.renderer);this.envTarget=pmrem.fromScene(room,.03);this.scene.environment=this.envTarget.texture;pmrem.dispose();}catch(err){console.warn('Studio environment:',err.message);}room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
  createPost(){
    this.postTarget=new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,format:T.RGBAFormat});this.postTarget.texture.encoding=T.sRGBEncoding;
    this.postScene=new T.Scene();this.postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
    this.postMat=new T.ShaderMaterial({depthTest:false,depthWrite:false,transparent:true,toneMapped:false,uniforms:{image:{value:this.postTarget.texture},resolution:{value:new T.Vector2(1,1)}},vertexShader:'varying vec2 tex;void main(){tex=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:`uniform sampler2D image;uniform vec2 resolution;varying vec2 tex;void main(){vec4 c=texture2D(image,tex);vec2 p=1.0/resolution;vec4 a=texture2D(image,tex+vec2(p.x,0.)),b=texture2D(image,tex-vec2(p.x,0.)),d=texture2D(image,tex+vec2(0.,p.y)),e=texture2D(image,tex-vec2(0.,p.y));float edge=abs(a.a-b.a)+abs(d.a-e.a);vec4 filtered=(c*4.+a+b+d+e)/8.;c=mix(c,filtered,clamp(edge*.38,0.,.45));float vignette=1.-.085*smoothstep(.18,.78,distance(tex,vec2(.5)));gl_FragColor=vec4(c.rgb*vignette,c.a);}`});
    this.postScene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.postMat));
  }
  applySettings(settings){const previousQuality=this.currentQuality;this.currentQuality=settings.quality;this.settings=settings;const q=qualityOptions[settings.quality]||qualityOptions.high;this.renderer.setPixelRatio(this.renderer.isStudioRenderer?(settings.quality==='high'?(settings.reducedMotion?1.4:1):.85):Math.min(devicePixelRatio||1,q.ratio));this.keyLight.shadow.mapSize.set(q.shadow,q.shadow);if(this.keyLight.shadow.map){this.keyLight.shadow.map.dispose();this.keyLight.shadow.map=null;}this.renderer.shadowMap.needsUpdate=true;this.resize();if(this.state&&previousQuality&&previousQuality!==this.currentQuality)this.update(this.state);}
  point(p){const n=(this.state.level.size-1)/2;return new T.Vector3((p[0]-n)*.94,p[1]*.94+.36,(p[2]-n)*.94);}
  resize(){
    this.visualRevision=(this.visualRevision||0)+1;
    const w=this.container.clientWidth,h=this.container.clientHeight;if(w<1||h<1)return;this.renderer.setSize(w,h,false);this.renderer.domElement.style.width='100%';this.renderer.domElement.style.height='100%';this.updateCamera();
    const n=this.state?.level.size||5,levels=this.state?.level.height||4,edge=((n-1)*.94+1.9)/2,top=(levels-1)*.94+1.05;let maxX=0,maxY=0;
    for(const x of [-edge,edge])for(const y of [-.96,top])for(const z of [-edge,edge]){const v=V([x,y,z]).applyMatrix4(this.camera.matrixWorldInverse);maxX=Math.max(maxX,Math.abs(v.x));maxY=Math.max(maxY,Math.abs(v.y));}
    const half=Math.max(maxY,maxX/(w/h))*1.035/this.zoom;this.camera.left=-half*w/h;this.camera.right=half*w/h;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();
    if(this.postTarget){const ratio=this.renderer.getPixelRatio();this.postTarget.setSize(Math.round(w*ratio),Math.round(h*ratio));this.postMat.uniforms.resolution.value.set(w*ratio,h*ratio);}
    this.renderer.lastFrame=-Infinity;
  }
  updateCamera(){const d=16;this.camera.position.set(this.target.x+d*Math.sin(this.pitch)*Math.sin(this.yaw),this.target.y+d*Math.cos(this.pitch),this.target.z+d*Math.sin(this.pitch)*Math.cos(this.yaw));this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
  view(name){const previousZoom=this.zoom,previousTarget=this.target.y;if(name!=='detail')this.zoom=1;if(this.state)this.target.y=(this.state.level.height-1)*.47+.05;if(name==='detail'){this.goalYaw=.48;this.goalPitch=1.23;this.zoom=1.42;this.target.y-=.65;}if(name==='iso'){this.goalYaw=.68;this.goalPitch=1.03;this.zoom=1;}if(name==='front'){this.goalYaw=0;this.goalPitch=1.32;}if(name==='top'){this.goalYaw=0;this.goalPitch=.025;}this.velocity={yaw:0,pitch:0};this.lastInteraction=performance.now()/1000;this.goalYaw=this.yaw+Math.atan2(Math.sin(this.goalYaw-this.yaw),Math.cos(this.goalYaw-this.yaw));this.goalZoom=this.zoom;this.goalTargetY=this.target.y;this.preset=true;if(!this.settings.reducedMotion){this.zoom=previousZoom;this.target.y=previousTarget;}if(this.settings.reducedMotion){this.yaw=this.goalYaw;this.pitch=this.goalPitch;this.preset=false;}this.resize();}
  bindEvents(){
    const canvas=this.renderer.domElement;canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{this.lastInteraction=performance.now()/1000;this.preset=false;this.velocity={yaw:0,pitch:0};this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);this.drag={x:e.clientX,y:e.clientY,initialX:e.clientX,initialY:e.clientY,moved:false,id:e.pointerId};if(this.pointers.size>1){this.drag.moved=true;const a=[...this.pointers.values()];this.pinchDistance=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}});
    canvas.addEventListener('pointermove',e=>{if(!this.pointers.has(e.pointerId))return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.pointers.size>1){const a=[...this.pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(this.pinchDistance>0)this.zoom=Math.max(.65,Math.min(1.75,this.zoom*d/this.pinchDistance));this.pinchDistance=d;this.drag.moved=true;this.resize();return;}if(!this.drag)return;
      const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(Math.hypot(e.clientX-this.drag.initialX,e.clientY-this.drag.initialY)>6)this.drag.moved=true;
      if(this.drag.moved){this.yaw-=dx*.006;this.pitch=Math.max(.035,Math.min(1.47,this.pitch+dy*.005));this.velocity.yaw=-dx*.045;this.velocity.pitch=dy*.024;this.updateCamera();}this.drag.x=e.clientX;this.drag.y=e.clientY;});
    const finish=(e,cancel=false)=>{const click=!cancel&&this.drag&&!this.drag.moved&&this.pointers.size===1;this.pointers.delete(e.pointerId);if(click&&!this.demo&&this.state)this.pick(e.clientX,e.clientY);this.lastInteraction=performance.now()/1000;if(this.pointers.size===0){this.drag=null;this.pinchDistance=0;}else if(this.drag)this.drag.moved=true;};
    canvas.addEventListener('pointerup',e=>finish(e));canvas.addEventListener('pointercancel',e=>finish(e,true));canvas.addEventListener('lostpointercapture',e=>finish(e,true));
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.lastInteraction=performance.now()/1000;this.zoom=Math.max(.65,Math.min(1.75,this.zoom*Math.exp(-e.deltaY*.0008)));this.resize();},{passive:false});
  }
  pick(x,y){if(this.presentation)return;const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);this.guideGroup.updateMatrixWorld(true);const hit=this.raycaster.intersectObjects(this.pickables,false)[0];if(hit)this.onPick(hit.object.userData.cell);}
  screenPosition(p){const r=this.renderer.domElement.getBoundingClientRect(),v=this.point(p).project(this.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};}
  load(state,demo=false){this.state=state;this.demo=demo;this.slice=false;this.target.set(0,(state.level.height-1)*.47+.05,0);this.needles=[];this.rotors=[];this.view('iso');this.yaw=this.goalYaw;this.pitch=this.goalPitch;this.zoom=this.goalZoom;this.target.y=this.goalTargetY;this.preset=false;disposeGroup(this.staticGroup);this.buildCabinet();this.update(state);this.renderer.shadowMap.needsUpdate=true;this.resize();}
  buildCabinet(){
    const l=this.state.level,n=l.size,span=(n-1)*.94+1.04,edge=span/2,top=(l.height-1)*.94+1.04,g=this.staticGroup;
    // Floating monocoque, gasket seam, recessed working deck and vibration isolators.
    this.b(g,span+1,.40,span+1,[0,-.49,0],this.enamel,.13);
    this.b(g,span+.89,.06,span+.89,[0,-.695,0],this.brass,.025);
    this.b(g,span+.73,.095,span+.73,[0,-.77,0],this.dark,.04);
    this.b(g,span+.64,.055,span+.64,[0,-.285,0],this.rubber,.02);
    this.b(g,span+.56,.10,span+.56,[0,-.21,0],this.metal,.035);
    this.b(g,span+.29,.075,span+.29,[0,-.13,0],this.deck,.026);
    for(const x of [-edge+.23,edge-.23])for(const z of [-edge+.23,edge-.23]){
      this.cyl(g,.22,.12,[x,-.88,z],this.rubber);this.cyl(g,.18,.025,[x,-.94,z],this.chrome);this.cyl(g,.20,.022,[x,-.81,z],this.brass);
    }
    // Individually machined corner nodes. Front frames are thinner to leave the routes readable.
    for(const x of [-edge,edge])for(const z of [-edge,edge]){
      this.b(g,.245,.125,.245,[x,-.025,z],this.metal,.035);this.b(g,.112,top+.04,.112,[x,(top-.06)/2,z],this.metal,.014);
      this.b(g,.033,top-.2,.012,[x,(top-.04)/2,z+Math.sign(z)*.058],this.rubber,.004);
      this.b(g,.23,.12,.23,[x,top,z],this.chrome,.037);
      for(const y of [.14,top-.2])this.screwAt(g,[x,y,z+Math.sign(z)*.066],'z',.025);
      this.cyl(g,.052,.017,[x,top+.068,z],this.dark,20);this.screwAt(g,[x,top+.078,z],'y',.024);
    }
    for(const y of [-.035,top])for(const axis of ['x','z'])for(const s of [-1,1]){
      axis==='x'?this.b(g,span-.13,.075,.09,[0,y,edge*s],this.metal,.019):this.b(g,.09,.075,span-.13,[edge*s,y,0],this.metal,.019);
    }
    // Light guides on the far side, not a glow over the entire frame.
    const led=this.mat('frame light',{color:'#b6e7cd',roughness:.4,emissive:'#71bc96',emissiveIntensity:.35});
    this.b(g,span-.45,.018,.024,[0,top-.052,-edge+.02],led,.005);this.b(g,.024,.018,span-.45,[-edge+.02,top-.052,0],led,.005);
    // Glass, with a real transmission material on WebGL and restrained alpha in CPU mode.
    const glass=(w,h,p,rot)=>{const m=this.mesh(new T.PlaneGeometry(w,h),this.panelGlass,g,p);m.rotation.y=rot;m.castShadow=false;m.receiveShadow=false;m.renderOrder=4;return m;};
    glass(span-.15,top-.14,[0,top/2,-edge+.018],0);glass(span-.15,top-.14,[-edge+.018,top/2,0],PI/2);
    for(let layer=0;layer<l.height;layer++){
      const y=layer*.94+.045;
      this.b(g,span-.14,.04,.045,[0,y,-edge+.025],this.dark,.01);this.b(g,.045,.04,span-.14,[-edge+.025,y,0],this.dark,.01);
      this.plate(g,`L${layer+1}`,[edge+.061,y+.13,edge-.19],.19,.10,'#a6bcad').rotation.y=PI/2;
    }
    // Engraved metric registration. Cylinders are depth-tested unlike a painted overlay.
    for(let i=0;i<n;i++){
      const p=(i-(n-1)/2)*.94;
      this.tube(g,[p,-.086,-edge+.19],[p,-.086,edge-.19],.0035,this.screw,6);this.tube(g,[-edge+.19,-.086,p],[edge-.19,-.086,p],.0035,this.screw,6);
      for(let j=0;j<n;j++)this.cyl(g,.024,.008,[p,-.075,(j-(n-1)/2)*.94],this.dark,10);
    }
    // The fascia is a small instrument panel: glass display, rotary control, engraved plate, vents.
    const z=edge+.502;
    this.plate(g,'S T R A T A',[-edge+1.02,-.45,z+.003],1.63,.28,'#b5ccbc','F L U I D   S Y S T E M S');
    this.b(g,1.29,.258,.027,[edge-.82,-.46,z-.003],this.dark,.028);
    this.plate(g,'SYSTEM  /  084',[edge-.84,-.437,z+.014],1.13,.188,'#a7e2c0','FLOW LAB    /    SERIES 01');
    const knob=this.cyl(g,.117,.068,[edge+.055,-.46,z+.035],this.dark,48);knob.rotation.x=PI/2;
    for(let i=0;i<24;i++){const a=i*PI/12;this.b(g,.013,.014,.044,[edge+.055+Math.sin(a)*.112,-.46+Math.cos(a)*.112,z+.059],this.chrome,.003);}
    this.b(g,.012,.048,.007,[edge+.055,-.402,z+.073],this.brass,.003);
    for(const x of [-edge-.22,edge+.29])this.screwAt(g,[x,-.47,z+.018],'z',.028);
    // Left side fin recess.
    this.b(g,.028,.24,2.5,[-edge-.495,-.48,0],this.dark,.006);for(let i=0;i<27;i++)this.b(g,.025,.17,.026,[-edge-.513,-.47,-1.15+i*.089],this.metal,.004);
    const ground=this.mesh(new T.PlaneGeometry(30,30),new T.ShadowMaterial({opacity:.23}),g,[0,-.964,0]);ground.rotation.x=-PI/2;ground.castShadow=false;ground.renderOrder=-10;
    // Rail channels run BETWEEN grid columns so legal vertical routes stay clear.
    const railKeys=new Set();for(const cell of l.blocks){if(cell[1]===0)continue;const y=cell[1]*.94+.002,z=this.point(cell).z+.345,k=cell[1]+':'+cell[2];if(!railKeys.has(k)){railKeys.add(k);this.b(g,span-.12,.032,.037,[0,y,z],this.dark,.007);for(const x of [-edge+.025,edge-.025])this.b(g,.08,.057,.076,[x,y,z],this.metal,.01);}}
    for(let lno=1;lno<l.height;lno++){const y=lno*.94+.002;for(const x of [-edge,edge])this.b(g,.035,.039,span-.12,[x,y,0],this.dark,.009);}
    // Panel retainers and the rear cable loom live outside the playable grid.
    for(const y of [.26,top-.24])for(const x of [-edge+.20,edge-.20]){this.b(g,.12,.045,.055,[x,y,-edge+.015],this.dark,.01);this.screwAt(g,[x,y+.024,-edge+.015],'y',.017);}
    this.tube(g,[-edge+.11,.11,-edge+.10],[-edge+.11,top-.16,-edge+.10],.011,this.rubber,10);
    // Floor-specific equipment batches allow clipping without rebuilding the cabinet.
    this.obstacleObjects=[];const floors=Array.from({length:l.height},(_,y)=>{const group=new T.Group();group.userData.batchBoundary=true;g.add(group);this.obstacleObjects.push({group,y});return group;});
    for(const [index,cell] of l.blocks.entries())this.equipment(floors[cell[1]],cell,index);
    for(const floor of floors)batch(floor);
    this.endpointLabels=[];
    l.circuits.forEach((c,i)=>{for(const [type,cell] of [['in',c.start],['out',c.end]]){
      const group=new T.Group();group.position.copy(this.point(cell));group.userData.batchBoundary=true;g.add(group);this.reservoir(group,i,type,c.id);batch(group);this.endpointLabels.push({group,cell});
    }});
    batch(g);
  }
  equipment(g,cell,index){
    const group=new T.Group();group.position.copy(this.point(cell));g.add(group);const type=(cell[0]+2*cell[1]+cell[2])%3;
    // Every module remains inside its blocked grid cell; decoration never blocks a legal route.
    this.b(group,.65,.056,.64,[0,-.34,0],this.dark,.02);if(cell[1]>0)for(const x of [-.25,.25])this.b(group,.11,.043,.16,[x,-.367,.30],this.metal,.009);for(const x of [-.25,.25])for(const z of [-.24,.24])this.screwAt(group,[x,-.304,z],'y',.018);
    if(type===0){
      this.b(group,.60,.50,.57,[0,-.055,0],this.enamel,.065);this.b(group,.53,.065,.48,[0,.226,0],this.dark,.017);
      for(let i=0;i<8;i++)this.b(group,.025,.09,.46,[-.218+i*.062,.277,0],this.metal,.007);
      this.b(group,.44,.34,.033,[0,-.05,.293],this.dark,.027);
      const fanBase=this.cyl(group,.139,.04,[0,-.035,.323],this.rubber,40);fanBase.rotation.x=PI/2;this.ring(group,.15,.018,[0,-.035,.335],this.chrome).rotation.x=0;
      const fan=new T.Group();fan.position.set(0,-.035,.347);fan.userData.unbatched=true;group.add(fan);this.rotors.push(fan);
      for(let i=0;i<5;i++){const a=i*2*PI/5,blade=this.b(fan,.105,.029,.008,[Math.cos(a)*.063,Math.sin(a)*.063,0],this.metal,.008);blade.rotation.z=a+.5;}
      const hub=this.cyl(fan,.028,.025,[0,0,.015],this.brass,20);hub.rotation.x=PI/2;
      for(const x of [-.19,.19])for(const y of [-.18,.105])this.screwAt(group,[x,y,.325],'z',.017);
      this.plate(group,`HX-${String(index+1).padStart(2,'0')}`,[-.04,-.25,.296],.30,.058,'#a5b6aa');
    }else if(type===1){
      this.b(group,.58,.50,.58,[0,-.054,0],this.enamel,.063);this.b(group,.48,.033,.48,[0,.213,0],this.metal,.013);
      this.cyl(group,.124,.093,[-.115,.267,0],this.brass);this.ring(group,.115,.013,[-.115,.316,0],this.chrome);
      this.b(group,.39,.23,.025,[0,-.03,.296],this.dark,.022);this.gauge(group,[-.104,-.015,.319],.079,'#a5dec3',.25+index*.01);
      for(let k=0;k<3;k++)this.b(group,.082,.013,.015,[.11,.043-k*.047,.317],k===0?this.led:this.metal,.003);
      for(const x of [-.17,.17]){const c=this.cyl(group,.044,.06,[x,-.21,.32],this.chrome,16);c.rotation.x=PI/2;}
      this.plate(group,`P-${String(index+1).padStart(2,'0')}`,[.09,.13,.297],.19,.055,'#d4bb83');
    }else{
      this.lathe(group,[[0,-.3],[.19,-.3],[.25,-.26],[.26,-.20],[.24,-.16],[.24,.17],[.22,.23],[.18,.28],[0,.28]],[0,0,0],this.enamel);
      this.ring(group,.245,.018,[0,-.18,0],this.chrome);this.ring(group,.24,.024,[0,.14,0],this.brass);
      this.cyl(group,.172,.049,[0,.293,0],this.dark);for(let i=0;i<6;i++){const a=i*PI/3;this.screwAt(group,[Math.cos(a)*.181,.289,Math.sin(a)*.181],'y',.022);}
      this.b(group,.13,.24,.025,[0,-.014,.251],this.dark,.01);for(let i=0;i<4;i++)this.b(group,.06,.015,.006,[0,-.071+i*.04,.268],i===3?this.led:this.metal,.003);
    }
    this.tube(group,[-.28,-.36,-.26],[.28,-.36,-.26],.016,this.metal,8);
  }
  reservoir(g,i,type,id){
    const color=COLORS[i],colored=this.mat('reservoir-'+i,{color,roughness:.18,metalness:.12,clearcoat:1,emissive:color,emissiveIntensity:.08});
    this.lathe(g,[[0,-.355],[.19,-.355],[.247,-.32],[.247,-.265],[.207,-.24],[.207,-.20],[0,-.20]],[0,0,0],this.dark);
    this.ring(g,.215,.023,[0,-.215,0],this.brass);this.cyl(g,.175,.026,[0,-.184,0],this.chrome);
    const vesselMat=new T.MeshPhysicalMaterial({color:'#d9f1e7',transmission:.88,thickness:.065,roughness:.085,ior:1.46,metalness:0,clearcoat:1});vesselMat.userData.glass=true;vesselMat.userData.fallbackOpacity=.11;
    const vessel=this.cyl(g,.18,.377,[0,.016,0],vesselMat,40);vessel.castShadow=false;vessel.renderOrder=3;
    this.cyl(g,.151,type==='in'?.26:.175,[0,type==='in'?-.015:-.06,0],colored,40);
    const meniscus=this.cyl(g,.149,.012,[0,type==='in'?.12:.031,0],colored,40);meniscus.castShadow=false;
    this.lathe(g,[[0,.20],[.168,.20],[.218,.22],[.224,.258],[.198,.283],[.18,.292],[0,.292]],[0,0,0],this.chrome);
    this.ring(g,.188,.012,[0,.294,0],this.rubber);this.cyl(g,.10,.042,[0,.32,0],type==='in'?this.brass:this.dark,32);this.cyl(g,.067,.009,[0,.347,0],colored,24);
    // Four protective cage rods and fasteners, plus a engraved optical level scale.
    for(let k=0;k<4;k++){const a=PI*.25+k*PI*.5;this.tube(g,[Math.cos(a)*.207,-.203,Math.sin(a)*.207],[Math.cos(a)*.207,.208,Math.sin(a)*.207],.009,this.metal,8);this.screwAt(g,[Math.cos(a)*.189,.3,Math.sin(a)*.189],'y',.016);}
    for(let k=0;k<5;k++)this.b(g,k%2?.03:.045,.006,.009,[.072,-.135+k*.057,.183],this.chrome,.002);
    const sprite=new T.Sprite(new T.SpriteMaterial({map:label(`${id}  ${type==='in'?'IN':'OUT'}`,color),transparent:true,depthTest:false}));sprite.position.set(0,.535,0);sprite.scale.set(.46,.128,1);sprite.renderOrder=6;g.add(sprite);
    this.tube(g,[0,.356,0],[0,.44,0],.007,this.metal,6);
  }
  update(state){
    this.visualRevision=(this.visualRevision||0)+1;this.state=state;disposeGroup(this.pipeGroup);this.pipeVisuals=[];this.pumpRotors=[];const q=qualityOptions[this.settings.quality]||qualityOptions.high;
    state.paths.forEach((path,i)=>{
      if(path.length<2)return;const points=path.map(p=>this.point(p)),curve=roundedCurve(points),segments=Math.max(24,(path.length-1)*20),color=COLORS[i];
      const outerMaterial=new T.MeshPhysicalMaterial({color,roughness:.145,metalness:.06,transmission:.66,thickness:.036,ior:1.44,clearcoat:1,clearcoatRoughness:.09,clipShadows:true,clippingPlanes:this.slice?[this.clipPlane]:[]});outerMaterial.color.convertSRGBToLinear();outerMaterial.userData.glass=true;outerMaterial.userData.fallbackOpacity=.09;
      const outer=this.mesh(new T.TubeGeometry(curve,segments,.121,q.radial,false),outerMaterial,this.pipeGroup);outer.castShadow=false;outer.renderOrder=3;
      // Continuous inner conduit: visible at low saturation when empty, never a segmented bead chain.
      const linerMat=new T.MeshPhysicalMaterial({color,roughness:.25,metalness:.28,clearcoat:.75,transparent:true,opacity:.20,clipShadows:true,clippingPlanes:this.slice?[this.clipPlane]:[]});
      linerMat.color.convertSRGBToLinear();const liner=this.mesh(new T.TubeGeometry(curve,segments,.093,q.radial,false),linerMat,this.pipeGroup);liner.castShadow=false;liner.renderOrder=1;
      const uniforms={uFlow:{value:0},uTime:{value:0},uPipeLength:{value:path.length-1}};
      const fluidMat=new T.MeshPhysicalMaterial({color,roughness:.2,metalness:.04,clearcoat:1,clearcoatRoughness:.13,emissive:color,emissiveIntensity:.12,clipShadows:true,clippingPlanes:this.slice?[this.clipPlane]:[]});
      fluidMat.color.convertSRGBToLinear();fluidMat.emissive.convertSRGBToLinear();fluidMat.onBeforeCompile=shader=>{Object.assign(shader.uniforms,uniforms);shader.vertexShader='varying vec2 vRouteUV;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRouteUV=uv;');shader.fragmentShader='varying vec2 vRouteUV;uniform float uFlow;uniform float uTime;uniform float uPipeLength;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vRouteUV.x>uFlow)discard;');shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat wave=pow(max(0.0,sin(vRouteUV.x*uPipeLength*6.5-uTime*4.5)),24.0);totalEmissiveRadiance+=diffuseColor.rgb*wave*.22;');};
      fluidMat.userData.flowUniforms=uniforms;const core=this.mesh(new T.TubeGeometry(curve,segments,.091,q.radial,false),fluidMat,this.pipeGroup);core.castShadow=true;
      const metal=this.metal.clone(),seal=this.rubber.clone(),brass=this.brass.clone();for(const m of [metal,seal,brass]){m.userData.shared=false;m.clipShadows=true;m.clippingPlanes=this.slice?[this.clipPlane]:[];}
      // Bulkhead unions seal the active hose into the reservoir wall. The end
      // union is added only for a route that actually reaches its matching port.
      const ports=[{p:points[0],d:points[1].clone().sub(points[0]).normalize()}];
      if(same(path.at(-1),state.level.circuits[i].end))ports.push({p:points.at(-1),d:points.at(-2).clone().sub(points.at(-1)).normalize()});
      for(const {p,d} of ports){const union=new T.Group();union.position.copy(p);union.quaternion.setFromUnitVectors(Y,d);this.pipeGroup.add(union);
        this.cyl(union,.143,.025,[0,.212,0],seal,32);this.cyl(union,.135,.10,[0,.258,0],metal,32);this.cyl(union,.146,.034,[0,.324,0],metal,12);this.cyl(union,.126,.014,[0,.347,0],seal,32);
      }
      for(let j=1;j<points.length;j++){
        const a=points[j-1],b=points[j],dir=b.clone().sub(a).normalize(),mid=a.clone().lerp(b,.5),pump=state.level.gravity&&path[j][1]>path[j-1][1];
        if(pump){this.pump(mid,dir,metal,seal,brass);continue;}
        // Fewer collars: long straight runs have a fitting every second grid edge; bends retain one.
        const straight=j>1&&dir.dot(a.clone().sub(points[j-2]).normalize())>.99;
        if(straight&&j%2===0&&j<points.length-1)continue;
        const fitting=new T.Group();fitting.position.copy(mid);fitting.quaternion.setFromUnitVectors(Y,dir);this.pipeGroup.add(fitting);
        this.cyl(fitting,.147,.066,[0,0,0],metal,32);for(const y of [-.045,.045])this.cyl(fitting,.136,.016,[0,y,0],seal,32);
        for(const y of [-.062,.062])this.cyl(fitting,.146,.013,[0,y,0],metal,32);
        for(let k=0;k<6;k++){const ang=k*PI/3;const b=this.b(fitting,.012,.037,.012,[Math.cos(ang)*.15,0,Math.sin(ang)*.15],metal,.003);b.rotation.y=-ang;}
      }
      this.pipeVisuals.push({uniforms,curve,i,outer,liner,core,points});
    });
    batch(this.pipeGroup);this.updateGuides();this.renderer.shadowMap.needsUpdate=true;this.renderer.lastFrame=-Infinity;
  }
  pump(mid,dir,metal,seal,brass){
    const g=new T.Group();g.position.copy(mid);g.quaternion.setFromUnitVectors(Y,dir);this.pipeGroup.add(g);
    this.lathe(g,[[.09,-.20],[.166,-.20],[.18,-.17],[.18,-.11],[.148,-.085],[.148,.105],[.18,.14],[.18,.19],[.10,.21]],[0,0,0],brass);
    for(const y of [-.222,.222])this.cyl(g,.149,.034,[0,y,0],metal,32);for(const y of [-.195,.196])this.ring(g,.147,.012,[0,y,0],seal);
    this.b(g,.235,.27,.235,[.202,0,.045],seal,.042);this.b(g,.04,.22,.185,[.329,0,.045],metal,.012);
    for(let k=0;k<4;k++)this.b(g,.022,.012,.141,[.357,-.073+k*.047,.045],metal,.004);
    this.b(g,.026,.032,.05,[.224,.11,.174],this.led,.005);
    this.plate(g,'↑',[.105,.02,.163],.082,.15,'#f2d799');
  }
  updateGuides(){
    disposeGroup(this.guideGroup);this.pickables=[];if(!this.state||this.demo)return;
    const s=this.state,n=s.level.size,y=s.layer,color=COLORS[s.selected],g=this.guideGroup;this.clipPlane.constant=y*.94+.79;
    this.obstacleObjects.forEach(o=>{o.group.visible=!this.slice||o.y<=y;});this.endpointLabels.forEach(o=>{o.group.visible=!this.slice||o.cell[1]<=y;});
    const grid=new T.InstancedMesh(new T.SphereGeometry(.016,8,6),new T.MeshBasicMaterial({color:'#809b8f',transparent:true,opacity:.24}),n*n),dummy=new T.Object3D();let k=0;for(let z=0;z<n;z++)for(let x=0;x<n;x++){dummy.position.copy(this.point([x,y,z]));dummy.updateMatrix();grid.setMatrixAt(k++,dummy.matrix);}g.add(grid);
    const pickGeo=new T.SphereGeometry(.20,8,6),pickMat=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){const cell=[x,y,z],o=this.mesh(pickGeo,pickMat,g,this.point(cell).toArray());o.userData.cell=cell;o.castShadow=false;this.pickables.push(o);}
    this.guidePulse=[];for(const p of reachableMoves(s)){
      const ghost=s.ghost&&same(s.ghost,p),m=new T.MeshBasicMaterial({color:ghost?'#ffe5ad':color,transparent:true,opacity:.69,depthTest:false});const o=this.mesh(new T.SphereGeometry(ghost?.09:.047,12,8),m,g,this.point(p).toArray());o.castShadow=false;o.renderOrder=5;this.guidePulse.push(o);
      if(p[1]!==y){const pick=this.mesh(pickGeo,pickMat,g,this.point(p).toArray());pick.userData.cell=p;pick.castShadow=false;this.pickables.push(pick);}
    }
    const head=s.paths[s.selected].at(-1);this.headRing=this.ring(g,.242,.01,this.point(head).add(V([0,.017,0])).toArray(),new T.MeshBasicMaterial({color,transparent:true,opacity:.8,depthTest:false}));this.headRing.castShadow=false;this.headRing.renderOrder=5;this.visualRevision=(this.visualRevision||0)+1;this.renderer.lastFrame=-Infinity;
  }
  setSlice(value){this.slice=value;this.update(this.state);}
  setPresentation(value){this.presentation=value;this.guideGroup.visible=!value;this.zoom=1;this.resize();}
  render(time){
    if(this.contextLost||!this.state||!this.container.clientWidth)return;const dt=Math.min(.08,this.lastTime?time-this.lastTime:.016);this.lastTime=time;const s=this.state,reduced=this.settings.reducedMotion;
    if(this.preset){const a=reduced?1:1-Math.exp(-dt*8);this.yaw+=(this.goalYaw-this.yaw)*a;this.pitch+=(this.goalPitch-this.pitch)*a;this.zoom+=(this.goalZoom-this.zoom)*a;this.target.y+=(this.goalTargetY-this.target.y)*a;if(Math.abs(this.yaw-this.goalYaw)+Math.abs(this.pitch-this.goalPitch)+Math.abs(this.zoom-this.goalZoom)+Math.abs(this.target.y-this.goalTargetY)<.0005)this.preset=false;this.resize();}
    else if(!this.drag&&!reduced){
      if(Math.abs(this.velocity.yaw)+Math.abs(this.velocity.pitch)>.0002){this.yaw+=this.velocity.yaw*dt;this.pitch=Math.max(.03,Math.min(1.47,this.pitch+this.velocity.pitch*dt));const f=Math.exp(-dt*6);this.velocity.yaw*=f;this.velocity.pitch*=f;this.updateCamera();}
      else if(this.tour){this.tourTime=(this.tourTime||0)+dt;this.yaw+=dt*(.065+.027*(.5+.5*Math.sin(this.tourTime*.34)));this.pitch+=(1.02+Math.sin(this.tourTime*.22)*.045-this.pitch)*(1-Math.exp(-dt*2));this.updateCamera();}
      else if(this.demo&&!this.renderer.isSoftwareRenderer&&time-this.lastInteraction>4){const t=time-this.lastInteraction-4,desired=.68+Math.sin(t*.12)*.12;this.yaw+=Math.atan2(Math.sin(desired-this.yaw),Math.cos(desired-this.yaw))*(1-Math.exp(-dt*.7));this.pitch+=(1.03+Math.sin(t*.17)*.017-this.pitch)*(1-Math.exp(-dt*.7));this.updateCamera();}
    }
    // Transient resolution budget while dragging/filling/orbiting; the settled
    // frame is re-rendered sharply. This never changes puzzle simulation rate.
    if(this.renderer.isStudioRenderer){
      const moving=this.preset||this.drag?.moved||(!reduced&&(this.tour||Math.abs(this.velocity.yaw)+Math.abs(this.velocity.pitch)>.0002))||s.phase==='running';
      const low=this.settings.quality==='low',w=this.container.clientWidth,h=this.container.clientHeight;
      const desired=moving?Math.max(.55,Math.min(low?.85:1,Math.sqrt((low?440000:720000)/(w*h)))):low?.85:1.4;
      if(Math.abs(this.renderer.ratio-desired)>.005){this.renderer.setPixelRatio(desired);this.renderer.setSize(w,h);this.visualRevision=(this.visualRevision||0)+1;}
    }
    const animateParts=!reduced&&(!this.renderer.isSoftwareRenderer||this.tour||s.phase==='running');this.onDemand=reduced||(this.renderer.isSoftwareRenderer&&!this.tour&&s.phase!=='running');
    const signature=[this.visualRevision,this.yaw,this.pitch,this.zoom,s.phase,s.flow,reduced].join(':');
    if(this.onDemand&&signature===this.lastSignature)return;this.lastSignature=signature;
    const active=this.demo||s.phase==='won'||s.phase==='running';
    for(const p of this.pipeVisuals){p.uniforms.uTime.value=animateParts?time:0;p.uniforms.uFlow.value=this.demo||s.phase==='won'?1:s.phase==='running'?Math.min(1,s.flow/(flowDuration(s)-.45)):0;p.liner.material.opacity=active?.055:p.i===s.selected?.43:.24;}
    if(animateParts){for(const r of this.rotors)r.rotation.z=time*(active?1.2:.15);for(const {hand,base,value} of this.needles)hand.rotation.z=base+(active?.2*Math.sin(time*.8+value):0);}
    if(this.headRing)this.headRing.material.opacity=!animateParts?.8:.62+Math.sin(time*2.4)*.16;for(const o of this.guidePulse||[])o.scale.setScalar(!animateParts?1:1+Math.sin(time*2.4)*.1);
    if(!this.renderer.isSoftwareRenderer)this.renderer.info.reset();
    if(this.postTarget&&this.settings.quality==='high'){this.renderer.setRenderTarget(this.postTarget);this.renderer.clear();this.renderer.render(this.scene,this.camera);this.renderer.setRenderTarget(null);this.renderer.render(this.postScene,this.postCamera);}else this.renderer.render(this.scene,this.camera);
  }
  stats(){return{mode:this.renderer.isSoftwareRenderer?'software':'webgl',backend:this.renderer.isStudioRenderer?'wasm-studio':this.renderer.isSoftwareRenderer?'canvas-legacy':'webgl-pbr',fps:this.renderer.isSoftwareRenderer&&!this.onDemand?this.renderer.fps:null,renderPolicy:this.onDemand?'on-change':'continuous',revision:T.REVISION,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,canvas:{width:this.renderer.domElement.width,height:this.renderer.domElement.height},slice:this.slice,visibleEquipmentFloors:this.obstacleObjects?.filter(o=>o.group.visible).length,visibleEndpoints:this.endpointLabels?.filter(o=>o.group.visible).length,guideVisible:this.guideGroup.visible,frameMs:this.renderer.frameMs||null,rasterMs:this.renderer.rasterMs||null,contextLost:!!this.contextLost,post:!!this.postTarget&&this.settings.quality==='high'};}
  capture(){
    if(this.renderer.isStudioRenderer){this.renderer.setPixelRatio(1.4);this.renderer.setSize(this.container.clientWidth,this.container.clientHeight);this.renderer.lastFrame=-Infinity;this.renderer.render(this.scene,this.camera);}
    const source=this.renderer.domElement,c=document.createElement('canvas');c.width=source.width;c.height=source.height;const x=c.getContext('2d'),w=c.width,h=c.height,scale=Math.max(.65,w/1100);
    const bg=x.createRadialGradient(w*.50,h*.54,0,w*.5,h*.5,w*.7);bg.addColorStop(0,'#283a29');bg.addColorStop(1,'#0d1a13');x.fillStyle=bg;x.fillRect(0,0,w,h);x.drawImage(source,0,0);
    x.fillStyle='#d6dfbd';x.font=`${23*scale}px Georgia`;x.fillText('S T R A T A',30*scale,43*scale);x.fillStyle='#a3b489';x.font=`${8*scale}px monospace`;x.fillText('ATELIER 02 / THE ART OF ROUTING',31*scale,63*scale);x.fillText('THE FLOW APPARATUS',30*scale,h-34*scale);
    x.textAlign='right';x.fillText(`${this.state.level.size} × ${this.state.level.height} × ${this.state.level.size}   /   ${this.demo?'SHOWCASE':this.state.level.name}`,w-30*scale,h-34*scale);return c.toDataURL('image/png');
  }
  dispose(){this.resizeObserver.disconnect();[this.staticGroup,this.pipeGroup,this.guideGroup].forEach(disposeGroup);this.assets.forEach(m=>m.dispose());this.geoCache.forEach(g=>g.dispose());this.normal?.dispose();this.envTarget?.dispose();this.postTarget?.dispose();this.postMat?.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
