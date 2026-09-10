/**
 * Canvas fallback for environments where WebGL is unavailable.
 * It projects the very same Three.js scene graph and triangle geometry. This is
 * deliberately a simplified CPU triangle renderer, not a WebGL/shader emulation.
 * No access to GPU, networking, external assets, or browser policies is required.
 */
const T=globalThis.THREE;
const light=new T.Vector3(-.45,.8,.55).normalize();
const fill=new T.Vector3(.65,.38,-.5).normalize();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class SoftwareRenderer {
  constructor(){
    this.isSoftwareRenderer=true;this.domElement=document.createElement('canvas');
    this.bufferCanvas=document.createElement('canvas');this.bufferCtx=this.bufferCanvas.getContext('2d');this.textureCache=new WeakMap();
    this.ctx=this.domElement.getContext('2d',{alpha:true});
    if(!this.ctx)throw new Error('Canvas rendering is unavailable');
    this.shadowMap={enabled:false,needsUpdate:false};this.ratio=1;
    this.info={render:{calls:0,triangles:0},memory:{geometries:0,textures:0}};
    this.w=1;this.h=1;this.lastFrame=-Infinity;this.fps=0;this.frames=0;this.windowStart=performance.now();
  }
  setPixelRatio(){this.ratio=1;}
  setClearColor(){}
  setSize(w,h){this.w=w;this.h=h;this.domElement.width=Math.round(w);this.domElement.height=Math.round(h);this.bufferCanvas.width=this.domElement.width;this.bufferCanvas.height=this.domElement.height;this.pixelData=this.bufferCtx.createImageData(this.domElement.width,this.domElement.height);this.depth=new Float32Array(this.domElement.width*this.domElement.height);this.lastFrame=-Infinity;}
  render(scene,camera){
    const now=performance.now();if(now-this.lastFrame<80)return;this.lastFrame=now;
    this.frames++;if(now-this.windowStart>1000){this.fps=Math.round(this.frames*1000/(now-this.windowStart));this.frames=0;this.windowStart=now;}
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    const ctx=this.ctx,w=this.w,h=this.h;ctx.clearRect(0,0,w,h);
    const projection=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const shapes=[],geometries=new Set(),textures=new Set();let triangles=0;
    const v=new T.Vector3(),normal=new T.Vector3(),normMat=new T.Matrix3(),world=new T.Matrix4(),combined=new T.Matrix4(),instance=new T.Matrix4();
    const project=(x,y,z,m)=>{v.set(x,y,z).applyMatrix4(m);return [(v.x+1)*w*.5,(1-v.y)*h*.5,v.z];};
    // Analytical soft contact shadow; physical shadow maps are WebGL-only.
    const center=new T.Vector3(0,-.74,0).applyMatrix4(projection);
    const extent=scene.children.find(o=>o.isGroup)?.children.find(o=>o.geometry?.type==='ExtrudeGeometry');
    if(extent){
      const size=extent.geometry.boundingBox||(extent.geometry.computeBoundingBox(),extent.geometry.boundingBox);
      const span=size.max.x-size.min.x;
      const rx=span*w/(camera.right-camera.left)*.73,ry=rx*.32,cx=(center.x+1)*w/2,cy=(1-center.y)*h/2;
      ctx.save();ctx.translate(cx,cy);ctx.scale(rx,ry);const shadow=ctx.createRadialGradient(0,0,.13,0,0,1);shadow.addColorStop(0,'rgba(56,75,62,.13)');shadow.addColorStop(.6,'rgba(56,75,62,.07)');shadow.addColorStop(1,'rgba(56,75,62,0)');ctx.fillStyle=shadow;ctx.fillRect(-1,-1,2,2);ctx.restore();
    }
    const collectMesh=(obj,matrix)=>{
      const geo=obj.geometry,materials=Array.isArray(obj.material)?obj.material:[obj.material];
      if(!geo?.attributes.position||materials.every(m=>!m.visible||m.opacity<.015||m.isShadowMaterial))return;
      geometries.add(geo);combined.multiplyMatrices(projection,matrix);normMat.getNormalMatrix(matrix);
      const pos=geo.attributes.position,norm=geo.attributes.normal,uv=geo.attributes.uv,index=geo.index;
      const projected=new Float32Array(pos.count*3),worldY=new Float32Array(pos.count);
      for(let i=0;i<pos.count;i++){
        v.fromBufferAttribute(pos,i).applyMatrix4(matrix);worldY[i]=v.y;v.applyMatrix4(projection);
        projected[i*3]=(v.x+1)*w/2;projected[i*3+1]=(1-v.y)*h/2;projected[i*3+2]=v.z;
      }
      const count=index?index.count:pos.count,groups=geo.groups.length?geo.groups:[{start:0,count,materialIndex:0}];
      for(const group of groups){
        const mat=materials[group.materialIndex]||materials[0];if(!mat?.visible||mat.opacity<.015)continue;
        const color=mat.color||new T.Color('#dce3d8'),emissive=mat.emissive,flow=mat.userData.flowUniforms;
        const cut=mat.clippingPlanes?.[0]?.constant;
        for(let j=group.start;j<Math.min(count,group.start+group.count);j+=3){
          const a=index?index.getX(j):j,b=index?index.getX(j+1):j+1,c=index?index.getX(j+2):j+2;
          const ax=projected[a*3],ay=projected[a*3+1],bx=projected[b*3],by=projected[b*3+1],cx=projected[c*3],cy=projected[c*3+1];
          const cross=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
          if(mat.side===T.FrontSide&&cross>=0||mat.side===T.BackSide&&cross<=0||Math.abs(cross)<.006)continue;
          if(cut!==undefined&&(worldY[a]+worldY[b]+worldY[c])/3>cut)continue;
          let u=0,pulse=0;
          if(flow&&uv){u=(uv.getX(a)+uv.getX(b)+uv.getX(c))/3;if(u>flow.uFlow.value)continue;pulse=Math.pow(Math.max(0,Math.sin(u*flow.uPipeLength.value*6.5-flow.uTime.value*5)),16)*.2;}
          let lum=1;
          if(!mat.isMeshBasicMaterial&&norm){
            normal.set(norm.getX(a)+norm.getX(b)+norm.getX(c),norm.getY(a)+norm.getY(b)+norm.getY(c),norm.getZ(a)+norm.getZ(b)+norm.getZ(c)).applyMatrix3(normMat).normalize();
            if(cross>0)normal.negate();lum=.52+.46*Math.max(0,normal.dot(light))+.17*Math.max(0,normal.dot(fill));
          }
          const rgb=[color.r,color.g,color.b].map((n,k)=>clamp(Math.round(n*255*lum+(emissive?[emissive.r,emissive.g,emissive.b][k]*(mat.emissiveIntensity||0)*28:0)+pulse*65),0,255));
          const opacity=mat.transparent?mat.opacity:1;
          const item={kind:'triangle',p:[ax,ay,bx,by,cx,cy],z:(projected[a*3+2]+projected[b*3+2]+projected[c*3+2])/3,order:mat.depthTest===false?(obj.renderOrder||5):0,color:`rgb(${rgb.join(',')})`,rgb,depth:[projected[a*3+2],projected[b*3+2],projected[c*3+2]],opacity};
          if(mat.map?.image&&uv){item.image=mat.map.image;item.uv=[uv.getX(a),uv.getY(a),uv.getX(b),uv.getY(b),uv.getX(c),uv.getY(c)];textures.add(mat.map);}
          shapes.push(item);triangles++;
        }
      }
    };
    scene.traverseVisible(obj=>{
      if(obj.isSprite){
        const mat=obj.material;if(!mat.visible||mat.opacity<.015||!mat.map?.image)return;
        obj.getWorldPosition(v);v.applyMatrix4(projection);const scale=new T.Vector3();obj.getWorldScale(scale);
        shapes.push({kind:'sprite',x:(v.x+1)*w/2,y:(1-v.y)*h/2,z:v.z,order:mat.depthTest===false?6:0,width:scale.x*w/(camera.right-camera.left),height:scale.y*h/(camera.top-camera.bottom),image:mat.map.image,opacity:mat.opacity});textures.add(mat.map);
      }else if(obj.isInstancedMesh){
        for(let i=0;i<obj.count;i++){obj.getMatrixAt(i,instance);world.multiplyMatrices(obj.matrixWorld,instance);collectMesh(obj,world);}
      }else if(obj.isMesh){collectMesh(obj,obj.matrixWorld);}
      else if(obj.isLineSegments){
        const pos=obj.geometry.attributes.position;combined.multiplyMatrices(projection,obj.matrixWorld);const mat=obj.material;
        for(let i=0;i<pos.count;i+=2){const a=project(pos.getX(i),pos.getY(i),pos.getZ(i),combined),b=project(pos.getX(i+1),pos.getY(i+1),pos.getZ(i+1),combined);shapes.push({kind:'line',p:[...a.slice(0,2),...b.slice(0,2)],z:(a[2]+b[2])/2,order:0,color:'#a9bdb0',rgb:[169,189,176],depth:[a[2],b[2]],opacity:mat.opacity});}
      }
    });
    // Z-buffer the opaque scene, then alpha-composite sorted glass/guide surfaces.
    // This avoids the impossible interpenetration artifacts of a painter-only renderer.
    const data=this.pixelData.data;data.fill(0);this.depth.fill(Infinity);
    const alpha=[],sprites=[];
    for(const shape of shapes){
      if(shape.kind==='sprite'){sprites.push(shape);continue;}
      if(shape.kind==='line'||shape.opacity<.99||shape.order>0){alpha.push(shape);continue;}
      this.rasterTriangle(shape,true);
    }
    alpha.sort((a,b)=>a.order-b.order||b.z-a.z);
    for(const shape of alpha){if(shape.kind==='line')this.rasterLine(shape);else this.rasterTriangle(shape,false);}
    this.bufferCtx.putImageData(this.pixelData,0,0);ctx.drawImage(this.bufferCanvas,0,0);
    sprites.sort((a,b)=>a.order-b.order||b.z-a.z);
    for(const s of sprites){ctx.globalAlpha=s.opacity;ctx.drawImage(s.image,s.x-s.width/2,s.y-s.height/2,s.width,s.height);}
    ctx.globalAlpha=1;this.info.render={calls:shapes.length,triangles};this.info.memory={geometries:geometries.size,textures:textures.size};
  }
  texture(image){
    if(this.textureCache.has(image))return this.textureCache.get(image);
    let data;
    try{if(image.getContext)data=image.getContext('2d').getImageData(0,0,image.width,image.height);}
    catch{return null;}
    this.textureCache.set(image,data);return data;
  }
  blend(index,rgb,alpha){
    const d=this.pixelData.data,i=index*4;
    if(alpha>.995){d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];d[i+3]=255;return;}
    const old=d[i+3]/255,a=alpha+old*(1-alpha);if(a<=0)return;
    for(let k=0;k<3;k++)d[i+k]=(rgb[k]*alpha+d[i+k]*old*(1-alpha))/a;
    d[i+3]=a*255;
  }
  rasterTriangle(s,opaque){
    const p=s.p,z=s.depth,w=this.domElement.width,h=this.domElement.height,depth=this.depth;
    const minY=Math.max(0,Math.ceil(Math.min(p[1],p[3],p[5])-.5)),maxY=Math.min(h-1,Math.floor(Math.max(p[1],p[3],p[5])-.5));
    if(maxY<minY)return;
    const den=(p[3]-p[5])*(p[0]-p[4])+(p[4]-p[2])*(p[1]-p[5]);if(Math.abs(den)<.0001)return;
    const dxA=(p[3]-p[5])/den,dyA=(p[4]-p[2])/den,dxB=(p[5]-p[1])/den,dyB=(p[0]-p[4])/den;
    const dz=dxA*(z[0]-z[2])+dxB*(z[1]-z[2]);
    const texture=s.image?this.texture(s.image):null,uv=s.uv;
    const rgb=s.rgb||[230,234,224];
    for(let y=minY;y<=maxY;y++){
      const cy=y+.5;let left=Infinity,right=-Infinity;
      for(let edge=0;edge<3;edge++){
        const next=(edge+1)%3,x1=p[edge*2],y1=p[edge*2+1],x2=p[next*2],y2=p[next*2+1];
        if(y1===y2||cy<Math.min(y1,y2)||cy>=Math.max(y1,y2))continue;
        const x=x1+(cy-y1)*(x2-x1)/(y2-y1);left=Math.min(left,x);right=Math.max(right,x);
      }
      const start=Math.max(0,Math.ceil(left-.5)),end=Math.min(w-1,Math.floor(right-.5));if(start>end)continue;
      let a=dxA*(start+.5-p[4])+dyA*(cy-p[5]),b=dxB*(start+.5-p[4])+dyB*(cy-p[5]);
      let d=a*z[0]+b*z[1]+(1-a-b)*z[2];
      for(let x=start;x<=end;x++,d+=dz,a+=dxA,b+=dxB){
        const index=y*w+x;
        if(s.order===0&&d>depth[index]+.000005)continue;
        let color=rgb,opacity=s.opacity;
        if(texture){
          const tx=clamp(Math.floor((uv[0]*a+uv[2]*b+uv[4]*(1-a-b))*texture.width),0,texture.width-1);
          const ty=clamp(Math.floor((1-(uv[1]*a+uv[3]*b+uv[5]*(1-a-b)))*texture.height),0,texture.height-1),ti=(ty*texture.width+tx)*4;
          color=[texture.data[ti],texture.data[ti+1],texture.data[ti+2]];opacity*=texture.data[ti+3]/255;
        }
        if(opaque&&opacity>.995)depth[index]=d;
        this.blend(index,color,opacity);
      }
    }
  }
  rasterLine(s){
    const p=s.p,w=this.domElement.width,h=this.domElement.height,steps=Math.max(Math.abs(p[2]-p[0]),Math.abs(p[3]-p[1]));
    for(let i=0;i<=steps;i++){
      const t=i/Math.max(1,steps),x=Math.round(p[0]+(p[2]-p[0])*t),y=Math.round(p[1]+(p[3]-p[1])*t),d=s.depth[0]+(s.depth[1]-s.depth[0])*t;
      if(x<0||x>=w||y<0||y>=h)continue;const index=y*w+x;if(d>this.depth[index]+.00001)continue;this.blend(index,s.rgb,s.opacity);
    }
  }
  dispose(){}
}
