const {openSource}=require('./edit-helpers.cjs');
'use strict';
// The workspace is now tab based: each document belongs to one window. Cross-window
// moves and rollback are covered by tab-drag-regression.cjs; this test verifies
// reading position, tab drafts and filesystem changes in a single isolated window.
const {_electron:electron}=require('playwright'),path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-workspace-'));
 const a=path.join(dir,'a.md'),b=path.join(dir,'b.md');
 const long='# 文件甲\n\n'+Array.from({length:100},(_,i)=>`第 ${i} 段用于阅读位置测试。`).join('\n\n');
 await fs.writeFile(a,long);await fs.writeFile(b,'# 文件乙\n\n乙的正文。\n');let app;
 try{
  const packaged=process.env.OPENMARGIN_TEST_APP;
  app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),a,`--user-data-dir=${dir}/userdata`]});
  const w=await app.firstWindow();const tab=name=>w.getByRole('tab',{name:new RegExp(name+'\\.md')});
  const active=async name=>w.waitForFunction(name=>[...document.querySelectorAll('[role=tab]')].some(t=>t.textContent.includes(name+'.md')&&t.getAttribute('aria-selected')==='true'),name);
  await tab('a').waitFor();await w.locator('iframe').waitFor();await w.locator('iframe').evaluate(f=>f.contentWindow.scrollTo(0,500));await w.waitForTimeout(200);
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},b);
  await w.getByRole('button',{name:/打开文件/}).first().click();await tab('b').waitFor();await active('b');
  await tab('a').click();await active('a');await w.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.scrollY>=400,{timeout:4000});console.log('PASS 标签切换与阅读位置');
  await openSource(w);const editor=w.locator('.source-editor textarea'), original=await editor.inputValue(),draft=original+'草稿';await editor.fill(draft);
  await tab('b').click();await active('b');await tab('a').click();await active('a');await editor.waitFor();assert.equal(await editor.inputValue(),draft);assert.equal(await fs.readFile(a,'utf8'),long);console.log('PASS 标签切换保留未保存草稿');
  await w.getByRole('button',{name:'取消',exact:true}).click();await w.getByRole('alertdialog',{name:'确认操作'}).getByRole('button',{name:'确认'}).click();await w.locator('iframe').waitFor();
  await tab('b').click();await active('b');const changed=long+'\n外部原子替换后的新内容';await fs.writeFile(a+'.tmp',changed);await fs.rename(a+'.tmp',a);await w.waitForTimeout(600);
  await tab('a').click();await active('a');await w.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body?.textContent.includes('外部原子替换后的新内容'),null,{timeout:8000});console.log('PASS 后台标签切换加载原子替换后的文件');
  await openSource(w);const before=await editor.inputValue(),newDraft=before+'保留草稿';await editor.fill(newDraft);await fs.writeFile(a+'.tmp',before+'\n外部再次更新');await fs.rename(a+'.tmp',a);await w.locator('.external').waitFor({timeout:8000});assert.equal(await editor.inputValue(),newDraft);console.log('PASS 外部更新时保留未保存正文草稿');
  // Reload requires confirmation and cancellation must preserve the draft.
  const reload=w.getByTitle('重新加载文件和资源');await reload.click();await w.getByRole('alertdialog',{name:'确认操作'}).getByRole('button',{name:'取消'}).click();assert.equal(await editor.inputValue(),newDraft);
  await reload.click();await w.getByRole('alertdialog',{name:'确认操作'}).getByRole('button',{name:'确认'}).click();
  await w.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body?.textContent.includes('外部再次更新'),null,{timeout:8000});console.log('PASS 重载确认与磁盘读取');
  // If reading the target fails, confirming the reload must not destroy the draft.
  await openSource(w);const afterReload=await editor.inputValue(),failedDraft=afterReload+'读取失败时保留';await editor.fill(failedDraft);
  await fs.unlink(a);await reload.click();await w.getByRole('alertdialog',{name:'确认操作'}).getByRole('button',{name:'确认'}).click();await w.waitForTimeout(1000);assert.equal(await editor.inputValue(),failedDraft,'failed reload preserves draft');console.log('PASS 读取失败保留草稿');
  // Restore the underlying path, change it while its dirty tab is in background,
  // then return: it must report the conflict while retaining the edit.
  await tab('b').click();await active('b');await fs.writeFile(a,afterReload+'\n后台外部修改');await w.waitForTimeout(600);await tab('a').click();await active('a');await editor.waitFor();assert.equal(await editor.inputValue(),failedDraft);await w.locator('.external').waitFor({timeout:8000});console.log('PASS 后台脏标签保留草稿并提示外部修改');
  // Opening the same real path a second time must focus existing state, not replace it.
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},a);await w.getByRole('button',{name:/打开文件/}).first().click();await active('a');assert.equal(await editor.inputValue(),failedDraft);assert.equal(await tab('a').count(),1);console.log('PASS 重复打开同一路径保留草稿');
  // The external-change banner's refresh must have the same transactional safety.
  const banner=w.locator('.external'),bannerRefresh=banner.getByRole('button',{name:'刷新'});await fs.unlink(a);await bannerRefresh.click();await w.getByRole('alertdialog',{name:'确认操作'}).getByRole('button',{name:'确认'}).click();await w.waitForTimeout(1000);
  assert.equal(await editor.inputValue(),failedDraft,'banner refresh failure preserves draft');await banner.waitFor();
  const recovered=afterReload+'\n提示条刷新后的磁盘内容';await fs.writeFile(a,recovered);await bannerRefresh.click();await w.getByRole('alertdialog',{name:'确认操作'}).getByRole('button',{name:'确认'}).click();
  await w.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body?.textContent.includes('提示条刷新后的磁盘内容'),null,{timeout:8000});await banner.waitFor({state:'hidden'});assert.equal(await fs.readFile(a,'utf8'),recovered);console.log('PASS 外部变更提示条刷新成功且失败保留草稿');
 }finally{if(app)app.process().kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
})().catch(e=>{console.error(e);process.exitCode=1});
