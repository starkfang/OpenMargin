import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHistorySections } from '../src/historySections.mjs';

test('Markdown 多章节修改只返回真实受影响章节',()=>{
  const before='# 项目\n\n## 甲\n\n甲内容\n\n## 乙\n\n乙内容\n\n## 丙\n\n丙内容\n';
  const after=before.replace('甲内容','甲内容补充').replace('丙内容','丙内容更新');
  assert.deepEqual(deriveHistorySections('md',before,after),['项目 / 甲','项目 / 丙']);
});
test('HTML 单行多章节的插入、删除和替换准确定位',()=>{
  const before='<!doctype html><html><body><h1>报告</h1><h2>甲</h2><p>原文甲</p><h2>乙</h2><p>保留</p><h2>丙</h2><p>原文丙</p></body></html>';
  const after=before.replace('原文甲','原文甲新增').replace('原文丙','替换');
  assert.deepEqual(deriveHistorySections('html',before,after),['报告 / 甲','报告 / 丙']);
});
test('不把代码块中的井号、head 样式或无标题正文当作章节',()=>{
  const before='# 正文\n\n```md\n## 不是章节\n原文\n```\n';
  assert.deepEqual(deriveHistorySections('md',before,before.replace('原文','修改')),['正文']);
  assert.deepEqual(deriveHistorySections('md','无标题','无标题修改'),[]);
  const html='<html><head><style>body{color:red}</style></head><body><h1>标题</h1><p>正文</p></body></html>';
  assert.deepEqual(deriveHistorySections('html',html,html.replace('color:red','color:blue')),[]);
});
test('重复的同级章节无法区分时不虚构',()=>{
  const before='# 根\n\n## 重复\n\n一\n\n## 重复\n\n二\n';
  assert.deepEqual(deriveHistorySections('md',before,before.replace('一','更改')),[]);
});
test('标题内格式、实体按实际标题文本展示',()=>{
  const before='<body><h1>报告</h1><h2>甲 &amp; <b>乙</b></h2><p>原文</p></body>';
  assert.deepEqual(deriveHistorySections('html',before,before.replace('原文','变更')),['报告 / 甲 & 乙']);
});
