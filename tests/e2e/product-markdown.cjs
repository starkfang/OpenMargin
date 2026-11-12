'use strict';
const {waitForAnnotation}=require('./file-helpers.cjs');
const {_electron:electron}=require('playwright'),path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-product-md-'));const file=path.join(dir,'产品介绍与功能指南.md');
 await fs.copyFile(path.join(root,'docs','产品介绍与功能指南.md'),file);await fs.cp(path.join(root,'docs','images'),path.join(dir,'images'),{recursive:true});
 let app;
 try{
  const packaged=process.env.OPENMARGIN_TEST_APP;
  app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),file,`--user-data-dir=${dir}/data`],timeout:30000});
  const w=await app.firstWindow();w.setDefaultTimeout(20000);const frame=w.frameLocator('iframe[title="文档预览"]');
  await frame.getByRole('heading',{name:'OpenMargin · 让内容独立呈现，让反馈准确回流',exact:true}).waitFor();
  await w.locator('.outline').getByRole('button',{name:/01 · AI 生成之后/}).waitFor();
  const img=frame.locator('img').first();await img.evaluate(e=>new Promise((resolve,reject)=>{if(e.complete)return e.naturalWidth?resolve():reject(Error('image failed: '+e.src));e.onload=resolve;e.onerror=()=>reject(Error('image failed: '+e.src))}));
  assert.ok(await img.evaluate(e=>e.naturalWidth>0));
  await w.getByPlaceholder('搜索正文').fill('独立呈现');await w.getByLabel('搜索结果').waitFor();
  await w.getByPlaceholder('搜索正文').fill('');const selected=frame.getByText('一次原本很直接的评审',{exact:false}).first();await selected.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await w.waitForTimeout(700);await selected.evaluate(el=>{const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode())if(n.nodeValue.includes('一次原本很直接的评审')){const i=n.nodeValue.indexOf('一次原本很直接的评审'),r=document.createRange();r.setStart(n,i);r.setEnd(n,i+'一次原本很直接的评审'.length);const s=document.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return}throw Error('sample selection not found')});
  const pop=w.locator('.annotation-popover');await pop.waitFor();if(await pop.getByRole('button',{name:'自定义批注'}).isVisible())await pop.getByRole('button',{name:'自定义批注'}).click();await pop.getByPlaceholder('写下你的想法或修改建议…').fill('演示评审：补充展示到修改的工作流程。');await pop.getByRole('button',{name:'添加批注'}).click();await pop.waitFor({state:'hidden'});await w.getByRole('button',{name:'保存',exact:true}).click();await waitForAnnotation(file,'md','演示评审：补充展示到修改的工作流程。');
  console.log('PASS 产品介绍 Markdown 大纲、搜索、相对图片与批注持久化');
 }finally{if(app){let timer;try{await Promise.race([app.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Electron close timed out')),5000)})])}catch{app.process().kill('SIGKILL')}finally{clearTimeout(timer)}}await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
})().catch(e=>{console.error(e);process.exitCode=1});
