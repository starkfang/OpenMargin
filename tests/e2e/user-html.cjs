'use strict';
const {waitForAnnotation}=require('./file-helpers.cjs');
const {_electron:electron}=require('playwright'),path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');

// A renderer or an IPC request can stop responding without Playwright's locator
// timeout firing. Bound each phase separately so CI reports where it stalled.
async function stage(name,task,timeout=20000){
  console.log(`START ${name}`);
  let timer;
  try{
    const result=await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Timeout during ${name} (${timeout}ms)`)),timeout)})]);
    console.log(`PASS ${name}`);
    return result;
  }finally{clearTimeout(timer)}
}

(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-product-html-'));
 const file=path.join(dir,'OpenMargin产品展示.html');
 await fs.copyFile(path.join(root,'examples','OpenMargin产品展示.html'),file);
 let app;
 try{
  const packaged=process.env.OPENMARGIN_TEST_APP;
  app=await stage('启动 Electron',()=>electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),file,`--user-data-dir=${dir}/data`],timeout:30000}),35000);
  const w=await stage('获取应用窗口',()=>app.firstWindow());
  w.setDefaultTimeout(15000);const frame=w.frameLocator('iframe[title="文档预览"]');
  const heading=frame.getByRole('heading',{name:/内容，独立呈现/});
  await stage('加载实际 HTML 首页',()=>heading.waitFor());
  await stage('选择首屏标题',()=>heading.evaluate(el=>{
    const n=el.firstChild;if(!n||n.nodeType!==Node.TEXT_NODE||!n.nodeValue.includes('内容，独立呈现'))throw Error('sample heading text not found');
    const r=document.createRange();r.selectNodeContents(n);const s=document.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  }));
  const pop=w.locator('.annotation-popover');
  await stage('添加 HTML 划词批注',async()=>{
    await pop.waitFor();await pop.getByRole('button',{name:'自定义批注'}).click();
    await pop.getByPlaceholder('写下你的想法或修改建议…').fill('演示页面批注：请补充可衡量的目标。');
    await pop.getByRole('button',{name:'添加批注'}).click();await pop.waitFor({state:'hidden'});
  });
  await stage('保存并验证 HTML 文件批注',async()=>{
    await w.getByRole('button',{name:'保存',exact:true}).click();
    const saved=await waitForAnnotation(file,'html','演示页面批注：请补充可衡量的目标。');
    assert.ok(saved,'annotation persisted in HTML review block');
  });
  // Saving HTML reloads its isolated preview; reacquire locators in the new frame.
  await stage('交互与内嵌图片',async()=>{
    await frame.getByRole('heading',{name:/内容，独立呈现/}).waitFor();
    const tab=frame.getByRole('tab',{name:'需求评审'});await tab.click();assert.equal(await tab.getAttribute('aria-selected'),'true');assert.equal(await frame.locator('#scene-1').isVisible(),true);
    await frame.locator('#demo-toggle').click();assert.equal(await frame.locator('#demo-result').isVisible(),true);
    assert.equal(await frame.locator('.evidence img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  },30000);
  console.log('PASS 产品展示 HTML 交互、内嵌图片及批注持久化');
 }finally{
  if(app){let timer;try{await Promise.race([app.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Electron close timed out')),5000)})])}catch{app.process().kill()}finally{clearTimeout(timer)}}
  await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
