'use strict';
const {waitForText}=require('./file-helpers.cjs');
const { _electron: electron } = require('playwright');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'openmargin-popover-'));
 const file=path.join(dir,'note.md'); await fs.writeFile(file,'# 标题\n\n这是一段用于浮窗审阅的文字。\n\n## 二级标题\n\n另一段文字。\n');
 let app; try {
 const packaged=process.env.OPENMARGIN_TEST_APP;
 app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),file,`--user-data-dir=${dir}/userdata`]});
 const win=await app.firstWindow(); await win.locator('iframe').waitFor();
 const frame=async()=>{const h=await win.locator('iframe').elementHandle();return h.contentFrame()};
 async function select(q){const f=await frame();await f.evaluate(text=>{const d=document;const w=d.createTreeWalker(d.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){let i=n.nodeValue.indexOf(text);if(i>=0){const r=d.createRange();r.setStart(n,i);r.setEnd(n,i+text.length);const s=d.getSelection();s.removeAllRanges();s.addRange(r);d.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return}}throw Error('no selection text');},q);await win.locator('.annotation-popover').waitFor({timeout:5000});}
 assert.equal(await win.locator('aside.comments').isVisible(),false);console.log('PASS 默认收起批注侧栏');
 const original=await fs.readFile(file,'utf8');await select('用于浮窗审阅');assert.equal(await win.locator('aside.comments').isVisible(),false);
 let pop=win.locator('.annotation-popover');if(await pop.getByRole('button',{name:'自定义批注'}).isVisible())await pop.getByRole('button',{name:'自定义批注'}).click();await pop.getByPlaceholder('写下你的想法或修改建议…').fill('浮窗测试批注');await pop.getByRole('button',{name:'添加批注'}).click();await pop.waitFor({state:'hidden'});assert.equal(await fs.readFile(file,'utf8'),original,'添加批注先暂存');await win.getByRole('button',{name:'保存',exact:true}).click();
 assert.match(await waitForText(file,'浮窗测试批注'),/浮窗测试批注/);assert.equal(await win.locator('aside.comments').isVisible(),false);console.log('PASS 划词浮窗保存且批注写入原文');
 const persisted=await fs.readFile(file,'utf8');const f=await frame();await f.locator('mark[data-om-mark]').first().click();await pop.waitFor();await pop.getByText('浮窗测试批注',{exact:true}).waitFor();console.log('PASS 点击正文标记查看批注');
 await pop.getByRole('button',{name:'编辑批注',exact:true}).click();await pop.getByLabel('编辑批注内容').fill('修改后的浮窗批注');await pop.getByRole('button',{name:'暂存修改'}).click();await pop.getByLabel('编辑批注内容').waitFor({state:'detached'});await pop.getByText('修改后的浮窗批注',{exact:true}).waitFor();await pop.getByLabel('关闭批注').click();assert.equal(await fs.readFile(file,'utf8'),persisted,'编辑批注先暂存');await win.getByRole('button',{name:'保存',exact:true}).click();assert.match(await waitForText(file,'修改后的浮窗批注'),/修改后的浮窗批注/);console.log('PASS 浮窗编辑批注并保存');
 await win.getByRole('button',{name:'框选区域',exact:true}).click();const areaf=await frame();await areaf.evaluate(()=>{const d=document,t=d.querySelector('p'),r=t.getBoundingClientRect();for(const [type,x,y] of [['mousedown',r.left+2,r.top+2],['mousemove',r.left+120,r.top+40],['mouseup',r.left+120,r.top+40]])t.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='mouseup'?0:1,clientX:x,clientY:y}));});await pop.waitFor();await areaf.waitForFunction(()=>CSS.highlights.has('openmargin-area-draft')); if(await pop.getByRole('button',{name:'自定义批注'}).isVisible())await pop.getByRole('button',{name:'自定义批注'}).click();await pop.getByPlaceholder('写下你的想法或修改建议…').fill('区域意见');await pop.getByRole('button',{name:'添加批注'}).click();await pop.waitFor({state:'hidden'});await areaf.locator('[data-om-area]').first().click();await pop.getByText('区域意见',{exact:true}).waitFor();console.log('PASS 框选松手保留、保存并打开标记');
 if(!(await win.locator('aside.comments').isVisible()))await win.locator('.tool-right').getByRole('button',{name:/批注/}).click();await win.locator('aside.comments').waitFor();await win.locator('aside.comments').getByText('修改后的浮窗批注',{exact:true}).waitFor();console.log('PASS 按需打开侧栏查看批注');
 } finally {if(app)app.process().kill("SIGKILL");await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1});
