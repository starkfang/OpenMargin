'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-element-anchor-'));let app;try{
 for(const type of ['md','html']){
  const file=path.join(dir,'sample.'+type), text='重复的选中文字';
  await fs.writeFile(file,type==='md'?`# 标题\n\n${text}\n\n中间段落\n\n${text}\n`:`<!doctype html><html><body><h1>标题</h1><p>${text}</p><p>中间段落</p><p>${text}</p></body></html>`);
  app=await electron.launch({executablePath:require('electron'),args:[root,file,`--user-data-dir=${dir}/profile-${type}`]});const w=await app.firstWindow();const frame=w.frameLocator('iframe[title="文档预览"]');await frame.locator('p').nth(2).waitFor();
  await frame.locator('p').nth(2).evaluate(p=>{const r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))});
  await w.getByRole('button',{name:'建议删除'}).click();await w.getByText('已添加删除建议，请保存文件').waitFor();
  await frame.locator('p').nth(2).locator('[data-om-mark]').waitFor({timeout:4000});assert.equal(await frame.locator('p').nth(0).locator('[data-om-mark]').count(),0,'identical earlier text must not be marked');
  await w.getByRole('button',{name:'保存',exact:true}).click();await w.waitForTimeout(300);await app.close();app=null;
  app=await electron.launch({executablePath:require('electron'),args:[root,file,`--user-data-dir=${dir}/profile-reopen-${type}`]});const w2=await app.firstWindow(), f2=w2.frameLocator('iframe[title="文档预览"]');await f2.locator('p').nth(2).locator('[data-om-mark]').waitFor({timeout:4000});assert.equal(await f2.locator('p').nth(0).locator('[data-om-mark]').count(),0);console.log(`PASS ${type} 元素边界重复文本批注可精确定位并重载`);await app.close();app=null;
 }
 }finally{if(app)app.process().kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}})().catch(e=>{console.error(e);process.exitCode=1});
