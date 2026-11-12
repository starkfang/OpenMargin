'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {encode,decode,readDocument,writeDocument} = require('../electron/storage.cjs');
const notes = [{id:'1',quote:'项目 -- 内容 --> 原文\n第二行',comment:'说明 --> -- 中文 emoji 🐱',createdAt:'2026-10-29T14:30:25+08:00'}];
for (const type of ['md','html']) test(`${type} annotations round-trip and preserve source`, () => {
  for (const text of ['', '标题\n', '中文\r\n\r\n', '<!-- 原注释 -->', 'line\n\n']) {
    const encoded = encode(text,notes,type);
    assert.deepEqual(decode(encoded,type), {content:text,annotations:notes});
    assert.deepEqual(decode(encode(text,[],type),type), {content:text,annotations:[]});
    assert.match(encoded,/说明/);
    if (type === 'html') assert.equal(encoded.slice(encoded.indexOf('<!-- OPENMARGIN:REVIEW:START') + 4, -3).includes('--'), false);
  }
});
test('save checks external changes and preserves updated document', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'openmargin-'));
  try {
    const file = path.join(dir,'doc.md');
    await fs.writeFile(file,'# 初始\n');
    const initial = await readDocument(file);
    const saved = await writeDocument({path:file, content:initial.content, annotations:notes,expectedHash:initial.hash});
    assert.deepEqual(saved.annotations, notes);
    await fs.writeFile(file,'# Agent 更新\n');
    await assert.rejects(writeDocument({path:file, content:'stale',annotations:[],expectedHash:saved.hash}), /FILE_CONFLICT/);
    assert.equal(await fs.readFile(file,'utf8'),'# Agent 更新\n');
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('Markdown review displays local creation and update times', () => {
  const annotations = [{id:'time', quote:'example', body:'note', createdAt:'2026-10-29T06:30:25.000Z', updatedAt:'2026-10-29T06:31:26.000Z'}];
  const output = encode('# Example', annotations, 'md');
  const displayDate = new Date(annotations[0].createdAt);
  const pad = n => String(n).padStart(2, '0');
  const expected = `${displayDate.getFullYear()}-${pad(displayDate.getMonth()+1)}-${pad(displayDate.getDate())} ${pad(displayDate.getHours())}:${pad(displayDate.getMinutes())}:${pad(displayDate.getSeconds())}`;
  assert.ok(output.includes(`### 批注 1｜${expected}`));
  assert.ok(output.includes('- 修改时间：'));
  assert.deepEqual(decode(output, 'md').annotations, annotations);
});
test('无效批注元素不会传给界面，合法元素保持原样', () => {
  const good={id:'ok',quote:'原文',body:'批注',createdAt:'2026-10-30T00:00:00Z'};
  for(const type of ['md','html']){
    const payload=JSON.stringify([null,good,7,'text',[],false,{body:{}},{quote:{}},{section:{}},{createdAt:{toString:null}}]);
    const raw=type==='html'?'正文\n\n<!-- OPENMARGIN:REVIEW:START\n'+payload+'\nOPENMARGIN:REVIEW:END -->':'正文\n\n<!-- OPENMARGIN:REVIEW:START -->\n\n## 审阅批注\n\n<!-- OPENMARGIN:DATA\n'+payload+'\nOPENMARGIN:DATA:END -->\n<!-- OPENMARGIN:REVIEW:END -->';
    const result=decode(raw,type);
    assert.deepEqual(result.annotations,[good]);assert.equal(result.content,'正文');assert.equal(result.reviewWarning,'9 条格式无效的批注无法显示，原数据将保留');
    assert.equal(result.invalidAnnotations.length,9);assert.equal(result.invalidAnnotations[0],null);
  }
});

for (const type of ['md','html']) test(`${type} 修改正文和批注后保留无法显示的原始元数据`, async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'openmargin-invalid-review-'));
  try {
    const file=path.join(dir,`doc.${type}`),good={id:'ok',quote:'原文',body:'正常批注'},invalid=[null,7,{body:{nested:'不可渲染'}},[]];
    await fs.writeFile(file,encode('正文',[...invalid,good],type));
    const initial=await readDocument(file);
    assert.deepEqual(initial.annotations,[good]);assert.deepEqual(initial.invalidAnnotations,invalid);
    const edited={...good,body:'更新的正常批注'};
    const saved=await writeDocument({path:file,content:'已修改正文',annotations:[edited],expectedHash:initial.hash});
    assert.equal(saved.content,'已修改正文');assert.deepEqual(saved.annotations,[edited]);assert.deepEqual(saved.invalidAnnotations,invalid);
    const copy=decode(encode(saved.content,[...saved.annotations,...saved.invalidAnnotations],type),type);
    assert.deepEqual(copy.invalidAnnotations,invalid,'另存为使用相同编码策略');
    const savedAgain=await writeDocument({path:file,content:saved.content,annotations:[],expectedHash:saved.hash});
    assert.deepEqual(savedAgain.annotations,[]);assert.deepEqual(savedAgain.invalidAnnotations,invalid,'删除所有可见批注也不删除无法显示的数据');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
