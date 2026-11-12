'use strict';
// One isolated Electron window, no user documents. Run after `npm run build`.
const { _electron: electron } = require('playwright');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openmargin-chrome-header-'));
  const first = path.join(dir, 'first.md'), second = path.join(dir, 'second.md');
  await fs.writeFile(first, '# First\n\nFirst test document.\n');
  await fs.writeFile(second, '# Second\n\nSecond test document.\n');
  let app;
  try {
    const packaged = process.env.OPENMARGIN_TEST_APP;
    app = await electron.launch({ executablePath: packaged || require('electron'), args: [...(packaged ? [] : [root]), first, `--user-data-dir=${path.join(dir, 'profile')}`] });
    const win = await app.firstWindow();
    await win.getByRole('tab', { name: /first\.md/ }).waitFor();
    const platform=await app.evaluate(()=>process.platform);
    assert.equal(await win.locator('.topbar').getAttribute('data-platform'),platform,'header reflects the actual host platform');
    const bodyFont=await win.frameLocator('iframe[title="文档预览"]').locator('body').evaluate(body=>getComputedStyle(body).fontFamily);
    assert.match(bodyFont,/Microsoft YaHei/i,'Markdown supplies a Chinese font fallback on Windows');
    if(platform==='win32'){
      assert.equal(await win.locator('.topbar').evaluate(el=>getComputedStyle(el).paddingLeft),'8px','real Windows renderer does not reserve macOS window controls');
      assert.equal(await win.getByRole('button',{name:'保存',exact:true}).getAttribute('title'),'保存（Ctrl+S）');
      assert.equal(await win.getByRole('button',{name:'另存为',exact:true}).getAttribute('title'),'另存为（Ctrl+Shift+S）');
    }

    assert.equal(app.windows().length, 1, 'test must use only one window');
    await app.evaluate(({dialog}, file) => { dialog.showOpenDialog = async () => ({canceled:false, filePaths:[file]}); }, second);
    await win.getByRole('button', {name:/打开文件/}).first().click();
    const firstTab = win.getByRole('tab', {name:/first\.md/});
    const secondTab = win.getByRole('tab', {name:/second\.md/});
    await secondTab.waitFor();
    await win.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].some(t=>t.textContent.includes('second.md')&&t.getAttribute('aria-selected')==='true'));
    const geometry = await win.evaluate(() => {
      const strip=document.querySelector('.topbar'), tabs=[...document.querySelectorAll('.document-tab')], toolbar=document.querySelector('.toolbar');
      const inspect=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,background:s.backgroundColor,borderRadius:s.borderRadius,drag:s.getPropertyValue('-webkit-app-region'),before:getComputedStyle(e,'::before').backgroundImage,after:getComputedStyle(e,'::after').backgroundColor};};
      return {strip:inspect(strip), tabStrip:inspect(document.querySelector('.document-tabs')), tabs:tabs.map(inspect), toolbar:inspect(toolbar), open:inspect(document.querySelector('.tab-open'))};
    });
    assert.equal(geometry.strip.height,40,'top strip should be 40 CSS pixels high');
    assert.equal(geometry.strip.background,'rgb(232, 234, 237)','top strip uses the chosen light Chrome reference colour');
    assert.equal(geometry.tabs.length,2);
    // The renderer exposes the host platform; compare both CSS layouts while
    // preserving the drag regions and the original runtime platform.
    const platforms=await win.evaluate(()=>{const strip=document.querySelector('.topbar'),tab=strip.querySelector('.document-tab'),plus=strip.querySelector('.tab-open'),original=strip.dataset.platform;const measure=platform=>{strip.dataset.platform=platform;const style=getComputedStyle(strip);return {padding:style.paddingLeft,tabX:tab.getBoundingClientRect().x,plusX:plus.getBoundingClientRect().x,stripDrag:style.getPropertyValue('-webkit-app-region'),tabDrag:getComputedStyle(tab).getPropertyValue('-webkit-app-region'),plusDrag:getComputedStyle(plus).getPropertyValue('-webkit-app-region')}};const result={windows:measure('win32'),mac:measure('darwin')};strip.dataset.platform=original;return result});
    assert.equal(platforms.mac.padding,'82px','macOS keeps its traffic-light clearance');
    assert.equal(platforms.windows.padding,'8px','Windows does not reserve macOS traffic-light clearance');
    assert.equal(platforms.mac.tabX-platforms.windows.tabX,74,'Windows tabs move left with their controls');
    assert.equal(platforms.mac.plusX-platforms.windows.plusX,74,'Windows open button moves left with the tabs');
    for(const platform of Object.values(platforms)){assert.equal(platform.stripDrag,'drag');assert.equal(platform.tabDrag,'no-drag');assert.equal(platform.plusDrag,'no-drag')}

    const alignment=await win.evaluate(()=>[...document.querySelectorAll('.document-tab')].map(tab=>{const rect=e=>{const r=e.getBoundingClientRect();return {center:r.top+r.height/2,height:r.height}};const title=tab.querySelector('.tab-stem');const range=document.createRange();range.selectNodeContents(title);const text=range.getBoundingClientRect();const close=tab.querySelector('.tab-close-icon'),path=close.querySelector('path'),box=path.getBBox();return {tab:rect(tab),icon:rect(tab.querySelector('.file-icon')),name:rect(tab.querySelector('.tab-name')),text:{center:text.top+text.height/2},button:rect(tab.querySelector('button')),glyph:rect(close),pathCenter:{x:box.x+box.width/2,y:box.y+box.height/2}}}));
    for(const a of alignment){for(const child of ['icon','name','button','glyph'])assert.ok(Math.abs(a[child].center-a.tab.center)<=0.6,`${child} must align to tab centre`);assert.ok(Math.abs(a.text.center-a.tab.center)<=2,'filename text line box visually aligns');assert.deepEqual(a.pathCenter,{x:8,y:8},'close glyph artwork is centred');}
    for(const tab of geometry.tabs){assert.equal(tab.height,34,'tab height');assert.ok(tab.width>=88&&tab.width<=240,'tab width stays within limits');assert.equal(tab.drag,'no-drag','tab must not drag the native window');}
    assert.equal(geometry.tabs[0].background,'rgba(0, 0, 0, 0)','inactive tab background');
    assert.equal(geometry.tabs[1].background,'rgb(255, 255, 255)','active tab background');
    assert.match(geometry.tabs[1].borderRadius,/9px 9px 0px 0px/,'active tab top corners');
    assert.match(geometry.tabs[1].before,/radial-gradient/,'active tab has Chrome-style bottom shoulder');
    assert.equal(geometry.strip.drag,'drag','strip can drag native window');
    assert.equal(geometry.tabStrip.drag,'drag','tab-strip background remains draggable');
    assert.ok(geometry.toolbar.y>=geometry.strip.bottom-1,'document toolbar sits below the tab strip');
    assert.ok(geometry.open.y>=geometry.strip.y && geometry.open.bottom<=geometry.strip.bottom,'open control is in the top row');
    assert.equal(await win.locator('.toolbar').getByRole('button',{name:'打开文件',exact:true}).count(),0,'second row open button removed');
    assert.ok(geometry.strip.width-(geometry.tabStrip.x+geometry.tabStrip.width)>=55,'blank drag area stays visible');
    assert.ok(geometry.tabs[0].width<geometry.tabs[1].width,'shorter tab fits its label');
    assert.equal(await win.getByRole('button',{name:/新窗口/}).count(),0,'new-window toolbar button removed');
    assert.equal((await win.getByRole('button',{name:'划词批注'}).innerText()).trim(),'划词');
    assert.equal((await win.getByRole('button',{name:'框选区域',exact:true}).innerText()).trim(),'框选');
    assert.match((await win.locator('.sidebar-switch').getByRole('button',{name:/^记录/}).innerText()).trim(),/^记录\s*0$/);
    assert.equal((await win.getByTitle('重新加载文件和资源').innerText()).trim(),'刷新');
    for(const button of [win.getByRole('button',{name:'划词批注'}),win.getByRole('button',{name:'框选区域',exact:true}),win.getByTitle('重新加载文件和资源')]) assert.equal(await button.locator('svg').count(),1,'toolbar uses a graphical icon');
    const bar=win.locator('.toolbar');
    const save=bar.getByRole('button',{name:'保存',exact:true}),saveAs=bar.getByRole('button',{name:'另存为',exact:true});
    await save.waitFor();await saveAs.waitFor();
    assert.equal(await save.isEnabled(),false,'save is disabled until the body changes');
    assert.equal(await bar.getByRole('button',{name:'更多',exact:true}).count(),0,'save as is a direct action');
    assert.equal(await bar.locator('.save-indicator').count(),0,'no persistent save status label');
    const fonts=await bar.evaluate(el=>{const controls=[...el.querySelectorAll('button,input')].filter(e=>e.getClientRects().length);return controls.map(e=>({label:e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent.trim()||e.getAttribute('placeholder'),family:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight}));});
    for(const f of fonts) { assert.equal(f.family,fonts[0].family,`consistent font family: ${f.label}`); assert.equal(f.size,fonts[0].size,`consistent font size: ${f.label}`); assert.equal(f.weight,fonts[0].weight,`consistent font weight: ${f.label}`); }
    console.log('PASS toolbar fonts, direct save actions and no status label');
    console.log('PASS title-bar dimensions, styling, drag regions and second-row controls');
    await firstTab.click();
    await win.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].some(t=>t.textContent.includes('first.md')&&t.getAttribute('aria-selected')==='true'));
    assert.equal(await firstTab.getAttribute('aria-selected'),'true','click activates first tab');
    await firstTab.focus(); await firstTab.press('ArrowRight');
    await win.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].some(t=>t.textContent.includes('second.md')&&t.getAttribute('aria-selected')==='true'));
    assert.equal(await secondTab.getAttribute('tabindex'),'0','active tab remains keyboard focusable');
    await secondTab.press('ArrowLeft');
    await win.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].some(t=>t.textContent.includes('first.md')&&t.getAttribute('aria-selected')==='true'));
    console.log('PASS mouse and keyboard tab switching');
    await secondTab.getByRole('button',{name:/关闭 second\.md/}).click();
    await secondTab.waitFor({state:'detached'});
    assert.equal(await win.getByRole('tab',{name:/second\.md/}).count(),0,'close button closes intended tab');
    assert.equal(await firstTab.getAttribute('aria-selected'),'true','remaining tab stays active');
    await firstTab.getByRole('button',{name:/关闭 first\.md/}).click();
    await win.getByRole('button',{name:'打开本地文件'}).waitFor();
    const add=win.getByRole('button',{name:'打开文件',exact:true});await add.waitFor();
    const emptyPlatforms=await win.evaluate(()=>{const strip=document.querySelector('.topbar'),plus=strip.querySelector('.tab-open'),original=strip.dataset.platform;strip.dataset.platform='win32';const windows=plus.getBoundingClientRect().x;strip.dataset.platform='darwin';const mac=plus.getBoundingClientRect().x;strip.dataset.platform=original;return {windows,mac}});
    assert.equal(emptyPlatforms.mac-emptyPlatforms.windows,74,'empty Windows window also places its open button at the left');
    await add.click();await win.getByRole('tab',{name:/second\.md/}).waitFor();
    assert.equal(await win.locator('.topbar .tab-open').getAttribute('title'),'打开文件');
    // Open enough long filenames to overflow on a minimum-width window.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(850,600));
    for(let i=0;i<10;i++){const file=path.join(dir,`long-filename-${i}-abcdefghijklmnop.md`);await fs.writeFile(file,`# ${i}\n`);await app.evaluate(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]})},file);await add.click();await win.waitForFunction(n=>document.querySelectorAll('[role=tab]').length===n,i+2)}
    const compact=await win.evaluate(()=>{const top=document.querySelector('.topbar').getBoundingClientRect(),list=document.querySelector('.document-tabs'),plus=document.querySelector('.tab-open'),a=plus.getBoundingClientRect();return {overflow:list.scrollWidth>list.clientWidth,plusX:a.left,plusRight:a.right,topRight:top.right,plusDrag:getComputedStyle(plus).getPropertyValue('-webkit-app-region'),topDrag:getComputedStyle(document.querySelector('.topbar')).getPropertyValue('-webkit-app-region')}});
    assert.ok(compact.overflow,'many tabs overflow the scroll region');assert.ok(compact.plusRight<=compact.topRight-50,'plus remains accessible with drag space to its right');assert.equal(compact.plusDrag,'no-drag');assert.equal(compact.topDrag,'drag');assert.ok(await add.isVisible());
    console.log('PASS empty state plus button, narrow window overflow and drag area');
  } finally {
    if(app){let timer;try{await Promise.race([app.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Electron close timed out')),5000)})])}catch{app.process().kill()}finally{clearTimeout(timer)}}
    await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
