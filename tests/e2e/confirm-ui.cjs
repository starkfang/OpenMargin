const {openSource}=require('./edit-helpers.cjs');
'use strict';
// Switching tabs retains drafts; destructive tab/window closing still asks first.
const {_electron:electron}=require('playwright'),path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-confirm-')),a=path.join(dir,'a.md'),b=path.join(dir,'b.md');
 await fs.writeFile(a,'# 文件甲\n\n正文。');await fs.writeFile(b,'# 文件乙\n\n正文。');let app;
 try{
  const packaged=process.env.OPENMARGIN_TEST_APP;
  app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),a,`--user-data-dir=${dir}/data`]});
  const w=await app.firstWindow();const modal=w.getByRole('alertdialog',{name:'确认操作'}),ta=w.getByRole('tab',{name:/a\.md/}),tb=w.getByRole('tab',{name:/b\.md/});
  const active=async n=>w.waitForFunction(n=>[...document.querySelectorAll('[role=tab]')].some(t=>t.textContent.includes(n+'.md')&&t.getAttribute('aria-selected')==='true'),n);
  await w.locator('iframe').waitFor();await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]})},b);
  await w.getByRole('button',{name:'打开文件',exact:false}).first().click();await tb.waitFor();await active('b');await ta.click();await active('a');
  await openSource(w);const editor=w.locator('.source-editor textarea'),original=await editor.inputValue(),draft=original+'草稿';await editor.fill(draft);
  const closeA=ta.getByRole('button',{name:'关闭 a.md'});await closeA.click();await modal.waitFor();
  assert.equal(await modal.getByRole('button',{name:'取消'}).evaluate(e=>e===document.activeElement),true,'cancel has initial focus');
  await w.keyboard.press('Tab');assert.equal(await modal.getByRole('button',{name:'确认'}).evaluate(e=>e===document.activeElement),true,'focus moves within the confirmation');
  await w.keyboard.press('Tab');assert.equal(await modal.getByRole('button',{name:'取消'}).evaluate(e=>e===document.activeElement),true,'focus stays trapped in the confirmation');
  await w.keyboard.press('Escape');await modal.waitFor({state:'hidden'});await w.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='关闭 a.md');assert.equal(await editor.inputValue(),draft);assert.equal(await ta.count(),1);console.log('PASS 关闭草稿标签时焦点受限、Esc 保留草稿并恢复焦点');
  await closeA.click();await modal.waitFor();await modal.getByRole('button',{name:'确认'}).click();await ta.waitFor({state:'detached'});await active('b');assert.equal(await fs.readFile(a,'utf8'),'# 文件甲\n\n正文。');console.log('PASS 确认后关闭标签且草稿未写入');
  await openSource(w);await editor.fill('关闭前草稿');await editor.evaluate(el=>el.blur());
  const beforeClose=await editor.inputValue();assert.equal(beforeClose,'关闭前草稿','test fixture is intact before closing');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await modal.waitFor();await modal.getByRole('button',{name:'取消'}).click();await modal.waitFor({state:'hidden'});assert.equal(await editor.inputValue(),beforeClose,'cancel preserves the exact draft present before closing');console.log('PASS 取消关闭窗口后保留草稿');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await modal.waitFor();const closed=w.waitForEvent('close');await modal.getByRole('button',{name:'确认'}).click();await closed;assert.equal(await fs.readFile(b,'utf8'),'# 文件乙\n\n正文。');console.log('PASS 确认后关闭窗口且草稿未写入');
 }finally{if(app)await app.evaluate(({app})=>app.exit()).catch(()=>{});await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
})().catch(e=>{console.error(e);process.exitCode=1});
