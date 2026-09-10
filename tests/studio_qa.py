"""ATELIER 02 visual/interaction regression. Actual offline build, not a mock UI.
Requires separately installed Python Playwright and Chromium. Uses explicit Storage
and inline-document test doubles; does not certify URL, native storage, GPU or PWA.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, time, hashlib, traceback, argparse
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--browser',default='/usr/bin/chromium');args=parser.parse_args()
results=[];errors=[];console_errors=[];captures=[];metrics={};start=time.time()
def check(v,message='Assertion failed'):
 if not v:raise AssertionError(message)
def case(name,fn):
 t=time.time()
 try:fn();results.append({'name':name,'passed':True,'seconds':round(time.time()-t,3)});print('PASS',name,flush=True)
 except Exception as e:results.append({'name':name,'passed':False,'error':str(e)});print('FAIL',name,str(e),flush=True);traceback.print_exc()
def api(p,s):return p.evaluate('()=>{const g=window.__STRATA_TEST__;'+s+'}')
def new_page(browser,width=1600,height=1000,legacy=False,mobile=False):
 p=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,reduced_motion='reduce',is_mobile=mobile,has_touch=mobile,accept_downloads=True);p.set_default_timeout(15000)
 p.on('pageerror',lambda e:errors.append(str(e)));p.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
 p.evaluate("""()=>{window.__STRATA_ENABLE_TEST__=true;window.__STORAGE_TEST_DOUBLE__=true;let data=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}});} """)
 if legacy:p.evaluate('window.WebAssembly=undefined')
 p.set_content((ROOT/'STRATA-Offline.html').read_text(),wait_until='load');p.wait_for_function('window.__STRATA_TEST__');p.wait_for_timeout(400);return p
def capture(p,name,full=False):
 p.screenshot(path=str(ROOT/'artifacts'/name),full_page=full);captures.append({'file':name,'viewport':p.viewport_size,'renderer':api(p,'return g.stats();')})
def setting(p,key,value):
 p.locator('[data-action=settings]').first.click();el=p.locator('#setting-'+key)
 if isinstance(value,bool):el.set_checked(value)
 else:el.select_option(value)
 api(p,'g.close();');p.wait_for_timeout(300)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=args.browser,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=new_page(b)
 metrics['webglProbe']=p.evaluate("()=>{const c=document.createElement('canvas');return {webgl2:!!c.getContext('webgl2'),wasm:typeof WebAssembly==='object'}}")
 case('the shared Three scene is rendered by an actual 3D backend',lambda:check(api(p,'return g.stats().triangles>10000 && ["wasm-studio","webgl-pbr"].includes(g.stats().backend);')))
 metrics['home']=api(p,'return g.stats();');capture(p,'11-atelier-home.png')
 def idle():
  before=p.locator('#viewport canvas').screenshot();p.wait_for_timeout(600);after=p.locator('#viewport canvas').screenshot();check(before==after,'Reduced-motion frame changed');check(api(p,'return g.stats().renderPolicy;')=='on-change')
 case('reduced-motion mode keeps a stable cached frame',idle)
 def presentation():
  p.locator('[data-action=presentation]').click();check(api(p,'return g.getPresentation();'));check(p.locator('.presentation-exit').evaluate('(e)=>document.activeElement===e'));check(p.locator('.topbar').evaluate('(e)=>e.inert'));check(not api(p,'return g.stats().guideVisible;'))
 case('presentation isolates controls, focuses exit and hides routing guides',presentation)
 capture(p,'12-atelier-presentation.png')
 def detail():
  before=api(p,'return g.project([2,0,2]);');p.locator('[data-view=detail]').click();p.wait_for_timeout(250);after=api(p,'return g.project([2,0,2]);');check(abs(before['x']-after['x'])+abs(before['y']-after['y'])>10)
 case('detail lens produces a real changed camera projection',detail)
 capture(p,'13-atelier-detail.png')
 def tabfocus():
  for _ in range(12):p.keyboard.press('Tab');check(p.evaluate('document.activeElement.matches(".scene-bottom button,.presentation-exit,.presentation-tour")'))
 case('presentation keyboard focus cannot escape into hidden game controls',tabfocus)
 def no_auto():
  p.locator('[data-action=tour]').click();check(p.locator('[data-action=tour]').get_attribute('aria-pressed')=='false');check('减少动态效果' in p.locator('#toast').inner_text())
 case('reduced-motion preference blocks automatic orbit',no_auto)
 def exitpresentation():
  p.keyboard.press('Escape');check(not api(p,'return g.getPresentation();'));check(p.locator('[data-action=presentation]').evaluate('(e)=>document.activeElement===e'));check(not p.locator('.topbar').evaluate('(e)=>e.inert'))
 case('Escape exits presentation and restores the original focus',exitpresentation)
 def readonly():
  api(p,'g.load(0);g.presentation(true);g.view("top");');p.wait_for_timeout(200);before=api(p,'return g.getState().paths;');q=api(p,'return g.project([1,0,1]);');p.mouse.click(q['x'],q['y']);p.keyboard.press('ArrowRight');check(api(p,'return g.getState().paths;')==before);api(p,'g.presentation(false);')
 case('presentation cannot accidentally edit the puzzle by pointer or keyboard',readonly)
 api(p,'const l=g.levels()[23];g.setState({level:l,paths:l.solution,selected:0,layer:2,moves:l.par,hints:0,elapsed:86,won:true});');p.wait_for_timeout(300)
 metrics['finalLevel']=api(p,'return g.stats();');capture(p,'14-atelier-final-level.png')
 def section():
  before=api(p,'return g.stats();');api(p,'g.slice(true);');p.wait_for_timeout(250);after=api(p,'return g.stats();');check(after['slice']);check(after['visibleEquipmentFloors']<before['visibleEquipmentFloors']);check(after['visibleEndpoints']<before['visibleEndpoints']);check(after['triangles']<before['triangles']);api(p,'g.slice(false);')
 case('sectioning hides upper equipment, endpoints and shaded geometry',section)
 def quality():
  high=api(p,'return g.stats();');setting(p,'quality','low');low=api(p,'return g.stats();');check(low['canvas']['width']<high['canvas']['width']);check(low['triangles']<high['triangles']);setting(p,'quality','high')
 case('low-power setting reduces resolution and pipe geometry immediately',quality)
 def turnover():
  first=api(p,'return g.stats();')
  for i in [0,15,23,2,23]:api(p,f'g.load({i});')
  api(p,'const l=g.levels()[23];g.setState({level:l,paths:l.solution,selected:0,layer:2,moves:l.par,hints:0,elapsed:86,won:true});');p.wait_for_timeout(200);last=api(p,'return g.stats();');check(last['geometries']==first['geometries']);check(last['textures']==first['textures']);metrics['repeatSceneCounts']={'before':first,'after':last}
 case('repeated scene changes do not accumulate active geometry or textures',turnover)
 def export():
  with p.expect_download() as dl:p.locator('#capture-button').click()
  dl.value.save_as(str(ROOT/'artifacts/15-exported-poster.png'));check((ROOT/'artifacts/15-exported-poster.png').stat().st_size>10000)
 case('poster export downloads an actual composited rendered PNG',export)
 def realmotion():
  setting(p,'motion',False);api(p,'g.home();');p.locator('[data-action=presentation]').click();p.locator('[data-action=tour]').click();check(p.locator('[data-action=tour]').get_attribute('aria-pressed')=='true');before=api(p,'return g.project([0,2,0]);');p.wait_for_timeout(1200);after=api(p,'return g.project([0,2,0]);');check(abs(before['x']-after['x'])>2);metrics['cpuOrbit']=api(p,'return g.stats();');p.keyboard.press('Escape');check(p.locator('[data-action=tour]').get_attribute('aria-pressed')=='false');setting(p,'motion',True)
 case('opt-in tour actually moves the camera and resets on exit',realmotion)
 def smoothview():
  setting(p,'motion',False);api(p,'g.load(23);');before=api(p,'return g.project([0,0,0]);');api(p,'g.view("detail");');early=api(p,'return g.project([0,0,0]);');p.wait_for_timeout(2200);late=api(p,'return g.project([0,0,0]);');d=lambda a,b:abs(a['x']-b['x'])+abs(a['y']-b['y']);check(d(early,late)>1,'No interpolated camera movement');check(d(before,late)>10);setting(p,'motion',True)
 case('camera view changes interpolate framing rather than jumping to the endpoint',smoothview)
 def max_lab():
  p.locator('[data-action=workshop]').first.click();p.locator('#seed-input').fill('ATELIER-STRESS');p.locator('#size-select').select_option('7');p.locator('#height-select').select_option('5');p.locator('#count-select').select_option('4');p.locator('#complexity-select').select_option('3');p.locator('[data-action=generate]').click();p.wait_for_timeout(300);st=api(p,'return g.getState();');check(st['level']['size']==7 and st['level']['height']==5);check(len(st['paths'])==4);check(api(p,'return g.stats().triangles;')>10000);metrics['maxWorkshop']=api(p,'return g.stats();')
 case('maximum 7×5×7 workshop configuration produces a rendered playable cabinet',max_lab)
 def migrate_v1():
  p.locator('#save-file').set_input_files(str(ROOT/'examples/v1-save-migration.json'));p.wait_for_function('window.__STRATA_TEST__.getScreen()==="home"');p.locator('#continue-button').click();st=api(p,'return g.getState();');check(st['level']['id']=='c01');check(st['paths'][0]==[[0,0,1],[1,0,1]]);check(api(p,'return g.getProfile().settings.volume;')==.18)
 case('actual v1 export uploads and resumes correctly in the new interface',migrate_v1)
 p.close()
 fallback=new_page(b,width=900,height=800,legacy=True)
 if not metrics['webglProbe']['webgl2']:
  case('without WebAssembly the basic software fallback still boots and plays',lambda:(check(api(fallback,'return g.stats().backend;')=='canvas-legacy'),api(fallback,'g.load(0);g.step([1,0,1]);'),check(len(api(fallback,'return g.getState().paths[0];'))==2)))
 fallback.close()
 mobile=new_page(b,width=390,height=844,mobile=True)
 capture(mobile,'16-atelier-mobile-home.png',True)
 def touchpresentation():
  mobile.locator('[data-action=presentation]').tap();check(api(mobile,'return g.getPresentation();'));check(mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'));mobile.locator('.presentation-exit').tap();check(not api(mobile,'return g.getPresentation();'))
 case('390px touch presentation opens, fits and exits',touchpresentation)
 mobile.locator('#continue-button').tap();mobile.locator('[data-cell="1,0,1"]').tap();check(len(api(mobile,'return g.getState().paths[0];'))==2)
 capture(mobile,'17-atelier-mobile-play.png',True)
 def pinch():
  mobile.locator('#viewport').scroll_into_view_if_needed();rect=mobile.locator('#viewport canvas').bounding_box();cx=rect['x']+rect['width']/2;cy=rect['y']+rect['height']/2;before=api(mobile,'return g.project([3,0,1]);');paths=api(mobile,'return g.getState().paths;');cdp=mobile.context.new_cdp_session(mobile)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx-25,'y':cy,'id':1},{'x':cx+25,'y':cy,'id':2}]})
  for amount in [32,40,49,58]:cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-amount,'y':cy,'id':1},{'x':cx+amount,'y':cy,'id':2}]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});mobile.wait_for_timeout(200);after=api(mobile,'return g.project([3,0,1]);');check(abs(after['x']-before['x'])>5);check(api(mobile,'return g.getState().paths;')==paths);cdp.detach()
 case('two simultaneous touch contacts zoom the camera without drawing pipes',pinch)
 mobile.close()
 case('new visual and presentation paths have no uncaught or console errors',lambda:(check(not errors,str(errors)),check(not console_errors,str(console_errors))))
 b.close()
report={'version':'2.0.0-rc.1','suite':'studio','mode':'inline-standalone','standaloneSHA256':hashlib.sha256((ROOT/'STRATA-Offline.html').read_bytes()).hexdigest(),'results':results,'passed':sum(x['passed'] for x in results),'failed':sum(not x['passed'] for x in results),'metrics':metrics,'captures':captures,'pageErrors':errors,'consoleErrors':console_errors,'nativeStorageVerified':False,'nativeURLVerified':False,'webglVerified':False,'seconds':round(time.time()-start,2)}
(ROOT/'artifacts/browser-studio.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'suite':'studio','passed':report['passed'],'failed':report['failed'],'seconds':report['seconds']}),flush=True)
raise SystemExit(report['failed']>0)
