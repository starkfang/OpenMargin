import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const {saveShortcut} = createRequire(import.meta.url)('../electron/saveShortcut.cjs');

test('native save shortcut accepts only real shortcut shapes', () => {
  const key={type:'keyDown',key:'s',meta:true};
  assert.deepEqual(saveShortcut(key),{saveAs:false});
  assert.deepEqual(saveShortcut({...key,key:'S',shift:true}),{saveAs:true});
  for(const input of [{...key,type:'keyUp'},{...key,isComposing:true},{...key,isAutoRepeat:true},{...key,alt:true},{...key,meta:false},{...key,key:'x'}]) assert.equal(saveShortcut(input),null);
});

test('HTML iframe 伪造消息或按键不能调用保存，宿主授权仍能保存', async () => {
  const cacheDir=await mkdtemp(join(tmpdir(),'om-security-vite-'));
  const server=await createServer({configFile:false,cacheDir,optimizeDeps:{entries:['tests/save-shortcut-security-fixture.js']},server:{port:0,watch:{ignored:['**/release/**','**/*.app/**']}},plugins:[{name:'security-fixture',configureServer(s){s.middlewares.use('/__save_security',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/tests/save-shortcut-security-fixture.js"></script>')})}}]});
  await server.listen();
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
  try {
    const page=await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(server.resolvedUrls.local[0]+'__save_security',{waitUntil:'domcontentloaded',timeout:60000});
    await page.getByRole('button',{name:'打开本地文件'}).click();
    const frame=page.frameLocator('iframe');
    await frame.locator('p').waitFor();
    assert.match(await page.evaluate(()=>window.preparedSnapshots[0]),/原始内容/, '预览使用当前内存快照');
    await page.evaluate(()=>window.postMessage({channel:'openmargin:preview',type:'save-shortcut'},'*'));
    const attack=async()=>frame.locator('body').evaluate(()=>{
      const post=(type,details={})=>parent.postMessage({channel:'openmargin:preview',type,...details},'*');
      post('edit-dirty',{changes:[{before:'原始内容',after:'伪造内容',domPath:[{tag:'html',index:0},{tag:'body',index:0},{tag:'p',index:0}]}]});
      post('save-shortcut');post('save-shortcut',{saveAs:true});
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true}));
    });
    await attack();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.saveCalls.length),0,'阅读状态不写盘');
    await page.getByRole('button',{name:'原位编辑',exact:true}).click();
    await attack();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>window.saveCalls.length),0,'原位编辑状态伪造消息不写盘');
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.waitForFunction(()=>window.saveCalls.length===1);
    assert.match(await page.evaluate(()=>window.saveCalls[0].content),/伪造内容/,'用户主动保存仍可提交暂存状态');
    await page.waitForFunction(()=>window.preparedSnapshots.some(s=>s.includes('伪造内容')));
    await frame.locator('body').evaluate(()=>parent.postMessage({channel:'openmargin:preview',type:'save-shortcut',saveAs:true},'*'));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.saveCalls.length),1,'伪造另存为不调用持久化接口');
    await page.evaluate(()=>window.nativeSaveShortcut(true));
    await page.waitForFunction(()=>window.saveCalls.length===2);
    assert.equal(await page.evaluate(()=>window.saveCalls[1].saveAs),true,'原生快捷键通知仍进入宿主另存为');
    let before='伪造内容';
    for (const length of [10001,100000]) {
      await frame.locator('p').filter({hasText:before}).waitFor();
      const after='长'.repeat(length);
      await frame.locator('body').evaluate((_el,{before,after})=>parent.postMessage({channel:'openmargin:preview',type:'edit-dirty',changes:[{before,after,domPath:[{tag:'html',index:0},{tag:'body',index:0},{tag:'p',index:0}]}]},'*'),{before,after});
      await page.getByRole('button',{name:'保存',exact:true}).click();
      await page.waitForFunction(length=>window.saveCalls.some(c=>c.content?.includes('长'.repeat(length))),length);
      before=after;
    }
  } finally {await browser.close();await server.close();await rm(cacheDir,{recursive:true,force:true});}
});
