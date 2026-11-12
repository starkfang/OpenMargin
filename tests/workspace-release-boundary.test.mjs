import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

test('blur 或切换文件后的迟到释放不会把位移提交到正文布局',async()=>{
 const cacheDir=await mkdtemp(path.join(os.tmpdir(),'om-release-boundary-'));let server,browser;
 try{
  server=await createServer({configFile:false,cacheDir,optimizeDeps:{entries:['tests/workspace-collapse-fixture.jsx']},server:{port:0,watch:{ignored:['**/release/**','**/*.app/**']}},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/__workspace',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/tests/workspace-collapse-fixture.jsx"></script>')})}}]});await server.listen();
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});const page=await browser.newPage({viewport:{width:1400,height:700}});page.setDefaultTimeout(5000);await page.goto(server.resolvedUrls.local[0]+'__workspace');await page.waitForFunction(()=>!!window.renderWorkspaceTest);await page.evaluate(()=>window.renderWorkspaceTest({reading:{outline:244,content:1050},review:{outline:244,content:1050,sidebar:320},reviewInitialized:true}));
  const workspace=page.locator('.om-workspace'),outline=page.locator('[data-workspace-pane="outline"]'),preview=page.locator('iframe[title="文档预览"]');await preview.waitFor();
  async function begin(){const r=await page.locator('[data-workspace-divider="outline"]').boundingBox(),x=r.x+r.width/2,y=r.y+80;await page.evaluate(()=>document.addEventListener('pointerdown',e=>window.__releasePointer=e.pointerId,{once:true,capture:true}));await page.mouse.move(x,y);await page.mouse.down();assert.equal(await workspace.getAttribute('data-workspace-dragging'),'true');return {x,y}}
  async function lateRelease(point){await page.evaluate(({x,y})=>document.querySelector('.om-workspace').dispatchEvent(new PointerEvent('pointerup',{pointerId:window.__releasePointer,clientX:x+80,clientY:y,buttons:0,bubbles:true})),point);await page.mouse.up();await page.waitForFunction(()=>document.querySelector('.om-workspace')?.dataset.workspaceDragging!=='true');assert.equal(await preview.evaluate(e=>getComputedStyle(e).pointerEvents),'auto');}
  const initial=(await outline.boundingBox()).width,first=await begin();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await lateRelease(first);assert.equal((await outline.boundingBox()).width,initial,'窗口失焦取消拖动，不应用迟到释放位置');
  const second=await begin();await page.evaluate(()=>window.switchWorkspaceFixture('/fixture.html'));await page.waitForFunction(()=>document.querySelector('iframe[title="文档预览"]')?.getAttribute('sandbox')==='allow-scripts allow-forms');const newWidth=(await outline.boundingBox()).width;await lateRelease(second);assert.equal((await outline.boundingBox()).width,newWidth,'切换文件后迟到释放不得改写新文档布局');assert.equal(await page.evaluate(()=>document.querySelector('.om-workspace').hasPointerCapture(window.__releasePointer)),false);
 }finally{try{await browser?.close()}finally{try{await server?.close()}finally{await rm(cacheDir,{recursive:true,force:true})}}}
});
