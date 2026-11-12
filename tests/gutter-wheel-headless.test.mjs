import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {normalizeGutterWheel} from '../src/gutterWheel.mjs';

test('留白 wheel 换算保留浏览器缩放及横向快捷键',()=>{
 assert.deepEqual(normalizeGutterWheel({deltaX:0,deltaY:2,deltaMode:1},400,300),{x:0,y:32});
 assert.deepEqual(normalizeGutterWheel({deltaX:1,deltaY:1,deltaMode:2},400,300),{x:400,y:300});
 assert.equal(normalizeGutterWheel({deltaX:0,deltaY:1,ctrlKey:true},400,300),null);
 assert.equal(normalizeGutterWheel({deltaX:0,deltaY:1,shiftKey:true},400,300),null);
});
test('MD 与 HTML 留白实际滚动 iframe 且不拦截其他区域',async()=>{
 const cacheDir=await mkdtemp(path.join(os.tmpdir(),'om-wheel-vite-'));let server,browser;
 try{
  server=await createServer({configFile:false,cacheDir,optimizeDeps:{entries:['tests/gutter-wheel-fixture.js']},server:{port:0,watch:{ignored:['**/release/**','**/*.app/**']}},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/__wheel',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<script type="module" src="/tests/gutter-wheel-fixture.js"></script>')})}}]});
  await server.listen();const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
  const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]+'__wheel');await page.waitForFunction(()=>!!window.openFixture);
  for(const type of ['md','html']){
    await page.evaluate(type=>window.openFixture(type),type);const frame=page.frameLocator('iframe');await frame.locator('p').first().waitFor();
    if(type==='html')await page.waitForFunction(()=>window.messages.some(m=>m.type==='ready'));
    assert.equal(await frame.locator('body').evaluate(()=>scrollY),0);
    assert.equal(await page.evaluate(()=>window.sendWheel('.canvas')),false,'留白事件被处理');
    await frame.locator('body').evaluate(()=>new Promise(resolve=>setTimeout(resolve,80)));
    assert.ok(await frame.locator('body').evaluate(()=>scrollY)>0,type+' 留白实际滚动');
    const before=await frame.locator('body').evaluate(()=>scrollY);
    assert.equal(await page.evaluate(()=>window.sendWheel('.workspace-divider-content',{deltaY:2,deltaMode:1})),false,'正文分隔条上的滚轮也转发');
    await frame.locator('body').evaluate(()=>new Promise(resolve=>setTimeout(resolve,80)));
    assert.ok((await frame.locator('body').evaluate(()=>scrollY))>before);
    assert.equal(await page.evaluate(()=>window.sendWheel('.canvas',{ctrlKey:true})),true);
    assert.equal(await page.evaluate(()=>window.sendWheel('.canvas',{shiftKey:true})),true);
    assert.equal(await page.evaluate(()=>window.sendWheel('textarea')),true);
    assert.equal(await page.evaluate(()=>window.sendWheel('.comments')),true);
    assert.equal(await page.evaluate(()=>window.sendWheel('iframe')),true);
    await page.evaluate(()=>document.querySelector('.om-workspace').dataset.workspaceDragging='true');
    assert.equal(await page.evaluate(()=>window.sendWheel('.canvas')),true,'拖动期间不转发');
    await page.evaluate(()=>delete document.querySelector('.om-workspace').dataset.workspaceDragging);
  }
 }finally{try{await browser?.close()}finally{try{await server?.close()}finally{await rm(cacheDir,{recursive:true,force:true})}}}
});
