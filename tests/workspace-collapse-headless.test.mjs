import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
test('左右侧栏零宽收起、一次展开并保留正文和草稿',async()=>{
 const cacheDir=await mkdtemp(path.join(os.tmpdir(),'openmargin-vite-workspace-'));let server,browser;
 try{
  server=await createServer({configFile:false,cacheDir,optimizeDeps:{entries:['tests/workspace-collapse-fixture.jsx']},server:{port:0,watch:{ignored:['**/release/**','**/*.app/**']}},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/__workspace',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/tests/workspace-collapse-fixture.jsx"></script>')})}}]});
  await server.listen();
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
  const page=await browser.newPage({viewport:{width:1400,height:700}}), errors=[];
  page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  await page.goto(server.resolvedUrls.local[0]+'__workspace',{timeout:30000});
  try{await page.waitForFunction(()=>!!window.renderWorkspaceTest)}catch(error){throw new Error(`布局测试组件未加载: ${errors.join('; ')||error.message}`,{cause:error})}
  await page.evaluate(()=>window.renderWorkspaceTest({reading:{outline:310,content:700,outlineCollapsed:true},review:{outline:280,content:650,sidebar:320,sidebarCollapsed:true},reviewInitialized:true}));
  const outline=page.locator('[data-workspace-pane="outline"]'),side=page.locator('[data-workspace-pane="sidebar"]'),doc=page.locator('iframe[title="文档预览"]');
  await doc.waitFor();
  const frame=await doc.elementHandle(), content=await doc.boundingBox();
  assert.equal((await outline.boundingBox()).width,0);
  assert.equal(await page.locator('[data-workspace-divider="outline"]').count(),0);
  assert.equal(await page.getByRole('button',{name:'展开大纲'}).count(),0);
  await page.getByRole('button',{name:'显示或隐藏大纲'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-workspace-pane="outline"]').getBoundingClientRect().width===310);
  assert.equal((await doc.boundingBox()).width,content.width);
  assert.equal(await frame.evaluate(el=>el===document.querySelector('iframe[title="文档预览"]')),true,'正文 iframe 不重建');
  assert.equal(await doc.evaluate(el=>getComputedStyle(el).pointerEvents),'auto','正常阅读时 iframe 可交互');
  const leftDivider=page.locator('[data-workspace-divider="outline"]'),leftBox=await leftDivider.boundingBox();
  await page.evaluate(()=>document.addEventListener('pointerdown',event=>window.dragPointerId=event.pointerId,{once:true,capture:true}));
  await page.mouse.move(leftBox.x+3,leftBox.y+80);await page.mouse.down();
  assert.equal(await page.evaluate(()=>document.querySelector('.om-workspace').hasPointerCapture(window.dragPointerId)),true,'稳定布局容器接管指针');
  assert.equal(await doc.evaluate(el=>getComputedStyle(el).pointerEvents),'auto','拖动不改变 iframe 命中配置');
  assert.equal(await page.evaluate(()=>{const f=document.querySelector('iframe[title="文档预览"]'),r=f.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===document.querySelector('.om-workspace')}),true,'拖动遮罩接收 iframe 上方的指针');
  await Promise.race([page.mouse.move(leftBox.x-350,leftBox.y+80,{steps:5}),new Promise((_,reject)=>setTimeout(()=>reject(Error('收起大纲拖动未完成')),3000))]);
  await page.mouse.up();
  assert.equal(await doc.evaluate(el=>getComputedStyle(el).pointerEvents),'auto','松开后恢复 iframe 交互');
  assert.equal((await outline.boundingBox()).width,0);
  assert.equal(await page.locator('[data-workspace-divider="outline"]').count(),0);
  await page.getByRole('button',{name:'显示或隐藏大纲'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-workspace-pane="outline"]').getBoundingClientRect().width===310);
  async function finishWithoutMove(type,offset,buttons){
    const box=await page.locator('[data-workspace-divider="outline"]').boundingBox(),x=box.x+3,y=box.y+80;
    await page.evaluate(()=>document.addEventListener('pointerdown',event=>window.dragPointerId=event.pointerId,{once:true,capture:true}));
    await page.mouse.move(x,y);await page.mouse.down();
    await page.evaluate(({type,x,y,buttons})=>document.querySelector('.om-workspace').dispatchEvent(new PointerEvent(type,{pointerId:window.dragPointerId,clientX:x,clientY:y,buttons,bubbles:true})),{type,x:x+offset,y,buttons});
    await page.mouse.up();
  }
  await finishWithoutMove('lostpointercapture',40,0);
  await page.waitForFunction(()=>document.querySelector('[data-workspace-pane="outline"]').getBoundingClientRect().width===350);
  await finishWithoutMove('pointerup',30,0);
  await page.waitForFunction(()=>document.querySelector('[data-workspace-pane="outline"]').getBoundingClientRect().width===380);
  await finishWithoutMove('pointercancel',100,0);
  assert.equal((await outline.boundingBox()).width,380,'取消不提交伪造终点');
  await finishWithoutMove('lostpointercapture',100,1);
  assert.equal((await outline.boundingBox()).width,380,'按键仍按下时失去捕获不提交');
  const contentDivider=page.locator('[data-workspace-divider="content"]'),contentDividerBox=await contentDivider.boundingBox();
  await page.mouse.move(contentDividerBox.x+3,contentDividerBox.y+80);await page.mouse.down();
  assert.equal(await page.evaluate(()=>{const f=document.querySelector('iframe[title="文档预览"]'),r=f.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===document.querySelector('.om-workspace')}),true,'拖动遮罩阻挡 iframe 指针');
  await page.mouse.move(contentDividerBox.x-120,contentDividerBox.y+80,{steps:5});await page.mouse.up();
  assert.equal(await doc.evaluate(el=>getComputedStyle(el).pointerEvents),'auto','正文拖动结束恢复交互');
  const secondDivider=await page.locator('[data-workspace-divider="outline"]').boundingBox();
  await page.mouse.move(secondDivider.x+3,secondDivider.y+80);await page.mouse.down();
  assert.equal(await page.evaluate(()=>{const f=document.querySelector('iframe[title="文档预览"]'),r=f.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===document.querySelector('.om-workspace')}),true,'拖动遮罩阻挡 iframe 指针');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(()=>document.querySelector('.om-workspace')?.dataset.workspaceDragging!=='true');
  await page.mouse.up();
  await page.evaluate(()=>document.addEventListener('pointerdown',event=>window.dragPointerId=event.pointerId,{once:true,capture:true}));
  await page.mouse.move(secondDivider.x+3,secondDivider.y+80);await page.mouse.down();
  await page.evaluate(()=>document.querySelector('.om-workspace').dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.dragPointerId,bubbles:true})));
  await page.waitForFunction(()=>document.querySelector('.om-workspace')?.dataset.workspaceDragging!=='true');
  await page.mouse.up();
  await page.evaluate(()=>document.addEventListener('pointerdown',event=>window.dragPointerId=event.pointerId,{once:true,capture:true}));
  await page.mouse.move(secondDivider.x+3,secondDivider.y+80);await page.mouse.down();
  await page.mouse.move(secondDivider.x+3.5,secondDivider.y+80);
  await page.evaluate(()=>document.querySelector('.om-workspace').releasePointerCapture(window.dragPointerId));
  await page.mouse.move(secondDivider.x+4,secondDivider.y+80);
  await page.waitForFunction(()=>document.querySelector('.om-workspace')?.dataset.workspaceDragging!=='true');
  await page.mouse.up();
  const toggle=page.getByRole('button',{name:'批注'});
  await toggle.click();await page.waitForFunction(()=>document.querySelector('[data-workspace-pane="sidebar"]').getBoundingClientRect().width===320);
  const draft=page.getByRole('textbox',{name:'草稿'});await draft.fill('未保存的批注');
  const divider=page.locator('[data-workspace-divider="sidebar"]'),r=await divider.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+80);await page.mouse.down();await page.mouse.move(r.x+r.width/2+350,r.y+80,{steps:5});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('.om-workspace').dataset.workspaceMode==='reading');
  assert.equal((await side.boundingBox()).width,0);
  assert.equal(await page.locator('[data-workspace-divider="sidebar"]').count(),0);
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  assert.equal(await doc.evaluate(el=>getComputedStyle(el).pointerEvents),'auto','侧栏拖动收起后正文可接收指针');
  await doc.evaluate(el=>{el.contentWindow.wheelCount=0;el.contentWindow.addEventListener('wheel',()=>el.contentWindow.wheelCount++,{passive:true})});
  const documentBox=await doc.boundingBox();
  await page.mouse.move(documentBox.x+documentBox.width/2,documentBox.y+documentBox.height/2);
  await page.mouse.wheel(0,500);
  await page.waitForFunction(()=>document.querySelector('iframe[title="文档预览"]')?.contentWindow?.wheelCount>0,null,{timeout:3000});
  await doc.evaluate(el=>el.contentWindow.scrollBy(0,500));
  assert.ok(await doc.evaluate(el=>el.contentWindow.scrollY)>0,'正文仍具备滚动空间');
  await toggle.click();await page.waitForFunction(()=>document.querySelector('[data-workspace-pane="sidebar"]').getBoundingClientRect().width===320);
  assert.equal(await draft.inputValue(),'未保存的批注');
  assert.equal(await frame.evaluate(el=>el===document.querySelector('iframe[title="文档预览"]')),true);
 }finally{try{await browser?.close()}finally{try{await server?.close()}finally{await rm(cacheDir,{recursive:true,force:true})}}}
});

