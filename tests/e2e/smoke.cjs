const {openSource}=require('./edit-helpers.cjs');
const {waitForText,waitForAnnotation}=require('./file-helpers.cjs');
'use strict';
// Run after `npm run build`: node tests/e2e/smoke.cjs
// Uses isolated temporary files and an isolated Electron user-data directory.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {_electron: electron} = require('playwright');
const root = path.resolve(__dirname, '../..');
const binary = require(path.join(root, 'node_modules/electron'));

(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'openmargin-e2e-'));
  const md = path.join(tmp, 'review.md');
  const html = path.join(tmp, 'review.html');
  const source = '# 项目方案\n\n## 第一章\n\n这里是一段独特的测试句子。\n\n可替换文字。\n\n| 表头 | 数据 |\n| --- | --- |\n| 项目 | 单元格内容 |\n\n## 第二章\n\n重复句子。\n\n重复句子。\n\n' + Array.from({length:45},(_,i)=>`第 ${i+1} 段很长的正文用于测试滚动位置。\n\n`).join('');
  const htmlSource = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="./theme.css"></head><body><h1>HTML标题</h1><h2>二级标题</h2><p>HTML测试文字</p><p>起点<strong>跨格式</strong>终点</p><img src="./pixel.png"></body></html>';
  await fs.writeFile(md, source);
  await fs.writeFile(html, htmlSource);
  await fs.writeFile(path.join(tmp,'theme.css'),'body {background:rgb(12, 34, 56)}');
  await fs.writeFile(path.join(tmp,'pixel.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a0sAAAAASUVORK5CYII=','base64'));
  const failures = [];
  let app;
  try {
    app = await electron.launch({executablePath:binary, args:[root, `--user-data-dir=${path.join(tmp,'userdata')}`], timeout:30000});
    const win = await app.firstWindow();
    const test = async (name, fn) => { try { await fn(); console.log(`PASS ${name}`); } catch(e) { failures.push(name); console.error(`FAIL ${name}: ${e.message}`); } };
    const choose = async file => {
      await app.evaluate(({dialog}, filePath) => { dialog.showOpenDialog = async () => ({canceled:false,filePaths:[filePath]}); }, file);
      await win.getByRole('button', {name:'打开文件'}).first().click();
      await win.locator('iframe[title="文档预览"]').waitFor();
      await win.waitForTimeout(250);
    };
    const select = async (text, index=0) => {
      await win.locator('iframe[title="文档预览"]').evaluate((frame, {text,index}) => {
        const d=frame.contentDocument, walker=d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT); let node, matches=[];
        while ((node=walker.nextNode())) if (node.nodeValue.includes(text) && !node.parentElement.closest('style,script')) matches.push(node);
        if (!matches[index]) throw Error('未找到选中文字：'+text);
        node=matches[index]; const start=node.nodeValue.indexOf(text), range=d.createRange();
        range.setStart(node,start); range.setEnd(node,start+text.length); const s=d.getSelection(); s.removeAllRanges(); s.addRange(range);
        d.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      }, {text,index});
    };
    const annotate = async (text, note, index=0) => {
      await select(text,index);
      if(await win.getByRole('button',{name:'自定义批注'}).isVisible())await win.getByRole('button',{name:'自定义批注'}).click();await win.getByPlaceholder('写下你的想法或修改建议…').fill(note);
      await win.getByRole('button',{name:'添加批注'}).click();
      await win.locator('.annotation-popover').waitFor({state:'hidden'});
      await win.getByRole('button',{name:'保存',exact:true}).click();
      const target=(await win.locator('[role=tab][aria-selected=true]').innerText()).includes('.html')?html:md;
      await waitForAnnotation(target,target===html?'html':'md',note);
      if(!(await win.locator('aside.comments').isVisible()))await win.locator('.tool-right').getByRole('button',{name:/批注/}).click();
      await win.getByText(note,{exact:true}).waitFor();
    };
    await choose(md);
    await test('Markdown 多级标题大纲', async () => {
      const outline=win.locator('.outline');
      for (const s of ['项目方案','第一章','第二章']) await outline.getByRole('button',{name:s,exact:true}).waitFor();
    });
    await test('划词批注保存在原文件且可见', async () => {
      await annotate('独特的测试句子','核对引用');
      assert.match(await fs.readFile(md,'utf8'),/核对引用/);
      await win.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelectorAll('[data-om-mark]').length===1);
    });
    await test('重复原文能定位所选第二处', async () => {
      await annotate('重复句子','第二处需要修改',1);
      await win.waitForFunction(()=>[...document.querySelector('iframe').contentDocument.querySelectorAll('[data-om-mark]')].some(n=>n.textContent==='重复句子'));
    });
    await test('重新打开后批注仍存在', async () => {
      await choose(md); await win.getByText('核对引用',{exact:true}).waitFor();
    });
    await test('表格单元格批注', async () => {
      await annotate('单元格内容','表格数据需要复核');
      await win.waitForFunction(()=>[...document.querySelector('iframe').contentDocument.querySelectorAll('td mark')].some(n=>n.textContent==='单元格内容'));
    });
    await test('原位编辑、撤销及重做', async () => {
      await win.getByRole('button',{name:'原位编辑',exact:true}).click();
      const frame=win.frameLocator('iframe[title="文档预览"]');
      const paragraph=frame.getByText('可替换文字',{exact:false}).first();
      await paragraph.click(); await paragraph.fill('已替换文字');
      await win.getByRole('button',{name:'保存',exact:true}).click();
      await win.getByText('正文已保存',{exact:true}).first().waitFor();
      await win.getByRole('button',{name:'退出原位编辑'}).click();
      assert.match(await fs.readFile(md,'utf8'),/已替换文字/);
      await win.getByRole('button',{name:'撤销',exact:false}).click();
      await win.waitForTimeout(250);
      assert.match(await fs.readFile(md,'utf8'),/可替换文字/);
      await win.getByRole('button',{name:'重做',exact:false}).click();
      await win.waitForTimeout(250);
      assert.match(await fs.readFile(md,'utf8'),/已替换文字/);
    });
    await test('阅读位置重新打开后恢复', async () => {
      await win.locator('iframe').evaluate(f=>f.contentWindow.scrollTo(0,500));
      await win.waitForTimeout(250);
      await choose(md);
      await win.waitForFunction(()=>document.querySelector('iframe').contentWindow.scrollY>=400,{timeout:4000});
    });
    await test('正文编辑保存及修改记录', async () => {
      await openSource(win);
      const editor=win.locator('.source-editor textarea');
      const before=await editor.inputValue();
      await editor.fill(before.replace('项目方案','项目方案已更新'));
      await win.getByRole('button',{name:'保存修改'}).click();
      await win.locator('.sidebar-switch').getByRole('button',{name:/^记录/}).click();
      await win.locator('.history-body').getByText('项目方案已更新',{exact:false}).first().waitFor();
      assert.match(await fs.readFile(md,'utf8'),/项目方案已更新/);
      await win.locator('.sidebar-switch').getByRole('button',{name:/^批注/}).click();
    });
    await test('删除被批注的重复句不得关联到另一处', async () => {
      const raw=await fs.readFile(md,'utf8');
      assert.ok(raw.includes('重复句子。\n\n重复句子。'));
      await fs.writeFile(md,raw.replace('重复句子。\n\n重复句子。','重复句子。\n\n此处已经删除。'));
      const card=win.locator('.comment-card').filter({hasText:'第二处需要修改'});
      await card.getByText('无法定位').waitFor({timeout:8000});
      assert.equal(await win.locator('iframe').evaluate(f=>[...f.contentDocument.querySelectorAll('mark')].some(n=>n.textContent==='重复句子')),false);
    });
    await test('外部修改后批注保留并标记失联', async () => {
      let raw=await fs.readFile(md,'utf8'); await fs.writeFile(md,raw.replace('独特的测试句子','已经修改的内容'));
      await win.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body?.textContent.includes('已经修改的内容'),{timeout:8000});
      const card=win.locator('.comment-card').filter({hasText:'核对引用'}); await card.getByText('无法定位').waitFor({timeout:8000});
    });
    await test('编辑批注后更新内容和时间并持久化', async () => {
      const id=await win.locator('.comment-card').filter({hasText:'核对引用'}).getAttribute('id');
      const card=win.locator(`[id="${id}"]`);
      await card.getByTitle('编辑批注').click();
      await card.locator('textarea').fill('修改后的批注意见');
      await card.getByRole('button',{name:'暂存修改'}).click();
      await card.locator('textarea').waitFor({state:'detached',timeout:5000});
      await win.getByText('修改后的批注意见',{exact:true}).waitFor();
      await win.getByRole('button',{name:'保存',exact:true}).click();
      const stored=require(path.join(root,'electron/storage.cjs')).decode(await waitForText(md,'修改后的批注意见'),'md').annotations.find(a=>a.body==='修改后的批注意见');
      assert.ok(stored?.createdAt && stored?.updatedAt);
      await choose(md); await win.getByText('修改后的批注意见',{exact:true}).waitFor();
    });
    await win.locator('iframe').evaluate(f=>f.contentWindow.scrollTo(0,0));
    await win.screenshot({path:path.join(__dirname,'main-screen.png')});
    await test('HTML 标题大纲', async () => {
      await choose(html);
      await win.locator('.outline').getByRole('button',{name:'二级标题'}).waitFor();
    });
    await test('HTML 相对 CSS 和图片资源', async () => {
      assert.equal(await win.locator('iframe').evaluate(f=>f.contentWindow.getComputedStyle(f.contentDocument.body).backgroundColor),'rgb(12, 34, 56)');
      assert.equal(await win.locator('iframe').evaluate(f=>f.contentDocument.querySelector('img').naturalWidth),1);
    });
    await test('HTML 注释内批注', async () => {
      await annotate('HTML测试文字','HTML批注意见 --> 测试');
      const raw=await fs.readFile(html,'utf8'); assert.ok(raw.startsWith(htmlSource));
      const decoded=require(path.join(root,'electron/storage.cjs')).decode(raw,'html');
      assert.equal(decoded.annotations[0].body,'HTML批注意见 --> 测试');
      assert.equal(decoded.content,htmlSource);
    });
    await test('跨格式文字划选与高亮', async () => {
      await win.locator('iframe').evaluate(frame=>{const d=frame.contentDocument, p=[...d.querySelectorAll('p')].find(p=>p.textContent==='起点跨格式终点'), range=d.createRange();range.setStart(p.firstChild,0);range.setEnd(p.lastChild,p.lastChild.length);const s=d.getSelection();s.removeAllRanges();s.addRange(range);d.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
      if(await win.getByRole('button',{name:'自定义批注'}).isVisible())await win.getByRole('button',{name:'自定义批注'}).click();await win.getByPlaceholder('写下你的想法或修改建议…').fill('跨格式批注');
      await win.getByRole('button',{name:'添加批注'}).click();
      await win.locator('.annotation-popover').waitFor({state:'hidden'});await win.getByRole('button',{name:'保存',exact:true}).click();await waitForText(html,'跨格式批注');
      if(!(await win.locator('aside.comments').isVisible()))await win.locator('.tool-right').getByRole('button',{name:/批注/}).click();await win.getByText('跨格式批注',{exact:true}).waitFor();
      await win.waitForFunction(()=>[...document.querySelector('iframe').contentDocument.querySelectorAll('[data-om-mark]')].map(x=>x.textContent).join('').includes('起点跨格式终点'));
    });
    await test('区域批注重开保持并在内容变化后失联', async () => {
      await win.getByRole('button',{name:'框选区域',exact:true}).click();
      await win.locator('iframe').evaluate(f=>{const d=f.contentDocument;d.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:30,clientY:100}));d.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:170,clientY:160}));});
      if(await win.getByRole('button',{name:'自定义批注'}).isVisible())await win.getByRole('button',{name:'自定义批注'}).click();await win.getByPlaceholder('写下你的想法或修改建议…').fill('区域标注内容');
      await win.getByRole('button',{name:'添加批注'}).click();
      await win.locator('.annotation-popover').waitFor({state:'hidden'});await win.getByRole('button',{name:'保存',exact:true}).click();await waitForText(html,'区域标注内容');
      if(!(await win.locator('aside.comments').isVisible()))await win.locator('.tool-right').getByRole('button',{name:/批注/}).click();await win.getByText('区域标注内容',{exact:true}).waitFor();
      await choose(html);
      await win.waitForFunction(()=>!!document.querySelector('iframe').contentDocument.querySelector('[data-om-area]'));
      const raw=await fs.readFile(html,'utf8');await fs.writeFile(html,raw.replace('HTML测试文字','外部改动后的文字'));
      await win.locator('.comment-card').filter({hasText:'区域标注内容'}).getByText('无法定位').waitFor({timeout:8000});
    });
    await test('拖放本地文件打开', async () => {
      await win.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='test-file-input';document.body.append(input)});
      await win.locator('#test-file-input').setInputFiles(md);
      await win.evaluate(()=>{const transfer=new DataTransfer();transfer.items.add(document.querySelector('#test-file-input').files[0]);document.querySelector('.app').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));});
      await win.locator('.filename').getByText('review.md').waitFor({timeout:4000});
    });
    await test('未保存编辑关闭保护：取消保留，丢弃关闭', async () => {
      await openSource(win);
      const editor=win.locator('.source-editor textarea');
      await editor.fill((await editor.inputValue())+'\n未保存的修改');
      // Stub only the native dialog response; close and beforeunload run in the real Electron app.
      await app.evaluate(({dialog})=>{global.__omDialogCalls=0;dialog.showMessageBoxSync=()=>{global.__omDialogCalls++;return 0;};});
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
      await win.waitForTimeout(300);
      assert.equal(win.isClosed(),false);
      assert.match(await editor.inputValue(),/未保存的修改/);
      assert.equal(await app.evaluate(()=>global.__omDialogCalls),1);
      await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>{global.__omDialogCalls++;return 1;};});
      const closed=win.waitForEvent('close',{timeout:5000});
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
      await closed;
      assert.doesNotMatch(await fs.readFile(md,'utf8'),/未保存的修改/);
      assert.equal(await app.evaluate(()=>global.__omDialogCalls),2);
    });
  } finally { if(app) app.process().kill("SIGKILL"); await fs.rm(tmp,{recursive:true,force:true,maxRetries:10,retryDelay:100}); }
  if(failures.length) {console.error(`Failed: ${failures.join(', ')}`); process.exitCode=1;}
})().catch(e=>{console.error(e); process.exitCode=1});
