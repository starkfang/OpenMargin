const {openSource}=require('./edit-helpers.cjs');
'use strict';
// Single-window checks; uses isolated temporary documents and an isolated profile.
const { _electron: electron } = require('playwright');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'openmargin-tab-session-'));
 const files=['source','note','inline','other'].map(n=>path.join(dir,n+'.md'));
 for(const f of files)await fs.writeFile(f,`# ${path.basename(f)}\n\n一段用于测试批注和原位编辑的文字。\n\n${Array.from({length:70},(_,i)=>`第 ${i} 段阅读位置。`).join('\n\n')}\n`);
 let app;
 try{
  const executablePath=process.env.OPENMARGIN_TEST_APP||require('electron');
  app=await electron.launch({executablePath,args:[...(process.env.OPENMARGIN_TEST_APP?[]:[root]),files[0],`--user-data-dir=${dir}/profile`]});
  const w=await app.firstWindow();
  const tab=n=>w.getByRole('tab',{name:new RegExp(n+'\\.md')});
  const active=async n=>w.waitForFunction(n=>[...document.querySelectorAll('[role="tab"]')].some(t=>t.textContent.includes(n+'.md')&&t.getAttribute('aria-selected')==='true'),n);
  const frame=async()=>await(await w.locator('iframe[title="文档预览"]').elementHandle()).contentFrame();
  await tab('source').waitFor();
  for(let i=1;i<files.length;i++){
   await app.evaluate(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]})},files[i]);
   await w.getByRole('button',{name:/打开文件/}).first().click();await tab(path.basename(files[i],'.md')).waitFor();await active(path.basename(files[i],'.md'));
  }
  await tab('source').click();await active('source');
  await (await frame()).evaluate(()=>scrollTo(0,500));await w.waitForTimeout(200);
  await openSource(w);const edit=w.locator('.source-editor textarea');const original=await edit.inputValue();await edit.fill(original+'\n保留源码草稿');
  await tab('note').click();await active('note');
  await tab('source').click();await active('source');await edit.waitFor();assert.equal(await edit.inputValue(),original+'\n保留源码草稿');
  assert.equal(await fs.readFile(files[0],'utf8'),original,'switching must not save draft');
  console.log('PASS source draft remains across tab switches');
  await tab('note').click();await active('note');
  const f=await frame();await f.locator('p').first().evaluate(()=>{const n=document.querySelector('p').firstChild,i=n.nodeValue.indexOf('用于测试批注'),r=document.createRange();r.setStart(n,i);r.setEnd(n,i+6);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))});
  const pop=w.locator('.annotation-popover');await pop.waitFor();if(await pop.getByRole('button',{name:'自定义批注'}).isVisible())await pop.getByRole('button',{name:'自定义批注'}).click();await pop.getByPlaceholder('写下你的想法或修改建议…').fill('未提交的批注');
  await tab('inline').click();await active('inline');
  await w.getByRole('button',{name:/原位编辑/}).click();
  const fi=await frame();await fi.locator('p').first().click();await fi.locator('p[contenteditable]').first().evaluate(e=>{e.textContent='原位编辑尚未保存';e.dispatchEvent(new Event('input',{bubbles:true}))});
  await tab('other').click();await active('other');
  await tab('inline').click();await active('inline');assert.equal(await (await frame()).locator('p').first().textContent(),'原位编辑尚未保存');
  await tab('note').click();await active('note');if(!(await pop.isVisible()))await w.getByRole('button',{name:'未保存草稿'}).click();await pop.waitFor();assert.equal(await pop.getByPlaceholder('写下你的想法或修改建议…').inputValue(),'未提交的批注');
  console.log('PASS annotation and in-place drafts remain across tab switches');
  await tab('source').click();await active('source');assert.equal(await edit.inputValue(),original+'\n保留源码草稿');
  assert.equal(await fs.readFile(files[1],'utf8').then(x=>x.includes('未提交的批注')),false);assert.equal(await fs.readFile(files[2],'utf8').then(x=>x.includes('原位编辑尚未保存')),false);
  console.log('PASS switch never writes unsaved drafts');
 }finally{if(app)app.process().kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
})().catch(e=>{console.error(e);process.exitCode=1});
