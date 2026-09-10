/* STRATA Studio CPU rasterizer. Original implementation, no third-party code.
   Linear-light material shading, interpolated normals, shadow map, depth buffer.
   Fallback only: an approximation, not a reimplementation of the WebGL shaders. */
typedef unsigned int u32;
typedef unsigned char u8;
#define MAXP (2048*1536)
#define SH 1024
#define MAXV 2400000
static u8 pixels[MAXP*4];
static float depths[MAXP];
static float shadows[SH*SH];
static float vertices[MAXV];
static u8 texels[16777216];
static float config[64], material[32];
static int width,height;
static float clamp(float x,float a,float b){return x<a?a:x>b?b:x;}
static float max(float a,float b){return a>b?a:b;}
static float min(float a,float b){return a<b?a:b;}
static float ab(float x){return x<0?-x:x;}
static float sq(float x){return x*x;}
static float root(float x){return __builtin_sqrtf(x);}
static float power(float x,int n){float r=1;while(n){if(n&1)r*=x;x*=x;n>>=1;}return r;}
static float aces(float v){v=max(0,v*config[3]);return clamp(v*(2.51f*v+.03f)/(v*(2.43f*v+.59f)+.14f),0,1);}
static float gamma(float v){v=aces(v);return clamp(root(v)*1.14f-.14f*v,0,1);}
__attribute__((export_name("pixels"))) u32 pixel_ptr(){return (u32)pixels;}
__attribute__((export_name("vertices"))) u32 vertex_ptr(){return (u32)vertices;}
__attribute__((export_name("texture"))) u32 texture_ptr(){return (u32)texels;}
__attribute__((export_name("config"))) u32 config_ptr(){return (u32)config;}
__attribute__((export_name("material"))) u32 material_ptr(){return (u32)material;}
__attribute__((export_name("init"))) void init(int w,int h){width=w;height=h;}
__attribute__((export_name("clear"))) void clear(){int count=width*height;for(int i=0;i<count;i++){((u32*)pixels)[i]=0;depths[i]=1e10f;}}
__attribute__((export_name("clearShadow"))) void clear_shadow(){for(int i=0;i<SH*SH;i++)shadows[i]=1e10f;}
static float shadow(float x,float y,float z,float ndl){
 const float *m=config+8;
 float sx=(m[0]*x+m[4]*y+m[8]*z+m[12]+1)*.5f*SH;
 float sy=(1-m[1]*x-m[5]*y-m[9]*z-m[13])*.5f*SH;
 float sz=m[2]*x+m[6]*y+m[10]*z+m[14]-.0011f-(1-ndl)*.0011f;
 int xx=(int)sx,yy=(int)sy;if(xx<3||xx>=SH-3||yy<3||yy>=SH-3)return 1;
 float blocker=shadows[yy*SH+xx];int radius=(int)clamp((sz-blocker)*210,1,5);if(xx<radius+1||xx>=SH-radius-1||yy<radius+1||yy>=SH-radius-1)return 1;
 float v=0;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)v+=sz>shadows[(yy+j*radius)*SH+xx+i*radius]?.0f:1.f;
 return v/9.f;
}
static void blend(int i,float r,float g,float b,float a){
 u8 *p=pixels+i*4;
 if(a>.997f){p[0]=(u8)clamp(r*255,0,255);p[1]=(u8)clamp(g*255,0,255);p[2]=(u8)clamp(b*255,0,255);p[3]=255;return;}
 float old=p[3]/255.f,total=a+old*(1-a);if(total<.001f)return;
 p[0]=(u8)clamp((r*255*a+p[0]*old*(1-a))/total,0,255);
 p[1]=(u8)clamp((g*255*a+p[1]*old*(1-a))/total,0,255);
 p[2]=(u8)clamp((b*255*a+p[2]*old*(1-a))/total,0,255);p[3]=(u8)(total*255);
}
/* Each vertex = projected xyz, world xyz, normal xyz, uv. */
__attribute__((export_name("draw"))) void draw(int count,int pass){
 for(int t=0;t<count;t++){
  float *a=vertices+t*33,*b=a+11,*c=b+11;
  float ax=a[0],ay=a[1],az=a[2],bx=b[0],by=b[1],bz=b[2],cx=c[0],cy=c[1],cz=c[2];
  int w=width,h=height;
  if(pass==1){
   const float *m=config+8;w=h=SH;
   ax=(m[0]*a[3]+m[4]*a[4]+m[8]*a[5]+m[12]+1)*.5f*SH;
   ay=(1-m[1]*a[3]-m[5]*a[4]-m[9]*a[5]-m[13])*.5f*SH;az=m[2]*a[3]+m[6]*a[4]+m[10]*a[5]+m[14];
   bx=(m[0]*b[3]+m[4]*b[4]+m[8]*b[5]+m[12]+1)*.5f*SH;
   by=(1-m[1]*b[3]-m[5]*b[4]-m[9]*b[5]-m[13])*.5f*SH;bz=m[2]*b[3]+m[6]*b[4]+m[10]*b[5]+m[14];
   cx=(m[0]*c[3]+m[4]*c[4]+m[8]*c[5]+m[12]+1)*.5f*SH;
   cy=(1-m[1]*c[3]-m[5]*c[4]-m[9]*c[5]-m[13])*.5f*SH;cz=m[2]*c[3]+m[6]*c[4]+m[10]*c[5]+m[14];
  }
  float den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(ab(den)<.0001f)continue;
  if(pass==0&&material[14]<.5f&&den>0)continue;
  int miny=(int)max(0,__builtin_ceilf(min(ay,min(by,cy))-.5f)),maxy=(int)min(h-1,__builtin_floorf(max(ay,max(by,cy))-.5f));
  float da=(by-cy)/den,db=(cy-ay)/den,ya=(cx-bx)/den,yb=(ax-cx)/den;
  float dz=da*(az-cz)+db*(bz-cz);
  for(int y=miny;y<=maxy;y++){
   float yy=y+.5f,left=1e10f,right=-1e10f;
   float xs[3]={ax,bx,cx},ys[3]={ay,by,cy};
   for(int e=0;e<3;e++){int n=(e+1)%3;if(ys[e]==ys[n]||yy<min(ys[e],ys[n])||yy>=max(ys[e],ys[n]))continue;float x=xs[e]+(yy-ys[e])*(xs[n]-xs[e])/(ys[n]-ys[e]);left=min(left,x);right=max(right,x);}
   int start=(int)max(0,__builtin_ceilf(left-.5f)),end=(int)min(w-1,__builtin_floorf(right-.5f));if(start>end)continue;
   float u=da*(start+.5f-cx)+ya*(yy-cy),v=db*(start+.5f-cx)+yb*(yy-cy),d=u*az+v*bz+(1-u-v)*cz;
   for(int x=start;x<=end;x++,u+=da,v+=db,d+=dz){
    int index=y*w+x;float k=1-u-v;
    if(pass==1){if(a[4]*u+b[4]*v+c[4]*k>material[16])continue;if(d<shadows[index])shadows[index]=d;continue;}
    if(material[15]<.5f&&d>depths[index]+.000004f)continue;
    float wx=a[3]*u+b[3]*v+c[3]*k,wy=a[4]*u+b[4]*v+c[4]*k,wz=a[5]*u+b[5]*v+c[5]*k;
    if(wy>material[16])continue;
    float uvx=a[9]*u+b[9]*v+c[9]*k,uvy=a[10]*u+b[10]*v+c[10]*k;
    if(material[17]>.5f&&uvx>material[18])continue;
    float r=material[0],g=material[1],bb=material[2],alpha=material[5];
    if(material[11]>.5f){int tw=(int)material[12],th=(int)material[13];int tx=(int)clamp(uvx*tw,0,tw-1),ty=(int)clamp((1-uvy)*th,0,th-1);u8 *p=texels+(ty*tw+tx)*4;r*=p[0]/255.f;g*=p[1]/255.f;bb*=p[2]/255.f;alpha*=p[3]/255.f;}
    if(alpha<.008f)continue;
    if(material[10]>.5f){blend(index,r,g,bb,alpha);if(alpha>.995f&&material[15]<.5f)depths[index]=d;continue;}
    float nx=a[6]*u+b[6]*v+c[6]*k,ny=a[7]*u+b[7]*v+c[7]*k,nz=a[8]*u+b[8]*v+c[8]*k;
    float inv=1/root(nx*nx+ny*ny+nz*nz+1e-12f);nx*=inv;ny*=inv;nz*=inv;
    if(den>0){nx=-nx;ny=-ny;nz=-nz;}
    float nv=max(0,nx*config[0]+ny*config[1]+nz*config[2]);
    float nl=max(0,nx*(-.47f)+ny*.78f+nz*.41f),nf=max(0,nx*.69f+ny*.44f-nz*.57f);
    float sh=material[22]>.5f?shadow(wx,wy,wz,nl):1;
    if(material[23]>.5f){blend(index,0,0,0,(1-sh)*material[5]*clamp(1-(ab(wx)+ab(wz))*.045f,.18f,1));continue;}
    float rough=material[3],metal=material[4],fres=.04f+.96f*power(1-nv,5);
    float rx=2*nv*nx-config[0],ry=2*nv*ny-config[1],rz=2*nv*nz-config[2];
    /* Softboxes are smooth lobes: broad studio roof, thin cold edge, warm front. */
    float ref=max(0,rx*(-.52f)+ry*.74f+rz*.42f),rim=max(0,rx*.66f+ry*.28f-rz*.696f);
    float pr=power(ref,rough<.16f?80:rough<.35f?28:10),edge=power(rim,rough<.2f?56:18);
    float sky=.22f+.16f*max(0,ny),amb=.12f+.20f*max(0,ny);
    float diff=amb+nl*sh*1.65f+nf*.48f;
    float sf=(.04f*(1-metal)+metal)*(.15f+pr*2.7f+edge*1.7f);
    float fr=fres*(.045f+pr*.14f);
    float contact=clamp((wy+.82f)/.35f,.5f,1);
    float er=material[6]*material[9],eg=material[7]*material[9],eb=material[8]*material[9];
    if(material[17]>.5f){float phase=uvx*material[19]-material[20];phase-=__builtin_floorf(phase);float pulse=power(max(0,1-ab(phase-.5f)*8),4)*.32f;er+=r*pulse;eg+=g*pulse;eb+=bb*pulse;}
    r=(r*diff*(1-metal*.75f)+(r*metal+1-metal)*sf+fr)*contact+er;
    g=(g*(amb+nl*sh*1.52f+nf*.55f)*(1-metal*.75f)+(g*metal+1-metal)*sf+fr)*contact+eg;
    bb=(bb*(amb+nl*sh*1.35f+nf*.67f)*(1-metal*.75f)+(bb*metal+1-metal)*sf+fr*1.07f)*contact+eb;
    if(material[21]>.5f){alpha=clamp(alpha+fres*.25f,.02f,.68f);r+=pr*.12f;g+=pr*.14f;bb+=pr*.15f;}
    blend(index,gamma(r),gamma(g),gamma(bb),alpha);
    if(alpha>.995f&&material[15]<.5f)depths[index]=d;
   }
  }
 }
}
