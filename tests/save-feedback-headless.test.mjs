import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

test('正文与另存为成功或记录失败时反馈和草稿状态准确',async()=>{
 const cacheDir=await mkdtemp(path.join(os.tmpdir(),'om-save-feedback-'));let server,browser;
 try{
  server=await createServer({configFile:false,cacheDir,optimizeDeps:{entries:['tests/save-feedback-fixture.js']},server:{port:0,watch:{ignored:['**/release/**','**/*.app/**']}},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/__save_feedback',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/tests/save-feedback-fixture.js"></script>')})}}]});await server.listen();
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
  for(const mode of ['source','inline','saveAs'])for(const fail of [false,true]){
   const page=await browser.newPage();page.setDefaultTimeout(30000);await page.goto(server.resolvedUrls.local[0]+'__save_feedback',{waitUntil:'domcontentloaded',timeout:30000});await page.evaluate(f=>window.mockHistoryError=f,fail);await page.getByRole('button',{name:'打开本地文件'}).click();const toolbar=page.locator('.toolbar'),frame=page.frameLocator('iframe[title="文档预览"]');await frame.locator('p').first().waitFor();
   if(mode==='inline'){
    await toolbar.getByRole('button',{name:'原位编辑',exact:true}).click();const p=frame.locator('p').first();await p.click();await p.fill('修改后的正文');
   }else{
    await toolbar.getByRole('button',{name:'选择编辑方式'}).click();await page.getByRole('menuitemradio',{name:'源码编辑'}).click();await toolbar.getByRole('button',{name:'源码编辑',exact:true}).click();const source=page.locator('.source-editor textarea');await source.waitFor();await source.fill('# 保存反馈\n\n修改后的正文。\n');
   }
   const save=toolbar.getByRole('button',{name:mode==='saveAs'?'另存为':'保存',exact:true});await save.click();await page.waitForFunction(()=>window.saveCalls.length===1);
   const call=await page.evaluate(()=>window.saveCalls[0]);assert.equal(call.kind,mode==='saveAs'?'saveAs':'save');assert.match(call.content,/修改后的正文/,'提交实际正文');
   const expected=mode==='saveAs'?(fail?'已另存为，但修改记录保存失败':'已另存为'):(fail?'正文已保存，但修改记录保存失败':mode==='inline'?'正文已保存':'已保存');await page.getByRole('status').getByText(expected,{exact:true}).waitFor();
   if(mode==='inline'){
    await toolbar.getByRole('button',{name:'退出原位编辑',exact:true}).click();await toolbar.getByRole('button',{name:'原位编辑',exact:true}).waitFor();assert.equal(await page.getByRole('alertdialog').count(),0,'成功写正文后无未保存草稿');
   }else if(mode==='source'){
    await toolbar.getByRole('button',{name:'源码编辑',exact:true}).waitFor();assert.equal(await page.getByRole('alertdialog').count(),0,'源码保存后退出编辑');
   }else{
    await page.getByRole('tab',{name:/copy\.md/}).waitFor();assert.match(await page.locator('.source-editor textarea').inputValue(),/修改后的正文/);await toolbar.getByRole('button',{name:'返回阅读',exact:true}).click();assert.equal(await page.getByRole('alertdialog').count(),0,'另存目标无未保存草稿');
   }
   await toolbar.getByRole('button',{name:'保存',exact:true}).waitFor();assert.equal(await toolbar.getByRole('button',{name:'保存',exact:true}).isDisabled(),true,'干净文档的保存按钮恢复禁用');if(mode==='inline'){await toolbar.getByRole('button',{name:'原位编辑',exact:true}).click();const p=frame.locator('p').first();await p.click();await p.fill('后续修改');}else{await toolbar.getByRole('button',{name:'源码编辑',exact:true}).click();await page.locator('.source-editor textarea').fill('# 后续修改\n');}await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='保存');return b&&!b.disabled});assert.equal(await toolbar.getByRole('button',{name:'保存',exact:true}).isEnabled(),true,'后续修改后可再次保存');await page.close();
  }
  const page=await browser.newPage();page.setDefaultTimeout(30000);await page.goto(server.resolvedUrls.local[0]+'__save_feedback',{waitUntil:'domcontentloaded',timeout:30000});await page.evaluate(()=>window.mockReviewWarning=true);await page.getByRole('button',{name:'打开本地文件'}).click();await page.getByText('已忽略 1 条格式无效的批注',{exact:true}).waitFor();await page.close();
 }finally{await browser?.close();await server?.close();await rm(cacheDir,{recursive:true,force:true})}
});
