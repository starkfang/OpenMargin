'use strict';
const {waitForText}=require('./file-helpers.cjs');
// One isolated Electron window, temporary documents and profile. Run after npm run build.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-edit-picker-'));
 const md=path.join(dir,'doc.md'),other=path.join(dir,'other.md'),html=path.join(dir,'page.html');
 await fs.writeFile(md,'# 标题\n\n可编辑的正文。\n');await fs.writeFile(other,'# 另一份\n');
 await fs.writeFile(html,'<!doctype html><html><body><h1>静态标题</h1><p id="dynamic"></p><script>document.getElementById("dynamic").textContent="动态内容"</script></body></html>');
 let app,w;const diagnostics=[];
 try{
  const packaged=process.env.OPENMARGIN_TEST_APP;
  app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),md,`--user-data-dir=${dir}/profile`]});
  w=await app.firstWindow();w.on('pageerror',e=>diagnostics.push('pageerror: '+e.stack));w.on('console',m=>{if(m.type()==='error')diagnostics.push('console error: '+m.text())});assert.equal(app.windows().length,1);
  const main=name=>w.getByRole('button',{name,exact:true}),choice=()=>main('选择编辑方式');
  const pick=async name=>{await choice().click();await w.getByRole('menuitemradio',{name,exact:true}).click()};
  const modal=w.getByRole('alertdialog',{name:'确认操作'}),editor=w.locator('.source-editor textarea');
  const frame=()=>w.frameLocator('iframe[title="文档预览"]');
  const chooseFile=async file=>{await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]})},file);await w.getByRole('button',{name:/打开文件/}).first().click();await w.getByRole('tab',{name:new RegExp(path.basename(file).replace('.','\\.'))}).waitFor()};
  await w.getByRole('tab',{name:/doc\.md/}).waitFor();await frame().getByText('可编辑的正文。').waitFor();
  assert.equal(await editor.count(),0,'reading is default');await main('原位编辑').waitFor();
  await main('原位编辑').click();await main('退出原位编辑').waitFor();await main('退出原位编辑').click();
  assert.equal(await editor.count(),0);console.log('PASS 阅读默认状态与原位编辑进入退出');
  await pick('源码编辑');await main('源码编辑').click();await editor.waitFor();const original=await editor.inputValue();await editor.fill(original+'未保存源码');
  await pick('原位编辑');await modal.waitFor();await modal.getByRole('button',{name:'取消'}).click();await modal.waitFor({state:'hidden'});assert.equal(await editor.inputValue(),original+'未保存源码');
  await pick('原位编辑');await modal.waitFor();await modal.getByRole('button',{name:'确认'}).click();await main('退出原位编辑').waitFor();assert.equal((await fs.readFile(md,'utf8')).includes('未保存源码'),false);
  const paragraph=frame().locator('p').first();await paragraph.click();await paragraph.fill('已修改正文。');await main('保存').click();assert.match(await waitForText(md,'已修改正文'),/已修改正文/);
  console.log('PASS 切换确认与 Markdown 原位保存');
  await main('退出原位编辑').click();await pick('源码编辑');await main('源码编辑').click();const saved=await editor.inputValue();await editor.fill(saved+'跨标签草稿');await chooseFile(other);await w.getByRole('tab',{name:/doc\.md/}).click();await editor.waitFor();assert.equal(await editor.inputValue(),saved+'跨标签草稿');assert.doesNotMatch(await fs.readFile(md,'utf8'),/跨标签草稿/);console.log('PASS 切换文件保留未保存草稿');
  await chooseFile(html);await frame().getByText('动态内容').waitFor();assert.equal(await editor.count(),0,'new document defaults to reading');
  // The root element has no parentElement: observed page-owned changes to it
  // must not throw while filtering OpenMargin overlays.
  await frame().locator('html').evaluate(el=>el.classList.add('page-layout-change'));await w.waitForTimeout(200);
  assert.doesNotMatch(diagnostics.join('\n'),/Cannot read properties of null \(reading ['"]nodeType['"]\)/,'根元素的页面样式变化不应使 HTML 观察器报错');
  if(!(await main('原位编辑').isVisible()))await pick('原位编辑');await main('原位编辑').click();await frame().locator('h1').click();await frame().locator('h1').fill('更新标题');const beforeSaveFrame=await w.locator('iframe[title="文档预览"]').elementHandle();await main('保存').click();assert.equal(await w.getByRole('alertdialog').count(),0,'原位保存无需逐处确认');assert.match(await waitForText(html,'更新标题'),/更新标题/);
  // File bytes are committed before the renderer replaces the old HTML iframe.
  // Wait for that replacement and the save transition before interacting with
  // the dynamically generated text in the refreshed document.
  await beforeSaveFrame.waitForElementState('hidden');await w.waitForFunction(()=>!document.querySelector('.app')?.inert);
  await frame().getByText('动态内容').waitFor();await frame().locator('#dynamic').click();await frame().locator('#dynamic').fill('错误写入');await main('保存').click();assert.equal(await w.getByRole('alertdialog').count(),0,'原位保存无需逐处确认');await w.getByText('此处内容与源文件不一致或含复杂格式，请使用批注或源码编辑。').first().waitFor();assert.doesNotMatch(await fs.readFile(html,'utf8'),/错误写入/);
  console.log('PASS HTML 静态保存与动态内容拒绝写回');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(850,600));await choice().focus();await w.keyboard.press('Enter');const sourceChoice=w.getByRole('menuitemradio',{name:'源码编辑'});await sourceChoice.waitFor();await w.keyboard.press('ArrowDown');assert.equal(await w.getByRole('menu').evaluate(e=>e.contains(document.activeElement)),true,'keyboard focus stays inside the open menu');await w.keyboard.press('Escape');await w.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='选择编辑方式');assert.equal(await sourceChoice.count(),0,'Escape closes the menu');console.log('PASS 窄窗口编辑菜单键盘操作及焦点恢复');
 }catch(error){if(w){console.error('EDIT_PICKER_DIAGNOSTICS',JSON.stringify({body:await w.locator('body').innerText().catch(()=>'<unavailable>'),tabs:await w.locator('[role=tab]').allTextContents().catch(()=>[]),dialogs:await w.locator('[role=dialog]').allTextContents().catch(()=>[]),errors:diagnostics},null,2))}throw error}finally{if(app)app.process().kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
})().catch(e=>{console.error(e);process.exitCode=1});
