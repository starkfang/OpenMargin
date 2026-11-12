import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
test('框选保留真实文字片段、重排定位和保守失联',async()=>{
  const server=await createServer({configFile:false,server:{port:0},plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/__area_test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<script type="module" src="/tests/content-area-fixture.js"></script>')})}}]});
  await server.listen();
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
  try {
    const page=await browser.newPage({viewport:{width:800,height:600}});await page.goto(server.resolvedUrls.local[0]+'__area_test');await page.waitForFunction(()=>!!window.area);
    const result=await page.evaluate(()=>{const a=window.charRect('p:nth-child(1)',1,4);window.anchor=window.area.capture({left:a.left+.1,right:a.right-.1,top:a.top+.1,bottom:a.bottom-.1});return window.anchor});
    assert.equal(result.quote,'乙丙丁');
    assert.equal(result.fragments[0].quote,'乙丙丁');
    assert.equal(await page.evaluate(()=>window.area.resolve(window.anchor).status),'matched');
    await page.evaluate(()=>{document.querySelector('p').style.fontSize='30px';document.querySelector('p').style.width='60px'});
    assert.equal(await page.evaluate(()=>window.area.resolve(window.anchor).status),'matched','重排不会失联');
    await page.evaluate(()=>document.querySelectorAll('p')[1].textContent='其他段落已修改');
    assert.equal(await page.evaluate(()=>window.area.resolve(window.anchor).status),'matched','唯一原块与一侧上下文未变时继续定位');
    await page.reload();await page.waitForFunction(()=>!!window.area);
    const multi=await page.evaluate(()=>{const a=window.charRect('p:nth-child(1)',1,3),b=window.charRect('p:nth-child(2)',1,3);window.multi=window.area.capture({left:Math.min(a.left,b.left)+.1,right:Math.min(a.right,b.right)-.1,top:a.top+.1,bottom:b.bottom-.1});return window.multi});
    assert.equal(multi.fragments.length,2);
    assert.equal(multi.fragments.map(x=>x.quote).join('/'),'乙丙/地方');
    await page.evaluate(()=>document.querySelector('p:nth-child(2)').textContent='文本已变化');
    const partial=await page.evaluate(()=>window.area.resolve(window.multi).status);
    assert.equal(partial,'partial','仅保留未变的片段');
    await page.reload();await page.waitForFunction(()=>!!window.area);
    const duplicate=await page.evaluate(()=>{const r=window.charRect('p:nth-child(3)',0,4);window.duplicate=window.area.capture(r);document.querySelector('p:nth-child(3)').remove();return window.area.resolve(window.duplicate).status});
    assert.equal(duplicate,'missing','删除重复块后不把批注错连到另一段');
  }finally{await browser.close();await server.close()}
});