test('正文占满可用空间时大纲仍可双向拖动并恢复正文宽度偏好',async()=>{
 const cacheDir=await mkdtemp(path.join(os.tmpdir(),'openmargin-vite-filled-'));let server,browser;
 try{
  server=await createServer({configFile:false,cacheDir,optimizeDeps:{entries:['tests/workspace-collapse-fixture.jsx']},server:{port:0,watch:{ignored:['**/release/**','**/*.app/**']}},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/__workspace',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/tests/workspace-collapse-fixture.jsx"></script>')})}}]});await server.listen();
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});const page=await browser.newPage({viewport:{width:1400,height:700}});page.setDefaultTimeout(5000);await page.goto(server.resolvedUrls.local[0]+'__workspace',{timeout:30000});await page.waitForFunction(()=>!!window.renderWorkspaceTest);
  await page.evaluate(()=>window.renderWorkspaceTest({reading:{outline:244,content:1050,outlineCollapsed:false},review:{outline:244,content:1050,sidebar:320,outlineCollapsed:false,sidebarCollapsed:false},reviewInitialized:true}));
  const doc=page.locator('iframe[title="文档预览"]'),outline=page.locator('[data-workspace-pane="outline"]'),side=page.locator('[data-workspace-pane="sidebar"]');await doc.waitFor();const p=page.frameLocator('iframe[title="文档预览"]').locator('#wrap-test');await p.waitFor();
  const measure=async()=>({outline:(await outline.boundingBox()).width,frame:(await doc.boundingBox()).width,paragraph:await p.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),sidebar:(await side.boundingBox()).width});
  async function drag(which,delta){const el=page.locator(`[data-workspace-divider="${which}"]`),box=await el.boundingBox();assert.ok(box&&box.width>0,`${which} 分隔条可用`);await page.evaluate(()=>document.addEventListener('pointerdown',e=>window.__lastWorkspacePointer=e.pointerId,{once:true,capture:true}));await page.mouse.move(box.x+box.width/2,box.y+80);await page.mouse.down();await page.mouse.move(box.x+box.width/2+delta,box.y+80,{steps:8});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('.om-workspace')?.dataset.workspaceDragging!=='true');assert.equal(await doc.evaluate(el=>getComputedStyle(el).pointerEvents),'auto','鼠标松开后恢复 iframe 交互');assert.equal(await page.evaluate(()=>document.querySelector('.om-workspace').hasPointerCapture(window.__lastWorkspacePointer)),false,'鼠标松开后释放指针捕获')}
  async function preference(mode){return page.evaluate(mode=>JSON.parse(localStorage.getItem('openmargin:workspace:/fixture.md'))[mode].content,mode)}
  const reading=await measure();assert.equal(reading.outline,244);assert.ok(reading.frame<1050,'阅读态正文初始受空间约束');await drag('outline',80);const readingNarrow=await measure();assert.ok(readingNarrow.outline>=reading.outline+75,'正文满宽时大纲仍可向右拖');assert.ok(readingNarrow.frame<=reading.frame-75,'正文按可用空间缩窄');assert.ok(readingNarrow.paragraph.width<reading.paragraph.width&&readingNarrow.paragraph.height>reading.paragraph.height,'长正文随缩窄重新换行');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('openmargin:workspace:/fixture.md')).reading.content===1050);assert.equal(await preference('reading'),1050,'临时约束不覆盖正文宽度偏好');await drag('outline',-80);const readingBack=await measure();assert.ok(Math.abs(readingBack.outline-reading.outline)<2&&Math.abs(readingBack.frame-reading.frame)<2,'反向拖动恢复大纲与正文宽度');
  const toggle=page.getByRole('button',{name:'批注'});await toggle.click();await page.waitForFunction(()=>document.querySelector('.om-workspace').dataset.workspaceMode==='review');const review=await measure();assert.ok(review.frame<1050,'评审态正文同样受可用空间约束');await drag('outline',80);const reviewNarrow=await measure();assert.ok(reviewNarrow.outline>=review.outline+75,'评审态大纲可向右拖');assert.ok(reviewNarrow.frame<=review.frame-75&&reviewNarrow.paragraph.height>review.paragraph.height,'评审态正文跟随空间重排');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('openmargin:workspace:/fixture.md')).review.content===1050);assert.equal(await preference('review'),1050);await drag('outline',-80);const reviewBack=await measure();assert.ok(Math.abs(reviewBack.frame-review.frame)<2,'评审态反向拖动恢复正文宽度');
  await drag('sidebar',-50);assert.ok((await measure()).sidebar>=reviewBack.sidebar+45,'展开后右侧分隔条可拖');await drag('sidebar',50);await toggle.click();await page.waitForFunction(()=>document.querySelector('.om-workspace').dataset.workspaceMode==='reading');const closed=await measure();await drag('outline',30);assert.ok((await measure()).outline>=closed.outline+25,'关闭右栏后大纲分隔条仍可拖');
 }finally{try{await browser?.close()}finally{try{await server?.close()}finally{await rm(cacheDir,{recursive:true,force:true})}}}
});

