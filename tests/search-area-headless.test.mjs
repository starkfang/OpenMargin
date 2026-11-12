import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

test('搜索框选正文包含跨标记文字，排除悬浮装饰',async()=>{
 const cacheDir=await mkdtemp(path.join(os.tmpdir(),'om-search-area-'));let server,browser;
 try{
  server=await createServer({configFile:false,cacheDir,server:{port:0,watch:{ignored:['**/release/**','**/*.app/**']}}});await server.listen();
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
  const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
  const result=await page.evaluate(async()=>{
   const {createSearchEngine}=await import('/src/searchEngine.js');
   document.body.innerHTML='<p>前文<mark data-om-area="a">批注<strong>区域</strong></mark>后文</p><div data-om-area="legacy">批注区域</div><span data-om-draft>批注区域</span><p hidden>批注区域</p>';
   const engine=createSearchEngine(document);return {inside:engine.run('批注区域',0,false).count,cross:engine.run('前文批注区域后文',0,false).count,unmarked:engine.run('后文',0,false).count,html:document.body.innerHTML};
  });
  assert.equal(result.inside,1,'只计正文 mark，排除区域装饰及隐藏文本');assert.equal(result.cross,1,'搜索能跨普通文本和批注 mark');assert.equal(result.unmarked,1);assert.match(result.html,/<mark data-om-area="a">/,'搜索不修改批注节点');
 }finally{await browser?.close();await server?.close();await rm(cacheDir,{recursive:true,force:true})}
});
