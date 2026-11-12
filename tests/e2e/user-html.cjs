'use strict';
const {waitForText}=require('./file-helpers.cjs');
const {_electron:electron}=require('playwright'),path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-product-html-'));
 const file=path.join(dir,'OpenMargin产品展示.html');
 await fs.copyFile(path.join(root,'examples','OpenMargin产品展示.html'),file);
 let app;
 try{
  const packaged=process.env.OPENMARGIN_TEST_APP;
  app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),file,`--user-data-dir=${dir}/data`],timeout:30000});
  const w=await app.firstWindow();w.setDefaultTimeout(20000);const frame=w.frameLocator('iframe[title="文档预览"]');
  await frame.getByRole('heading',{name:/内容，独立呈现/}).waitFor();
  const tab=frame.getByRole('tab',{name:'需求评审'});await tab.click();assert.equal(await tab.getAttribute('aria-selected'),'true');assert.equal(await frame.locator('#scene-1').isVisible(),true);
  await frame.locator('#demo-toggle').click();assert.equal(await frame.locator('#demo-result').isVisible(),true);
  assert.equal(await frame.locator('.evidence img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  console.log('PASS 产品展示 HTML 场景切换、按钮交互与内嵌图片');
  await frame.locator('.review-line').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await w.waitForTimeout(700);
  await frame.locator('.review-line').evaluate(el=>{const n=el.firstChild,r=document.createRange();r.selectNodeContents(n);const s=document.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
  const pop=w.locator('.annotation-popover');await pop.waitFor();await pop.getByRole('button',{name:'自定义批注'}).click();
  await pop.getByPlaceholder('写下你的想法或修改建议…').fill('演示页面批注：请补充可衡量的目标。');await pop.getByRole('button',{name:'添加批注'}).click();await pop.waitFor({state:'hidden'});
  await w.getByRole('button',{name:'保存',exact:true}).click();assert.match(await waitForText(file,'演示页面批注：请补充可衡量的目标。'),/OPENMARGIN:REVIEW:START/);
  console.log('PASS 产品展示 HTML 批注写入临时副本');
 }finally{if(app){let timer;try{await Promise.race([app.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Electron close timed out')),5000)})])}catch{app.process().kill('SIGKILL')}finally{clearTimeout(timer)}}await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
})().catch(e=>{console.error(e);process.exitCode=1});
