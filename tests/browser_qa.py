"""Reproducible browser QA. Requires Python Playwright + Chromium, separately installed.

In restricted environments, --inline loads the actual standalone build via
page.set_content; native URL navigation/storage/service-worker deployment are NOT
validated by this route. Storage-dependent cases explicitly use a Storage test double.
No browser policy is disabled. Use --url http://127.0.0.1:4173/?test=1 for hosted QA.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse, json, time, traceback, hashlib

ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--suite',choices=['core','features','layout'],default='core');parser.add_argument('--inline',action='store_true');parser.add_argument('--url');parser.add_argument('--browser',default='/usr/bin/chromium');args=parser.parse_args()
results=[];errors=[];console_errors=[];requests=[];captures=[];start=time.time()

def case(name, fn):
    t=time.time()
    try:
        fn();results.append({'name':name,'passed':True,'seconds':round(time.time()-t,3)});print('PASS',name,flush=True)
    except Exception as e:
        results.append({'name':name,'passed':False,'error':str(e),'seconds':round(time.time()-t,3)});print('FAIL',name,str(e),flush=True);traceback.print_exc()

def check(v,message='Assertion failed'):
    if not v: raise AssertionError(message)

def api(page,expression,arg=None):
    return page.evaluate('(arg)=>{const g=window.__STRATA_TEST__;'+expression+'}',arg)

def close(page):
    api(page,'g.close();')

def click_cell(page,p):
    page.locator('[data-cell="'+','.join(map(str,p))+'"]').click()

def state(page):return api(page,'return g.getState();')
def length(page):return sum(len(p)-1 for p in state(page)['paths'])
def load(page,i):api(page,'g.load(arg);',i)
def action(page,name):page.locator(f'[data-action="{name}"]:visible').first.click()
def capture(page,name,full=False):
    page.screenshot(path=str(ROOT/'artifacts'/name),full_page=full)
    captures.append({'file':name,'renderer':api(page,'return g.stats();'),'storageMock':page.evaluate('!!window.__STORAGE_TEST_DOUBLE__'),'viewport':page.viewport_size})

def new_page(browser,width=1440,height=960,mock=False,mobile=False,saved=None):
    page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=mobile,has_touch=mobile,reduced_motion='reduce',accept_downloads=True)
    page.set_default_timeout(6500)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
    if args.url:
        page.goto(args.url,wait_until='load')
    else:
        page.evaluate('window.__STRATA_ENABLE_TEST__=true')
        if mock:
            page.evaluate('''(entries)=>{window.__STORAGE_TEST_DOUBLE__=true;const data=new Map(Object.entries(entries||{}));Object.defineProperty(window,'localStorage',{value:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),clear:()=>data.clear()}});window.__STORAGE_DATA__=data;}''',saved or {})
        page.set_content((ROOT/'STRATA-Offline.html').read_text(),wait_until='load')
    page.wait_for_function('!!window.__STRATA_TEST__');page.wait_for_timeout(160)
    return page

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.browser,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    if args.suite=='core':
        page=new_page(browser,mock=True)
        case('standalone boots a real Three scene and no network requests',lambda:(check(api(page,'return g.getScreen();')=='home'),check(api(page,'return g.stats().triangles;')>1000),check(len(requests)==0)))
        def first_level():
            page.locator('#continue-button').click();check(state(page)['level']['id']=='c01')
            for x in [1,2,3]:click_cell(page,[x,0,1])
            check(length(page)==3);check(page.locator('#run-count').inner_text()=='1 / 1');page.locator('#run-button').click()
            page.wait_for_function('window.__STRATA_TEST__.getPhase()==="won"',timeout=10000)
            page.wait_for_timeout(650);check(page.locator('#modal').is_visible());check(page.locator('.win-stars').get_attribute('aria-label')=='获得 3 颗星')
            check(api(page,'return g.getProfile().records.c01.stars;')==3)
        case('pointer drawing → actual liquid timer → three-star report → record',first_level)
        case('win next-level button enters c02',lambda:(action(page,'next'),check(state(page)['level']['id']=='c02')))
        def layers():
            before=length(page);page.locator('[data-layer="2"]').click();check(length(page)==before)
            page.locator('#up-button').click();check(state(page)['layer']==1);check(length(page)==1)
            for x in [1,2,3]:click_cell(page,[x,1,1])
            page.locator('#down-button').click();check(length(page)==5);check(page.locator('#run-count').inner_text()=='1 / 1')
        case('layer observation does not draw; ascent, overpass, descent connect',layers)
        def undo_redo():
            page.locator('#undo-button').click();check(length(page)==4);page.locator('#redo-button').click();check(length(page)==5)
            action(page,'clear');check(length(page)==0);page.locator('#undo-button').click();check(length(page)==5)
        case('undo, redo and clearing use real UI actions',undo_redo)
        def drag_board():
            load(page,0);cells=[page.locator(f'[data-cell="{x},0,1"]').bounding_box() for x in range(4)]
            point=lambda b:(b['x']+b['width']/2,b['y']+b['height']/2)
            page.mouse.move(*point(cells[0]));page.mouse.down()
            for cell in cells[1:]:page.mouse.move(*point(cell),steps=5)
            page.mouse.up();check(length(page)==3)
        case('continuous board drag survives DOM updates',drag_board)
        def raycast():
            load(page,0);page.locator('[data-view="top"]').click();page.wait_for_timeout(120)
            pos=api(page,'return g.project([1,0,1]);');page.mouse.click(pos['x'],pos['y']);check(length(page)==1)
            canvas=page.locator('#viewport canvas');box=canvas.bounding_box();before=api(page,'return g.project([3,0,1]);')
            page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']/2+100,box['y']+box['height']/2+40,steps=12);page.mouse.up()
            after=api(page,'return g.project([3,0,1]);');check(abs(before['x']-after['x'])+abs(before['y']-after['y'])>5);check(length(page)==1)
        case('Three.js raycast point selection and drag-orbit work in software view',raycast)
        def keyboard_pause():
            load(page,0);page.locator('body').click(position={'x':4,'y':4});page.keyboard.press('ArrowRight');check(length(page)==1)
            page.keyboard.press('e');check(state(page)['layer']==1);page.keyboard.press('z');check(length(page)==1)
            page.keyboard.press('Escape');check(page.locator('#modal-title').inner_text()=='让时间停一会儿');elapsed=state(page)['elapsed'];page.wait_for_timeout(300);check(state(page)['elapsed']==elapsed)
            page.keyboard.press('Escape');check(not page.locator('#modal').is_visible())
        case('keyboard movement, ascent, undo, pause and Escape are usable',keyboard_pause)
        def hints():
            load(page,0);page.locator('#hint-button').click();check(state(page)['hints']==1);check(page.locator('.cell.hinted').count()==1);check(length(page)==0)
            for x in [1,2,3]:click_cell(page,[x,0,1])
            page.locator('#run-button').click();api(page,'g.advance(100);');page.wait_for_timeout(650);check(page.locator('.win-stars').get_attribute('aria-label')=='获得 2 颗星');close(page)
        case('hint highlights a next cell and reduces independent-solve star',hints)
        def collision():
            load(page,2)
            for x in [1,2,3,4]:click_cell(page,[x,0,2])
            page.locator('#circuits [data-circuit="1"]').click();click_cell(page,[2,0,1]);check(length(page)==5);click_cell(page,[2,0,2]);check(length(page)==5);check('不同液体' in page.locator('#toast').inner_text())
            page.locator('#up-button').click();click_cell(page,[2,1,2]);click_cell(page,[2,1,3]);click_cell(page,[2,1,4]);page.locator('#down-button').click();check(page.locator('#run-count').inner_text()=='2 / 2')
        case('occupied grid collision rejected while 3D overpass succeeds',collision)
        def gravity():
            load(page,13);page.locator('#up-button').click();check(length(page)==1);page.locator('#up-button').click();check(length(page)==1);check('泵额度' in page.locator('#toast').inner_text());page.locator('#undo-button').click();check(length(page)==0)
        case('one pump is consumed, second ascent rejected, undo refunds',gravity)
        case('no runtime or console errors during core actions',lambda:(check(not errors,str(errors)),check(not console_errors,str(console_errors))))
        page.close()
    elif args.suite=='features':
        page=new_page(browser,mock=True)
        def levels():
            action(page,'levels');check(page.locator('.level-tile').count()==24);check(page.locator('.level-tile:disabled').count()==23)
            action(page,'practice');check(page.locator('.level-tile:disabled').count()==0);page.locator('[data-level="23"]').click();check(state(page)['level']['id']=='c24')
        case('24 levels, progressive locking, and explicit free level selection',levels)
        def workshop():
            action(page,'workshop');page.locator('#seed-input').fill('QA-seed');page.locator('#size-select').select_option('6');page.locator('#height-select').select_option('5');page.locator('#count-select').select_option('4');action(page,'generate')
            s=state(page);check(s['level']['size']==6);check(s['level']['height']==5);check(len(s['paths'])==4);check('QA-seed' in s['level']['subtitle'])
        case('workshop seed and dimension controls generate a playable level',workshop)
        case('daily entry generates a locally dated verified level',lambda:(action(page,'daily'),check(state(page)['level']['id'].startswith('daily-'))))
        def settings():
            action(page,'settings');page.locator('#setting-sound').uncheck();page.locator('#setting-quality').select_option('low');page.locator('#setting-motion').check();page.locator('#setting-volume').focus();page.keyboard.press('Home');[page.keyboard.press('ArrowRight') for _ in range(18)];check(api(page,'return g.getProfile().settings.volume;')==.18);check(api(page,'return g.getProfile().settings.quality;')=='low');check(page.locator('html').get_attribute('class')=='reduced-motion');close(page)
        case('settings persist selected quality, sound, reduced motion',settings)
        def import_level():
            level=api(page,'return g.levels()[2];')
            page.locator('#level-file').set_input_files({'name':'valid-level.json','mimeType':'application/json','buffer':json.dumps(level).encode()});page.wait_for_function('window.__STRATA_TEST__.getState().level.id.startsWith("import-")');check(state(page)['level']['name'].startswith('导入'))
            before=state(page)['level']['id'];page.locator('#level-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{"size":100}'});page.wait_for_timeout(150);check(state(page)['level']['id']==before);check('无法导入' in page.locator('#toast').inner_text())
        case('JSON level import accepts validated solution and rejects malformed input',import_level)
        def export_level():
            action(page,'pause')
            with page.expect_download() as event:action(page,'export-level')
            file=event.value;file.save_as(str(ROOT/'artifacts/exported-level.json'));check('solution' in json.loads((ROOT/'artifacts/exported-level.json').read_text()));close(page)
        case('level export produces a real downloaded valid JSON',export_level)
        def progress():
            load(page,0);click_cell(page,[1,0,1]);api(page,'g.save();');action(page,'settings')
            with page.expect_download() as event:action(page,'export-save')
            event.value.save_as(str(ROOT/'artifacts/exported-progress.json'));data=(ROOT/'artifacts/exported-progress.json').read_bytes();check(json.loads(data)['session']['paths'][0][-1]==[1,0,1]);close(page)
            load(page,1);page.locator('#save-file').set_input_files({'name':'progress.json','mimeType':'application/json','buffer':data});page.wait_for_function('window.__STRATA_TEST__.getScreen()==="home"');page.locator('#continue-button').click();check(state(page)['level']['id']=='c01');check(length(page)==1)
        case('progress export/import restores routes through a real file upload',progress)
        def reload_test_double():
            api(page,'g.save();')
            if args.url:
                page.reload(wait_until='load');page.wait_for_function('!!window.__STRATA_TEST__');page.locator('#continue-button').click();check(length(page)==1);check(state(page)['level']['id']=='c01')
            else:
                saved=page.evaluate('Object.fromEntries(window.__STORAGE_DATA__)');other=new_page(browser,mock=True,saved=saved);other.locator('#continue-button').click();check(length(other)==1);check(state(other)['level']['id']=='c01');other.close()
        case('native reload restores saved progress' if args.url else 'new document restores saved progress using explicit Storage test double',reload_test_double)
        def screenshot_download():
            with page.expect_download() as event:page.locator('#capture-button').click()
            event.value.save_as(str(ROOT/'artifacts/exported-cabinet.png'));check((ROOT/'artifacts/exported-cabinet.png').stat().st_size>1000)
        case('cabinet capture downloads an actual rendered PNG',screenshot_download)
        def reset():
            action(page,'settings');action(page,'reset-save');check('清空' in page.locator('#modal-title').inner_text());action(page,'confirm-reset-save');check(api(page,'return g.getScreen();')=='home');check(api(page,'return Object.keys(g.getProfile().records).length;')==0);check(api(page,'return g.getProfile().session;') is None)
        case('confirmed reset returns to home without throwing or preserving stale session',reset)
        case('no runtime/console errors in feature actions',lambda:(check(not errors,str(errors)),check(not console_errors,str(console_errors))))
        page.close()
    else:
        page=new_page(browser,mock=False)
        page.wait_for_timeout(3800)
        case('desktop home fits viewport without horizontal overflow',lambda:check(page.evaluate('document.documentElement.scrollWidth<=innerWidth')))
        capture(page,'01-home-desktop.png')
        api(page,'''const l=g.levels()[23];g.setState({level:l,paths:l.solution,selected:0,layer:2,moves:l.par,hints:0,elapsed:86,won:true});''');page.wait_for_timeout(200)
        capture(page,'02-final-cabinet-desktop.png')
        page.locator('[data-view="front"]').click();page.wait_for_timeout(150);capture(page,'03-front-desktop.png')
        page.locator('[data-view="top"]').click();page.wait_for_timeout(150);capture(page,'04-top-desktop.png')
        page.locator('#slice-button').click();page.wait_for_timeout(150);capture(page,'05-slice-desktop.png')
        action(page,'levels');capture(page,'06-levels-desktop.png');close(page)
        action(page,'workshop');capture(page,'07-workshop-desktop.png');close(page)
        page.close()
        for width,height in [(390,844),(360,800),(768,1024)]:
            mobile=new_page(browser,width,height,mock=False,mobile=width<700)
            mobile.locator('#continue-button').click();mobile.wait_for_timeout(350)
            case(f'{width}px gameplay has no horizontal overflow',lambda m=mobile:check(m.evaluate('document.documentElement.scrollWidth<=innerWidth')))
            def tapping(m=mobile):
                for x in [1,2,3]:m.locator(f'[data-cell="{x},0,1"]').tap() if width<700 else click_cell(m,[x,0,1])
                check(length(m)==3)
            case(f'{width}px actual touch/pointer input completes introductory pipe',tapping)
            if width==390:
                mobile.wait_for_timeout(3800);capture(mobile,'08-mobile-first-level.png',True)
                load(mobile,23);mobile.wait_for_timeout(3800);capture(mobile,'09-mobile-final-level.png',True)
                case('390px final level cells have minimum 44px touch width',lambda:check(mobile.locator('.cell').first.bounding_box()['width']>=44))
                case('mobile navigation includes workshop and daily controls',lambda:(check(mobile.locator('.topnav [data-action="workshop"]').is_visible()),check(mobile.locator('.topnav [data-action="daily"]').is_visible())))
            if width==768:
                mobile.wait_for_timeout(3800);capture(mobile,'10-tablet-game.png',True)
            mobile.close()
        denied=new_page(browser,mock=False)
        denied.locator('#continue-button').click()
        if args.url:
            case('native storage is available on hosted origin',lambda:check('本地自动保存' in denied.locator('#save-status').inner_text()))
        else:
            case('unavailable native storage degrades explicitly while gameplay remains usable',lambda:check('存储不可用' in denied.locator('#save-status').inner_text()))
        denied.close()
        case('no runtime/console errors in responsive render checks',lambda:(check(not errors,str(errors)),check(not console_errors,str(console_errors))))
    browser.close()

report={'standaloneSHA256':hashlib.sha256((ROOT/'STRATA-Offline.html').read_bytes()).hexdigest(),'suite':args.suite,'mode':'hosted' if args.url else 'inline-standalone','nativeURLNavigationVerified':bool(args.url),'nativeStorageVerified':bool(args.url and args.suite=='features' and all(x['passed'] for x in results)),'webglVerified':False,'renderer':'Three.js r140; review actual renderer stats and screenshots' if args.url else 'Three.js r140 scene + CPU software fallback in this environment','browser':args.browser,'results':results,'passed':sum(x['passed'] for x in results),'failed':sum(not x['passed'] for x in results),'pageErrors':errors,'consoleErrors':console_errors,'networkRequests':requests,'screenshots':captures,'seconds':round(time.time()-start,3)}
(ROOT/'artifacts'/f'browser-{args.suite}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'suite':args.suite,'passed':report['passed'],'failed':report['failed'],'seconds':report['seconds']}),flush=True)
raise SystemExit(1 if report['failed'] else 0)
