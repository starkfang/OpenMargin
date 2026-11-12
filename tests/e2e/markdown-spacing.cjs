'use strict';
// Single isolated Electron window and temporary documents. Run after npm run build.
const { _electron: electron } = require('playwright');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const md = `# 文档主标题\n\n这是一段引言。\n\n## 第一章节\n\n### 连续子标题\n\n第一段正文。\n\n第二段正文。\n\n## 第二章节\n\n列表前的正文。\n\n- 第一条\n- 第二条\n- 第三条\n\n表格前的正文。\n\n| 项目 | 内容 |\n| --- | --- |\n| 一 | 示例 |\n\n表格后的正文。\n\n\`\`\`text\n测试代码\n\`\`\`\n\n代码后的正文。\n`;
const html = '<!doctype html><html><head><style>body{background:rgb(12, 34, 56);padding:7px;line-height:1.3}h1{margin:53px 0}</style></head><body><h1>HTML 自有样式</h1><p>正文</p></body></html>';
function checkRange(label, value, min, max) { assert.ok(value >= min && value <= max, `${label}: ${value.toFixed(1)}px, expected ${min}–${max}px`); }
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openmargin-spacing-'));
  const mdFile=path.join(dir,'spacing.md'), htmlFile=path.join(dir,'own-style.html');
  await fs.writeFile(mdFile,md); await fs.writeFile(htmlFile,html);
  let app;
  try {
    const packaged=process.env.OPENMARGIN_TEST_APP;
    app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),mdFile,`--user-data-dir=${path.join(dir,'profile')}`]});
    const win=await app.firstWindow();
    assert.equal(app.windows().length,1,'only one debug window');
    const frame=win.frameLocator('iframe[title="文档预览"]');
    await frame.getByRole('heading',{name:'文档主标题'}).waitFor();
    const measure=()=>frame.locator('body').evaluate(body=>{
      const $=s=>body.querySelector(s), rect=e=>{const r=e.getBoundingClientRect();return {top:r.top+window.scrollY,bottom:r.bottom+window.scrollY};};
      const h1=$('h1'), h2s=body.querySelectorAll('h2'), h3=$('h3'), p=body.querySelectorAll(':scope > p'), li=body.querySelectorAll('li'), table=$('table'), pre=$('pre');
      const gap=(a,b)=>rect(b).top-rect(a).bottom, style=getComputedStyle(body);
      return {top:rect(h1).top, h1Intro:gap(h1,p[0]), introH2:gap(p[0],h2s[0]), h2H3:gap(h2s[0],h3), h3P:gap(h3,p[1]), paragraphs:gap(p[1],p[2]), pH2:gap(p[2],h2s[1]), listItems:gap(li[0],li[1]), pTable:gap(p[4],table), tableP:gap(table,p[5]), pPre:gap(p[5],pre), preP:gap(pre,p[6]), lineHeight:parseFloat(style.lineHeight), fontSize:parseFloat(style.fontSize), first:rect(h1)};
    });
    const a=await measure();
    // Optional artifact: temporary fixture only, before entering edit mode.
    if (process.env.OPENMARGIN_TEST_SCREENSHOT) await win.screenshot({path:process.env.OPENMARGIN_TEST_SCREENSHOT});
    console.log('Measured Markdown gaps (CSS px):',JSON.stringify(a));
    // Bounds allow small fractional rounding in Chromium while checking visible element boundaries,
    // instead of summing CSS margins which may collapse.
    checkRange('top to first content',a.top,31,41);
    checkRange('first title to introduction',a.h1Intro,18,26);
    checkRange('introduction to section heading',a.introH2,26,34);
    checkRange('adjacent parent/child headings',a.h2H3,10,18);
    checkRange('heading to paragraph',a.h3P,6,14);
    checkRange('paragraphs',a.paragraphs,10,18);
    checkRange('paragraph to second-level heading',a.pH2,26,34);
    checkRange('list items',a.listItems,2,10);
    for(const [name,n] of [['paragraph to table',a.pTable],['table to paragraph',a.tableP],['paragraph to code',a.pPre],['code to paragraph',a.preP]])checkRange(name,n,14,26);
    checkRange('body line height relative to font size',a.lineHeight/a.fontSize,1.6,1.8);
    console.log('PASS Markdown reading spacing');
    await win.getByRole('button',{name:/原位编辑/}).click();
    await frame.getByText('第一段正文。',{exact:true}).click();
    await frame.locator('[contenteditable="plaintext-only"]').waitFor();
    const b=await measure();
    for(const key of ['top','h1Intro','introH2','h2H3','h3P','paragraphs','pH2','listItems','pTable','tableP','pPre','preP','lineHeight'])assert.ok(Math.abs(a[key]-b[key])<0.5,`${key} changes in inline edit mode`);
    await win.getByRole('button',{name:'退出原位编辑'}).click();
    console.log('PASS inline editing uses same layout');
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},htmlFile);
    await win.getByRole('button',{name:/打开文件/}).first().click();
    await win.getByRole('tab',{name:/own-style\.html/}).waitFor();
    const htmlFrame=win.frameLocator('iframe[title="文档预览"]');
    await htmlFrame.getByRole('heading',{name:'HTML 自有样式'}).waitFor();
    const own=await htmlFrame.locator('body').evaluate(body=>({background:getComputedStyle(body).backgroundColor,padding:getComputedStyle(body).paddingTop,lineHeight:getComputedStyle(body).lineHeight,headingMargin:getComputedStyle(body.querySelector('h1')).marginTop}));
    assert.equal(own.background,'rgb(12, 34, 56)'); assert.equal(own.padding,'7px'); assert.equal(own.headingMargin,'53px');
    assert.equal(await fs.readFile(mdFile,'utf8'),md); assert.equal(await fs.readFile(htmlFile,'utf8'),html);
    console.log('PASS HTML retains its own styles; documents unchanged');
  } finally {
    if(app) app.process().kill('SIGKILL');
    await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
