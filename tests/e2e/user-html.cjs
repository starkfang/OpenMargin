'use strict';
const {waitForAnnotation}=require('./file-helpers.cjs');
const {_electron:electron}=require('playwright'),path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const root=path.resolve(__dirname,'../..');

// Independent watchdog reports a blocked Node event loop as well as a hung
// asynchronous cleanup. Its only side effect is stopping this test process.
const watchdog=new Worker(`
  const {parentPort,workerData}=require('node:worker_threads');
  const fs=require('node:fs');let phase='startup';
  parentPort.on('message',value=>{phase=value});
  setTimeout(()=>{fs.writeSync(2,'FATAL HTML test watchdog expired; phase: '+phase+'\\n');process.kill(process.pid)},workerData);
`,{eval:true,workerData:110000});
async function stage(name,task,timeout=15000){
  watchdog.postMessage(name);
  console.log(`START ${name}`);
  let timer;
  try{
    const result=await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>{
      const error=new Error(`Timeout during ${name} (${timeout}ms)`);
      console.error(`TIMEOUT ${name} (${timeout}ms)`);reject(error);
    },timeout)})]);
    console.log(`PASS ${name}`);
    return result;
  }catch(error){console.error(`FAIL ${name}: ${error.message}`);throw error}
  finally{clearTimeout(timer)}
}

(async()=>{
 let dir,app,failed=false;
 try{
  dir=await stage('创建临时目录',()=>fs.mkdtemp(path.join(os.tmpdir(),'om-product-html-')));
  const file=path.join(dir,'OpenMargin产品展示.html');
  await stage('复制演示 HTML',()=>fs.copyFile(path.join(root,'examples','OpenMargin产品展示.html'),file));
  const packaged=process.env.OPENMARGIN_TEST_APP;
  app=await stage('启动 Electron',()=>electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),file,`--user-data-dir=${dir}/data`],timeout:30000}),35000);
  const w=await stage('获取应用窗口',()=>app.firstWindow());
  // Instrument only the temporary test process, never document bytes or paths.
  app.on('console',message=>{const text=message.text();if(text.startsWith('SAVE_TRACE '))console.log(text)});
  w.on('pageerror',error=>console.error('RENDERER_ERROR',error.message));
  w.on('crash',()=>console.error('RENDERER_CRASH'));
  await stage('挂载保存诊断',()=>app.evaluate(({app,ipcMain,BrowserWindow})=>{
    const log=message=>console.log('SAVE_TRACE '+message);
    const handler=ipcMain._invokeHandlers?.get('document:save');
    if(!handler){log('IPC instrumentation unavailable');return}
    let active=false;
    try{
      const path=process.getBuiltinModule('path');
      const req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'));
      const store=req('./electron/storage.cjs');
      // Scope filesystem tracing to the save invocation and log operation names
      // and error codes only, never the paths or content of the document.
      const fs=req('node:fs/promises');
      for(const name of ['readFile','writeFile','stat','rename','unlink']){
        const original=fs[name];
        fs[name]=async function(...args){if(active)log('fs.'+name+' started');try{const result=await original.apply(this,args);if(active)log('fs.'+name+' completed');return result}catch(error){if(active)log('fs.'+name+' failed: '+(error.code||error.name));throw error}};
      }
      for(const name of ['readDocument','writeDocument']){
        const original=store[name];
        store[name]=async function(...args){if(active)log(name+' started');try{const result=await original.apply(this,args);if(active)log(name+' completed');return result}catch(error){if(active)log(name+' failed: '+(error.code||error.name));throw error}};
      }
      log('storage instrumentation installed');
    }catch(error){log('storage instrumentation unavailable: '+error.name)}
    ipcMain.removeHandler('document:save');
    ipcMain.handle('document:save',async(...args)=>{active=true;log('IPC started');try{const result=await handler(...args);log('IPC completed');return result}catch(error){log('IPC failed: '+(error.code||error.name));throw error}finally{active=false}});
    const win=BrowserWindow.getAllWindows()[0];win?.on('unresponsive',()=>log('window unresponsive'));win?.on('responsive',()=>log('window responsive'));
    log('IPC instrumentation installed');
  }));
  w.setDefaultTimeout(10000);const frame=w.frameLocator('iframe[title="文档预览"]');
  const heading=frame.getByRole('heading',{name:/内容，独立呈现/});
  await stage('加载实际 HTML 首页',()=>heading.waitFor());
  await stage('选择首屏标题',()=>heading.evaluate(el=>{
    const n=el.firstChild;if(!n||n.nodeType!==Node.TEXT_NODE||!n.nodeValue.includes('内容，独立呈现'))throw Error('sample heading text not found');
    const r=document.createRange();r.selectNodeContents(n);const s=document.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  }));
  const pop=w.locator('.annotation-popover');
  await stage('等待选区工具条',()=>pop.waitFor());
  await stage('打开批注输入',()=>pop.getByRole('button',{name:'自定义批注'}).click());
  await stage('填写批注',()=>pop.getByPlaceholder('写下你的想法或修改建议…').fill('演示页面批注：请补充可衡量的目标。'));
  await stage('暂存批注',()=>pop.getByRole('button',{name:'添加批注'}).click());
  await stage('等待批注浮窗关闭',()=>pop.waitFor({state:'hidden'}));
  await stage('点击保存按钮',()=>w.getByRole('button',{name:'保存',exact:true}).click());
  await stage('读取磁盘批注并验证',async()=>{
    const saved=await waitForAnnotation(file,'html','演示页面批注：请补充可衡量的目标。');
    assert.ok(saved,'annotation persisted in HTML review block');
  });
  // Saving HTML reloads its isolated preview; reacquire locators in the new frame.
  await stage('重新加载 HTML 预览',()=>frame.getByRole('heading',{name:/内容，独立呈现/}).waitFor());
  await stage('切换场景',async()=>{
    const tab=frame.getByRole('tab',{name:'需求评审'});await tab.click();assert.equal(await tab.getAttribute('aria-selected'),'true');assert.equal(await frame.locator('#scene-1').isVisible(),true);
  });
  await stage('页面按钮交互',async()=>{await frame.locator('#demo-toggle').click();assert.equal(await frame.locator('#demo-result').isVisible(),true)});
  await stage('验证内嵌图片',async()=>assert.equal(await frame.locator('.evidence img').evaluate(img=>img.complete&&img.naturalWidth>0),true));
  console.log('PASS 产品展示 HTML 交互、内嵌图片及批注持久化');
 }catch(error){
  // Log before cleanup, otherwise a blocked close or rm hides the real error.
  failed=true;console.error('HTML_TEST_ERROR',error.stack||String(error));
 }finally{
  if(app){
    try{await stage('关闭 Electron',()=>app.close(),5000)}
    catch{failed=true;console.error('CLEANUP forced Electron termination');app.process().kill()}
  }
  if(dir){try{await stage('删除临时目录',()=>fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100}),8000)}catch{failed=true}}
  await watchdog.terminate();
 }
 // A failed Playwright request or filesystem operation may still retain handles
 // after its timeout. Do not let those handles hang the CI job indefinitely.
 if(failed)process.exit(1);
})().catch(e=>{console.error('HTML_TEST_FATAL',e.stack||String(e));process.exit(1)});