test('大纲和侧栏收起恢复后切换 HTML 与调整窗口，大纲仍可指针拖动',async()=>{
 const cacheDir=await mkdtemp(path.join(os.tmpdir(),'om-layout-file-switch-'));let server,browser;
 try{
  server=await createServer({configFile:false,cacheDir,optimizeDeps:{entries:['tests/workspace-collapse-fixture.jsx']},server:{port:0,watch:{ignored:['**/release/**','**/*.app/**']}},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/__workspace',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/tests/workspace-collapse-fixture.jsx"></script>')})}}]});await server.listen();const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});const page=await browser.newPage({viewport:{width:1400,height:700}});page.setDefaultTimeout(5000);await page.goto(server.resolvedUrls.local[0]+'__workspace',{timeout:30000});await page.waitForFunction(()=>!!window.renderWorkspaceTest);await page.evaluate(()=>window.renderWorkspaceTest({reading:{outline:244,content:1050,outlineCollapsed:false},review:{outline:244,content:1050,sidebar:320,outlineCollapsed:false,sidebarCollapsed:false},reviewInitialized:true}));
  const workspace=page.locator('.om-workspace'),outline=page.locator('[data-workspace-pane="outline"]'),preview=page.locator('iframe[title="文档预览"]'),toggle=page.getByRole('button',{name:'批注'});await preview.waitFor();
  async function drag(which,delta){const el=page.locator(`[data-workspace-divider="${which}"]`),r=await el.boundingBox();assert.ok(r&&r.width>0);await page.evaluate(()=>document.addEventListener('pointerdown',e=>window.__layoutPointer=e.pointerId,{once:true,capture:true}));await page.mouse.move(r.x+r.width/2,r.y+80);await page.mouse.down();assert.equal(await workspace.getAttribute('data-workspace-dragging'),'true','按下后进入拖动状态');await page.mouse.move(r.x+r.width/2+delta,r.y+80,{steps:8});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('.om-workspace')?.dataset.workspaceDragging!=='true');assert.equal(await page.evaluate(()=>document.querySelector('.om-workspace').hasPointerCapture(window.__layoutPointer)),false,'松开后不保留旧指针');assert.equal(await preview.evaluate(e=>getComputedStyle(e).pointerEvents),'auto')}
  await drag('outline',-220);assert.equal((await outline.boundingBox()).width,0,'先折叠大纲');await page.getByRole('button',{name:'显示或隐藏大纲'}).click();await page.waitForFunction(()=>document.querySelector('[data-workspace-pane="outline"]').getBoundingClientRect().width===244);await toggle.click();await page.waitForFunction(()=>document.querySelector('.om-workspace').dataset.workspaceMode==='review');await drag('sidebar',200);await page.waitForFunction(()=>document.querySelector('.om-workspace').dataset.workspaceMode==='reading');assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>window.switchWorkspaceFixture('/fixture.html'));await page.waitForFunction(()=>document.querySelector('iframe[title="文档预览"]')?.getAttribute('sandbox')==='allow-scripts allow-forms');const expandedWidth=await workspace.evaluate(e=>e.getBoundingClientRect().width);await page.setViewportSize({width:1000,height:650});await page.waitForFunction(prev=>document.querySelector('.om-workspace').getBoundingClientRect().width<prev-100,expandedWidth);const before=(await outline.boundingBox()).width;await drag('outline',80);const after=(await outline.boundingBox()).width;assert.ok(after>=before+75,`HTML 窗口变化后大纲仍可拖: ${before} → ${after}`);
  // File changes mid-capture must not leave a stale dragRef that rejects later starts.
  const r=await page.locator('[data-workspace-divider="outline"]').boundingBox();await page.mouse.move(r.x+3,r.y+80);await page.mouse.down();assert.equal(await workspace.getAttribute('data-workspace-dragging'),'true');await page.evaluate(()=>window.switchWorkspaceFixture('/fixture.md'));await page.mouse.up();await page.waitForFunction(()=>document.querySelector('.om-workspace')?.dataset.workspaceDragging!=='true');const mdBefore=(await outline.boundingBox()).width;await drag('outline',40);const mdAfter=(await outline.boundingBox()).width;assert.ok(mdAfter>=mdBefore+35,'切换文件期间释放指针后，下一次拖动可生效');
 }finally{try{await browser?.close()}finally{try{await server?.close()}finally{await rm(cacheDir,{recursive:true,force:true})}}}
});
