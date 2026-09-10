/** Enhanced CPU fallback; the scene and controls are shared with WebGL.
 * This renderer uses WASM triangle rasterization, interpolated normals,
 * simplified metallic lighting and a real light-space depth shadow map.
 * It does not claim physical transmission or WebGL shader equivalence. */
import { kernel } from './kernel.js';
import { SoftwareRenderer as LegacyRenderer } from './legacy.js';
const T=globalThis.THREE;
const tmp=new T.Vector3(),normalMatrix=new T.Matrix3(),instanceMatrix=new T.Matrix4(),worldMatrix=new T.Matrix4();
let compiled;
function getKernel(){if(!compiled)compiled=new WebAssembly.Module(Uint8Array.from(atob(kernel),c=>c.charCodeAt(0)));return new WebAssembly.Instance(compiled).exports;}
export class SoftwareRenderer {
  constructor(){
    try{this.core=getKernel();}catch{const legacy=new LegacyRenderer();if(!legacy.ctx)throw new Error('Canvas2D unavailable');return legacy;}
    this.isSoftwareRenderer=true;this.isStudioRenderer=true;this.domElement=document.createElement('canvas');this.ctx=this.domElement.getContext('2d',{alpha:true});if(!this.ctx)throw new Error('Canvas2D unavailable');
    this.shadowMap={enabled:true,needsUpdate:true};this.info={render:{calls:0,triangles:0},memory:{geometries:0,textures:0}};
    this.ratio=1;this.toneMappingExposure=1;this.w=1;this.h=1;this.lastFrame=-Infinity;this.frames=0;this.fps=0;this.windowStart=performance.now();
    this.cache=new WeakMap();this.textureCache=new WeakMap();this.lastTexture=null;this.projection=new T.Matrix4();this.shadowCamera=new T.OrthographicCamera(-8,8,8,-8,.1,50);
    const mem=this.core.memory.buffer;this.input=new Float32Array(mem,this.core.vertices(),2400000);this.uniform=new Float32Array(mem,this.core.material(),32);this.config=new Float32Array(mem,this.core.config(),64);this.texels=new Uint8Array(mem,this.core.texture(),16777216);
  }
  setPixelRatio(r){this.ratio=Math.min(1.4,r||1);}
  setClearColor(){}
  setSize(w,h){
    this.w=w;this.h=h;const ratio=Math.min(this.ratio,2048/w,1536/h);this.rw=Math.max(1,Math.round(w*ratio));this.rh=Math.max(1,Math.round(h*ratio));
    if(this.domElement.width===this.rw&&this.domElement.height===this.rh)return;
    this.domElement.width=this.rw;this.domElement.height=this.rh;this.core.init(this.rw,this.rh);this.image=new ImageData(new Uint8ClampedArray(this.core.memory.buffer,this.core.pixels(),this.rw*this.rh*4),this.rw,this.rh);this.lastFrame=-Infinity;
  }
  invalidate(){this.lastFrame=-Infinity;this.shadowMap.needsUpdate=true;}
  compile(obj,matrix,instance=-1){
    let records=this.cache.get(obj);if(!records){records=new Map();this.cache.set(obj,records);}let rec=records.get(instance);
    if(rec&&rec.geometry===obj.geometry&&rec.matrix.equals(matrix))return rec;
    const g=obj.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    const worlds=new Float32Array(p.count*8);normalMatrix.getNormalMatrix(matrix);
    for(let i=0;i<p.count;i++){
      tmp.fromBufferAttribute(p,i).applyMatrix4(matrix);let k=i*8;worlds[k]=tmp.x;worlds[k+1]=tmp.y;worlds[k+2]=tmp.z;
      if(n)tmp.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();else tmp.set(0,1,0);
      worlds[k+3]=tmp.x;worlds[k+4]=tmp.y;worlds[k+5]=tmp.z;worlds[k+6]=uv?uv.getX(i):0;worlds[k+7]=uv?uv.getY(i):0;
    }
    rec={geometry:g,matrix:matrix.clone(),worlds,screen:new Float32Array(p.count*3),count:p.count};records.set(instance,rec);return rec;
  }
  material(mat,obj){
    const a=this.uniform,c=mat.color||new T.Color('white'),e=mat.emissive||{r:0,g:0,b:0};a.fill(0);
    a[0]=c.r;a[1]=c.g;a[2]=c.b;a[3]=mat.roughness??.45;a[4]=mat.metalness||0;a[5]=mat.transparent?mat.opacity:1;
    a[6]=e.r;a[7]=e.g;a[8]=e.b;a[9]=mat.emissiveIntensity||0;a[10]=mat.isMeshBasicMaterial?1:0;
    a[14]=mat.side===T.DoubleSide?1:0;a[15]=mat.depthTest===false?1:0;a[16]=mat.clippingPlanes?.[0]?.constant??1e6;
    a[21]=mat.userData?.glass?1:0;if(mat.userData?.glass)a[5]=mat.userData.fallbackOpacity??.12;a[22]=obj.receiveShadow?1:0;
    if(mat.isShadowMaterial){a[23]=1;a[22]=1;a[5]=mat.opacity;}
    const flow=mat.userData?.flowUniforms;if(flow){a[17]=1;a[18]=flow.uFlow.value;a[19]=flow.uPipeLength.value*1.04;a[20]=flow.uTime.value*.8;}
    const image=mat.map?.image;
    if(image&&image.getContext){
      let tex=this.textureCache.get(image);if(!tex){try{tex=image.getContext('2d').getImageData(0,0,image.width,image.height);this.textureCache.set(image,tex);}catch{}}
      if(tex&&tex.data.length<=this.texels.length){if(this.lastTexture!==image){this.texels.set(tex.data);this.lastTexture=image;}a[11]=1;a[12]=tex.width;a[13]=tex.height;}
    }
  }
  project(rec){const m=this.projection.elements,p=rec.worlds,out=rec.screen;for(let i=0;i<rec.count;i++){let k=i*8,j=i*3;const x=p[k],y=p[k+1],z=p[k+2];out[j]=(m[0]*x+m[4]*y+m[8]*z+m[12]+1)*this.rw*.5;out[j+1]=(1-m[1]*x-m[5]*y-m[9]*z-m[13])*this.rh*.5;out[j+2]=m[2]*x+m[6]*y+m[10]*z+m[14];}}
  submit(item,pass){
    const {rec,group,obj,mat}=item,index=rec.geometry.index,arr=index?.array,p=rec.worlds,sc=rec.screen,start=group.start,end=Math.min(index?index.count:rec.count,group.start+group.count);let q=0,count=0;
    this.material(mat,obj);
    for(let i=start;i<end;i++){
      const n=arr?arr[i]:i,k=n*8,j=n*3;
      this.input[q++]=sc[j];this.input[q++]=sc[j+1];this.input[q++]=sc[j+2];
      for(let v=0;v<8;v++)this.input[q++]=p[k+v];
      if((i-start)%3===2){count++;if(q>2399700){this.core.draw(count,pass);q=0;count=0;}}
    }
    if(count)this.core.draw(count,pass);
  }
  render(scene,camera){
    const now=performance.now();if(now-this.lastFrame<42)return;this.lastFrame=now;
    this.frames++;if(now-this.windowStart>1000){this.fps=Math.round(this.frames*1000/(now-this.windowStart));this.frames=0;this.windowStart=now;}
    scene.updateMatrixWorld();camera.updateMatrixWorld();this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    camera.getWorldDirection(tmp).negate();this.config[0]=tmp.x;this.config[1]=tmp.y;this.config[2]=tmp.z;this.config[3]=this.toneMappingExposure||1;
    const opaque=[],alpha=[],sprites=[],lines=[],geometries=new Set(),textures=new Set();let triangles=0;
    const collect=(obj,matrix,instance=-1)=>{
      if(!obj.geometry?.attributes.position)return;const mats=Array.isArray(obj.material)?obj.material:[obj.material];if(mats.every(m=>!m.visible||m.opacity<.01))return;
      const rec=this.compile(obj,matrix,instance);this.project(rec);geometries.add(rec.geometry);
      const groups=rec.geometry.groups.length?rec.geometry.groups:[{start:0,count:rec.geometry.index?.count||rec.count,materialIndex:0}];
      for(const group of groups){const mat=mats[group.materialIndex]||mats[0];if(!mat.visible||mat.opacity<.01)continue;
        const item={obj,mat,rec,group,depth:matrix.elements[12]*this.projection.elements[2]+matrix.elements[13]*this.projection.elements[6]+matrix.elements[14]*this.projection.elements[10]};
        if(mat.transparent||mat.userData?.glass||mat.isShadowMaterial||mat.depthTest===false)alpha.push(item);else opaque.push(item);triangles+=group.count/3;if(mat.map)textures.add(mat.map);
      }
    };
    scene.traverseVisible(obj=>{
      if(obj.isSprite){sprites.push(obj);if(obj.material.map)textures.add(obj.material.map);}
      else if(obj.isInstancedMesh){for(let i=0;i<obj.count;i++){obj.getMatrixAt(i,instanceMatrix);worldMatrix.multiplyMatrices(obj.matrixWorld,instanceMatrix);collect(obj,worldMatrix,i);}}
      else if(obj.isMesh)collect(obj,obj.matrixWorld);
      else if(obj.isLineSegments&&obj.material.opacity>.01)lines.push(obj);
    });
    if(this.shadowMap.needsUpdate){
      const light=scene.children.find(o=>o.isDirectionalLight&&o.castShadow);
      this.shadowCamera.position.copy(light?.position||new T.Vector3(-7,12,7));this.shadowCamera.lookAt(0,1,0);this.shadowCamera.updateMatrixWorld();
      this.config.set(new T.Matrix4().multiplyMatrices(this.shadowCamera.projectionMatrix,this.shadowCamera.matrixWorldInverse).elements,8);
      this.core.clearShadow();for(const item of opaque)if(item.obj.castShadow)this.submit(item,1);this.shadowMap.needsUpdate=false;
    }
    const rasterStart=performance.now();this.core.clear();for(const item of opaque)this.submit(item,0);
    alpha.sort((a,b)=>(a.obj.renderOrder||0)-(b.obj.renderOrder||0)||b.depth-a.depth);for(const item of alpha)this.submit(item,0);
    this.ctx.clearRect(0,0,this.rw,this.rh);this.ctx.putImageData(this.image,0,0);
    const ctx=this.ctx;
    // Thin drafting lines and endpoint text stay legible; linework is not a shaded surface.
    for(const obj of lines){const p=obj.geometry.attributes.position,m=new T.Matrix4().multiplyMatrices(this.projection,obj.matrixWorld);ctx.strokeStyle='#52665f';ctx.globalAlpha=obj.material.opacity*.45;ctx.lineWidth=.65*this.ratio;ctx.beginPath();for(let i=0;i<p.count;i++){tmp.fromBufferAttribute(p,i).applyMatrix4(m);const x=(tmp.x+1)*this.rw/2,y=(1-tmp.y)*this.rh/2;i%2?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
    sprites.sort((a,b)=>a.renderOrder-b.renderOrder);
    for(const o of sprites){const mat=o.material;if(!mat.map?.image||!mat.visible)continue;o.getWorldPosition(tmp);tmp.project(camera);const scale=new T.Vector3();o.getWorldScale(scale);const w=scale.x*this.rw/(camera.right-camera.left),h=scale.y*this.rh/(camera.top-camera.bottom);ctx.globalAlpha=mat.opacity;ctx.drawImage(mat.map.image,(tmp.x+1)*this.rw/2-w/2,(1-tmp.y)*this.rh/2-h/2,w,h);}
    this.frameMs=Math.round((performance.now()-now)*10)/10;this.rasterMs=Math.round((performance.now()-rasterStart)*10)/10;
    ctx.globalAlpha=1;this.info.render={calls:opaque.length+alpha.length,triangles:Math.round(triangles)};this.info.memory={geometries:geometries.size,textures:textures.size};
  }
  dispose(){this.cache=new WeakMap();this.textureCache=new WeakMap();this.image=null;this.input=null;this.core=null;}
}
