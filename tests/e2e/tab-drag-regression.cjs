const {openSource}=require('./edit-helpers.cjs');
'use strict';
// Integration test: exactly one Electron process with temporary data. Creates a second
// short-lived test window to verify transfers. Run sequentially and close afterwards.
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'openmargin-tab-drag-'));
 const left=path.join(dir,'one'),right=path.join(dir,'two');await fs.mkdir(left);await fs.mkdir(right);
 const a=path.join(left,'same.md'),b=path.join(right,'same.md'),c=path.join(dir,'other.md'),inlineMd=path.join(dir,'inline.md'),inlineHtml=path.join(dir,'inline.html'),noteFile=path.join(dir,'note.md');
 await fs.writeFile(a,'# 左侧同名\n\n左文件正文\n');await fs.writeFile(b,'# 右侧同名\n\n右文件正文\n');await fs.writeFile(c,'# 其他文件\n\n待转移正文\n');await fs.writeFile(inlineMd,'# 测试\n\n原始内容\n');await fs.writeFile(inlineHtml,'<!doctype html><html><body><h1>测试</h1><p>原始内容</p></body></html>');await fs.writeFile(noteFile,'# 待批注\n\n这是一段等待审阅的文字。\n');let app;
 try{
  const packaged=process.env.OPENMARGIN_TEST_APP;
  app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),a,`--user-data-dir=${dir}/profile`]});
  const w=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({x:50,y:140,width:1000,height:650}));
  // CDP pointer injection reports viewport coordinates as screenX/Y. Correct only
  // these test events; real macOS mouse input already supplies global coordinates.
  async function installPointerCoordinates(win){await win.evaluate(()=>{for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])window.addEventListener(type,e=>{Object.defineProperty(e,'screenX',{configurable:true,value:window.screenX+e.clientX});Object.defineProperty(e,'screenY',{configurable:true,value:window.screenY+e.clientY})},true)})}
  await installPointerCoordinates(w);
  const tabs=win=>win.getByRole('tab');const activate=async(win,text)=>{await win.getByRole('tab',{name:new RegExp(text)}).click();await win.waitForFunction(t=>[...document.querySelectorAll('[role=tab]')].some(e=>e.textContent.includes(t)&&e.getAttribute('aria-selected')==='true'),text)};
  async function choose(win,file){await app.evaluate(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]})},file);await win.getByRole('button',{name:/打开文件/}).first().click();await win.waitForTimeout(400)}
  async function drag(win,locator,x,y){const box=await locator.boundingBox();assert.ok(box,'tab exists');const sx=box.x+Math.min(55,box.width/2),sy=box.y+box.height/2;await win.mouse.move(sx,sy);await win.mouse.down();await win.mouse.move(x,y,{steps:12});await win.mouse.up()}
  await w.getByRole('tab',{name:/same\.md/}).waitFor();await choose(w,b);await choose(w,c);assert.equal(await tabs(w).count(),3,'same name at different paths must be separate tabs');
  // Real pointer events within tab bar must change the visual/DOM order.
  const before=await tabs(w).allTextContents(),first=await tabs(w).nth(0).boundingBox();await drag(w,tabs(w).nth(2),first.x+5,first.y+first.height/2);
  await w.waitForFunction(()=>document.querySelector('[role=tab]')?.textContent.includes('other.md'));
  assert.notDeepEqual(await tabs(w).allTextContents(),before);console.log('PASS tab drag reorders without confusing same-name files');
  await activate(w,'other.md');await openSource(w);const source=w.locator('.source-editor textarea'),draft=(await source.inputValue())+'\n待转移草稿';await source.fill(draft);
  // Cancel a drag while a draft is dirty: both the tab and its draft must survive.
  const cancelBox=await w.getByRole('tab',{name:/other\.md/}).boundingBox();
  await w.mouse.move(cancelBox.x+40,cancelBox.y+cancelBox.height/2);await w.mouse.down();await w.mouse.move(1040,25,{steps:8});await w.keyboard.press('Escape');await w.mouse.up();
  assert.equal(await w.getByRole('tab',{name:/other\.md/}).count(),1,'cancelled drag keeps source tab');assert.equal(await source.inputValue(),draft,'cancelled drag keeps draft');
  console.log('PASS cancelled drag keeps source and draft');
  // Move outside the source window into clear desktop; pointer capture lets us finish the gesture.
  await w.evaluate(()=>{window.__omPointerEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,e=>{window.__omPointerEvents.push({type:e.type,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,pointerId:e.pointerId,isTrusted:e.isTrusted,target:e.target?.className});if(window.__omPointerEvents.length>40)window.__omPointerEvents.shift()},true)});
  await app.evaluate(({ipcMain,screen})=>{const original=ipcMain._invokeHandlers?.get('tab:complete-transfer');globalThis.__omTransferDiagnostics={handlerFound:!!original,invocations:[]};if(original){ipcMain.removeHandler('tab:complete-transfer');ipcMain.handle('tab:complete-transfer',async(event,token,x,y)=>{const entry={x,y,systemCursor:screen.getCursorScreenPoint()};globalThis.__omTransferDiagnostics.invocations.push(entry);try{entry.result=await original(event,token,x,y);return entry.result}catch(e){entry.error=String(e);throw e}})}});
  let w2;
  try{const opened=app.waitForEvent('window',{timeout:12000});await drag(w,w.getByRole('tab',{name:/other\.md/}),1040,25);w2=await opened;await w2.getByRole('tab',{name:/other\.md/}).waitFor({timeout:12000})}
  catch(error){const page=await w.evaluate(()=>({events:window.__omPointerEvents,toast:document.querySelector('[role=status]')?.innerText||'',screen:{x:window.screenX,y:window.screenY,width:window.innerWidth,height:window.innerHeight}}));const main=await app.evaluate(({BrowserWindow})=>({transfer:globalThis.__omTransferDiagnostics,windows:BrowserWindow.getAllWindows().map(win=>({bounds:win.getBounds(),visible:win.isVisible()}))}));console.error('DETACH_DIAGNOSTICS',JSON.stringify({page,main},null,2));throw error}

  await installPointerCoordinates(w2);
  await w.waitForFunction(()=>![...document.querySelectorAll('[role=tab]')].some(e=>e.textContent.includes('other.md')));
  assert.equal(await w2.locator('.source-editor textarea').inputValue(),draft,'transfer retains unsaved source draft');assert.equal((await fs.readFile(c,'utf8')).includes('待转移草稿'),false,'transfer must not save the draft');
  console.log('PASS detach transfers tab and preserves dirty source editor');
  await app.evaluate(({BrowserWindow})=>{const wins=BrowserWindow.getAllWindows();wins[0].setBounds({x:50,y:140,width:1000,height:650});wins[1].setBounds({x:700,y:140,width:850,height:650})});
  // Force the destination acknowledgement to fail. Source ownership and both drafts must survive.
  await app.evaluate(({ipcMain})=>{globalThis.__omAck=ipcMain.listeners('tab:transfer-ack');ipcMain.removeAllListeners('tab:transfer-ack');for(const fn of globalThis.__omAck)ipcMain.on('tab:transfer-ack',(e,token)=>{globalThis.__omRejected=(globalThis.__omRejected||0)+1;fn(e,token,false)})});
  const beforeCount=await tabs(w).count(),sourceOrigin=await w.evaluate(()=>({x:window.screenX,y:window.screenY})),destination=await w2.evaluate(()=>({x:window.screenX+500,y:window.screenY+20}));
  await drag(w,w.getByRole('tab',{name:/same\.md/}).first(),destination.x-sourceOrigin.x,destination.y-sourceOrigin.y);
  await w.waitForTimeout(1200);
  assert.ok(await app.evaluate(()=>globalThis.__omRejected>0),'destination was reached and ack was rejected');
  assert.equal(await tabs(w).count(),beforeCount,'failed transfer preserves source tab');assert.equal(await w2.getByRole('tab',{name:/same\.md/}).count(),0,'failed transfer rolls destination back');
  assert.equal(await w2.locator('.source-editor textarea').inputValue(),draft,'failed transfer preserves target draft');
  await app.evaluate(({ipcMain})=>{ipcMain.removeAllListeners('tab:transfer-ack');for(const fn of globalThis.__omAck)ipcMain.on('tab:transfer-ack',fn);delete globalThis.__omAck;delete globalThis.__omRejected});
  console.log('PASS failed transfer rolls back without losing tabs or drafts');
  // Dragging the sole tab back onto the source should merge and retain the draft.
  const own=await w2.evaluate(()=>({x:window.screenX,y:window.screenY}));const target=await w.evaluate(()=>({x:window.screenX+180,y:window.screenY+20}));
  await w2.evaluate(()=>{window.__omPointerEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,e=>{window.__omPointerEvents.push({type:e.type,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,pointerId:e.pointerId,isTrusted:e.isTrusted,target:e.target?.className});if(window.__omPointerEvents.length>40)window.__omPointerEvents.shift()},true)});
  try{await drag(w2,w2.getByRole('tab',{name:/other\.md/}),target.x-own.x,target.y-own.y);await w.getByRole('tab',{name:/other\.md/}).waitFor({timeout:12000})}
  catch(error){const pages=[];for(const win of [w,w2])try{pages.push(await win.evaluate(()=>({events:window.__omPointerEvents,toast:document.querySelector('[role=status]')?.innerText||'',screen:{x:screenX,y:screenY,width:innerWidth,height:innerHeight},tabs:[...document.querySelectorAll('[role=tab]')].map(t=>t.innerText)})))}catch(e){pages.push({error:String(e)})}const main=await app.evaluate(({BrowserWindow})=>({transfer:globalThis.__omTransferDiagnostics,windows:BrowserWindow.getAllWindows().map(win=>({bounds:win.getBounds(),visible:win.isVisible()}))}));console.error('MERGE_DIAGNOSTICS',JSON.stringify({own,target,pages,main},null,2));throw error}
  await activate(w,'other.md');assert.equal(await w.locator('.source-editor textarea').inputValue(),draft,'merge retains draft');
  assert.equal((await fs.readFile(c,'utf8')).includes('待转移草稿'),false);console.log('PASS sole tab merges back without writing draft');
  for(const [file,name] of [[inlineMd,'inline.md'],[inlineHtml,'inline.html']]){
   // Clear focus from the previously transferred draft through a tab change; it must stay unsaved.
   await choose(w,file);await activate(w,name);const icon=w.getByRole('tab',{name:new RegExp(name.replace('.','\\.'))}).locator('img.file-icon');assert.equal(await icon.getAttribute('alt'),name.endsWith('.md')?'Markdown 文档':'HTML 网页');assert.equal(await icon.getAttribute('draggable'),'false');await w.getByRole('button',{name:/原位编辑/}).click();
   const frame=await(await w.locator('iframe[title="文档预览"]').elementHandle()).contentFrame();
   const paragraph=frame.locator('p').first();await paragraph.click();await paragraph.evaluate(e=>{e.textContent='未保存原位草稿';e.dispatchEvent(new Event('input',{bubbles:true}))});
   const created=app.waitForEvent('window',{timeout:12000});await drag(w,w.getByRole('tab',{name:new RegExp(name.replace('.','\\.'))}),1040,25);const incoming=await created;
   await incoming.getByRole('tab',{name:new RegExp(name.replace('.','\\.'))}).waitFor({timeout:12000});await installPointerCoordinates(incoming);
   const incomingFrame=await(await incoming.locator('iframe[title="文档预览"]').elementHandle()).contentFrame();
   assert.equal(await incomingFrame.locator('p').first().textContent(),'未保存原位草稿',`${name} transfer preserves inline draft`);
   assert.equal((await fs.readFile(file,'utf8')).includes('未保存原位草稿'),false,`${name} transfer does not write draft`);
   // The iframe can render restored text before the host receives its async
   // restoration acknowledgement. Wait until tab interaction is enabled.
   await incoming.waitForFunction(()=>!document.querySelector('.app')?.inert);
   // Keep windows side by side: macOS may clamp a new window to the screen,
   // causing the return path to cross its iframe instead of the tab strip.
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getFocusedWindow().setBounds({x:50,y:140,width:600,height:650}));
   const target=await w.evaluate(()=>({x:window.screenX+180,y:window.screenY+20})),own=await incoming.evaluate(()=>({x:window.screenX,y:window.screenY}));
   await drag(incoming,incoming.getByRole('tab',{name:new RegExp(name.replace('.','\\.'))}),target.x-own.x,target.y-own.y);
   await w.getByRole('tab',{name:new RegExp(name.replace('.','\\.'))}).waitFor({timeout:12000});
   console.log(`PASS ${name} inline draft transfers out and back`);
  }
  await choose(w,noteFile);await activate(w,'note.md');
  const noteFrame=await(await w.locator('iframe[title="文档预览"]').elementHandle()).contentFrame();
  await noteFrame.locator('p').first().evaluate(()=>{const n=document.querySelector('p').firstChild,r=document.createRange();r.setStart(n,3);r.setEnd(n,7);const selection=getSelection();selection.removeAllRanges();selection.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))});
  const notePopup=w.locator('.annotation-popover');await notePopup.waitFor();if(await notePopup.getByRole('button',{name:'自定义批注'}).isVisible())await notePopup.getByRole('button',{name:'自定义批注'}).click();await notePopup.getByPlaceholder('写下你的想法或修改建议…').fill('跨窗口未提交批注');
  const noteCreated=app.waitForEvent('window',{timeout:12000});await drag(w,w.getByRole('tab',{name:/note\.md/}),1040,25);const noteWindow=await noteCreated;
  await noteWindow.getByRole('tab',{name:/note\.md/}).waitFor({timeout:12000});await installPointerCoordinates(noteWindow);const incomingNote=noteWindow.locator('.annotation-popover');if(!(await incomingNote.isVisible()))await noteWindow.getByRole('button',{name:'未保存草稿'}).click();await incomingNote.waitFor();assert.equal(await incomingNote.getByPlaceholder('写下你的想法或修改建议…').inputValue(),'跨窗口未提交批注','detached annotation draft');
  assert.equal((await fs.readFile(noteFile,'utf8')).includes('跨窗口未提交批注'),false,'detaching does not save annotation draft');
  const noteTarget=await w.evaluate(()=>({x:window.screenX+180,y:window.screenY+20})),noteOwn=await noteWindow.evaluate(()=>({x:window.screenX,y:window.screenY}));
  await drag(noteWindow,noteWindow.getByRole('tab',{name:/note\.md/}),noteTarget.x-noteOwn.x,noteTarget.y-noteOwn.y);await w.getByRole('tab',{name:/note\.md/}).waitFor({timeout:12000});await activate(w,'note.md');
  if(!(await w.locator('.annotation-popover').isVisible()))await w.getByRole('button',{name:'未保存草稿'}).click();assert.equal(await w.locator('.annotation-popover').getByPlaceholder('写下你的想法或修改建议…').inputValue(),'跨窗口未提交批注','merged annotation draft');assert.equal((await fs.readFile(noteFile,'utf8')).includes('跨窗口未提交批注'),false);
  console.log('PASS annotation draft transfers out and back without saving');
 }finally{if(app)app.process().kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
})().catch(e=>{console.error(e);process.exitCode=1});
