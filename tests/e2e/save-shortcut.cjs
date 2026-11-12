'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const {openSource}=require('./edit-helpers.cjs'),root=path.resolve(__dirname,'../..');
const watchdog=new Worker(`
 const {parentPort,workerData}=require('node:worker_threads');const fs=require('node:fs');let phase='startup';
 parentPort.on('message',value=>{phase=value});
 setTimeout(()=>{fs.writeSync(2,'FATAL shortcut test watchdog expired; phase: '+phase+'\\n');process.kill(process.pid)},workerData);
`,{eval:true,workerData:110000});
async function stage(name,task,timeout=15000){
 watchdog.postMessage(name);console.log(`START ${name}`);let timer;
 try{const result=await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>{console.error(`TIMEOUT ${name} (${timeout}ms)`);reject(new Error(`Timeout during ${name} (${timeout}ms)`))},timeout)})]);console.log(`PASS ${name}`);return result}
 catch(error){console.error(`FAIL ${name}: ${error.message}`);throw error}finally{clearTimeout(timer)}
}
(async()=>{let dir,app,failed=false;try{
 dir=await stage('创建快捷键测试目录',()=>fs.mkdtemp(path.join(os.tmpdir(),'om-shortcut-')));
 const file=path.join(dir,'source.md'),copy=path.join(dir,'copy.md'),previewCopy=path.join(dir,'preview-copy.md');await stage('准备 Markdown',()=>fs.writeFile(file,'# 标题\n\n## 章节\n\n正文\n'));
 app=await stage('启动 Electron',()=>electron.launch({executablePath:process.env.OPENMARGIN_TEST_APP||require('electron'),args:[...(process.env.OPENMARGIN_TEST_APP?[]:[root]),file,`--user-data-dir=${dir}/profile`],timeout:30000}),35000);
 const w=await stage('获取窗口',()=>app.firstWindow());w.setDefaultTimeout(10000);
 const menu=await stage('检查菜单',()=>app.evaluate(({BrowserWindow,Menu})=>{const win=BrowserWindow.getAllWindows()[0];return {platform:process.platform,autoHide:win.isMenuBarAutoHide(),visible:win.isMenuBarVisible(),hasMenu:!!Menu.getApplicationMenu()}}));
 if(menu.platform!=='darwin'){assert.equal(menu.autoHide,true,'Windows/Linux menu bar auto hides');assert.equal(menu.visible,false,'menu bar is initially hidden');assert.equal(menu.hasMenu,true,'native menu remains available for keyboard accelerators');if(menu.platform==='win32'){assert.equal(await w.locator('.topbar').evaluate(el=>getComputedStyle(el).paddingLeft),'8px','Windows tab controls start at the left');assert.equal(await w.getByRole('button',{name:'保存',exact:true}).getAttribute('title'),'保存（Ctrl+S）');assert.equal(await w.getByRole('button',{name:'另存为',exact:true}).getAttribute('title'),'另存为（Ctrl+Shift+S）')}}
 else assert.equal(menu.hasMenu,true,'macOS retains the native application menu');
 console.log('PASS platform menu visibility preserves native menu');
 await stage('监听原生键盘事件',()=>app.evaluate(({BrowserWindow})=>{const wc=BrowserWindow.getAllWindows()[0].webContents;globalThis.__testInputs=[];wc.on('before-input-event',(_event,input)=>globalThis.__testInputs.push({type:input.type,key:input.key,meta:input.meta,control:input.control,shift:input.shift}))}));
 async function send(key,shortcut=false,shift=false){const events=await app.evaluate(({BrowserWindow},args)=>{const wc=BrowserWindow.getAllWindows()[0].webContents,modifier=process.platform==='darwin'?'meta':'control',modifiers=args.shortcut?[modifier,...(args.shift?['shift']:[])]:[];globalThis.__testInputs=[];wc.sendInputEvent({type:'keyDown',keyCode:args.key,modifiers});if(!args.shortcut)wc.sendInputEvent({type:'char',keyCode:args.key.toLowerCase()});wc.sendInputEvent({type:'keyUp',keyCode:args.key,modifiers});return globalThis.__testInputs},{key,shortcut,shift});assert.ok(events.some(e=>e.type==='keyDown'&&e.key.toLowerCase()===key.toLowerCase()&&!!(e.meta||e.control)===shortcut&&!!e.shift===shift),`before-input-event did not observe ${key}: ${JSON.stringify(events)}`)}
 await stage('加载文档大纲',()=>w.locator('.outline-title').first().waitFor());
 await stage('打开源码编辑',()=>openSource(w));const editor=w.locator('.source-editor textarea');
 await stage('输入正文并验证',async()=>{await editor.fill('# 标题\n\n更改');await editor.focus();await editor.press('End');await send('X');await w.waitForFunction(()=>document.querySelector('textarea')?.value.endsWith('x'));assert.match(await editor.inputValue(),/更改x$/,'ordinary typing still reaches editor')});
 await stage('源码快捷键保存',async()=>{await send('S',true);await editor.waitFor({state:'hidden'});assert.match(await fs.readFile(file,'utf8'),/更改x/)});
 await stage('准备源码另存为',async()=>{await openSource(w);await editor.fill('# 标题\n\n另存为源码');await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target})},copy)});
 await stage('源码快捷键另存为',async()=>{await send('S',true,true);await w.getByRole('tab',{name:/copy\.md/}).waitFor();assert.match(await fs.readFile(copy,'utf8'),/另存为源码/)});
 const dialog=w.getByRole('alertdialog',{name:'确认操作'});
 await stage('返回原文预览',async()=>{await w.getByRole('tab',{name:/source\.md/}).click();const back=w.getByRole('button',{name:'返回阅读',exact:true});if(await back.isVisible())await back.click();if(await dialog.isVisible())await dialog.getByRole('button',{name:'确认',exact:true}).click();await w.frameLocator('iframe[title="文档预览"]').locator('h1').waitFor()});
 await stage('删除章节并聚焦预览',async()=>{await w.locator('.outline-title').first().click({button:'right'});await w.getByRole('menuitem',{name:'删除章节'}).click();await dialog.getByRole('button',{name:'确认',exact:true}).click();await w.waitForFunction(()=>!!document.querySelector('.tab-dirty'));await w.frameLocator('iframe[title="文档预览"]').locator('body').click({position:{x:5,y:5}});assert.equal(await w.evaluate(()=>document.activeElement?.getAttribute('title')),'文档预览','keyboard focus is in preview iframe')});
 await stage('预览快捷键保存',async()=>{await send('S',true);await w.waitForFunction(()=>!document.querySelector('.tab-dirty'));assert.equal(await fs.readFile(file,'utf8'),'')});
 await stage('预览快捷键另存为',async()=>{await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target})},previewCopy);await w.frameLocator('iframe[title="文档预览"]').locator('body').click({position:{x:5,y:5}});assert.equal(await w.evaluate(()=>document.activeElement?.getAttribute('title')),'文档预览','keyboard focus is in preview iframe');await send('S',true,true);await w.getByRole('tab',{name:/preview-copy\.md/}).waitFor();assert.equal(await fs.readFile(previewCopy,'utf8'),'')});
 console.log('PASS Electron 原生事件：源码普通输入、保存和另存为；预览 iframe 保存和另存为');
 }catch(error){failed=true;console.error('SHORTCUT_TEST_ERROR',error.stack||String(error))}finally{
  if(app){try{await stage('关闭 Electron',()=>app.close(),5000)}catch{failed=true;console.error('CLEANUP forced Electron termination');app.process().kill()}}
  if(dir){try{await stage('删除临时目录',()=>fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100}),8000)}catch{failed=true}}
  await watchdog.terminate();
 }
 if(failed)process.exit(1);
})().catch(e=>{console.error('SHORTCUT_TEST_FATAL',e.stack||String(e));process.exit(1)});
