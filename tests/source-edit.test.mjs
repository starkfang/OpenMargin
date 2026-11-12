import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRenderedText } from '../src/sourceEdit.js';
const edit = (type,source,quote,replacement) => applyRenderedText({type,source,quote,replacement});

test('edits plain Markdown headings, list items and table cells without losing surrounding syntax', () => {
  for (const [source,quote,replacement,expected] of [
    ['# 原标题\n\n内容', '原标题', '新标题', '# 新标题\n\n内容'],
    ['- 旧项目\n- 其他', '旧项目', '新项目', '- 新项目\n- 其他'],
    ['| 旧值 | 第二列 |\n|---|---|', '旧值', '新 | 值', '| 新 \\| 值 | 第二列 |\n|---|---|']
  ]) assert.equal(edit('md',source,quote,replacement).content,expected);
});

test('refuses ambiguous and multi-line Markdown changes', () => {
  assert.ok(edit('md','相同\n\n相同','相同','新内容').error);
  assert.ok(edit('md','一行','一行','两\n行').error);
});
test('Markdown 实体正文不能误改隐藏注释中的同名原文', () => {
  const source='<!-- A&B -->\n\nA&amp;B';
  const result=edit('md',source,'A&B','新 & 内容');
  assert.equal(result.content,'<!-- A&B -->\n\n新 &amp; 内容');
});
test('Markdown 隐藏注释不制造可见文本定位歧义', () => {
  assert.equal(edit('md','<!-- 重复 -->\n\n重复','重复','修改').content,'<!-- 重复 -->\n\n修改');
});
test('CRLF 文档保留原有换行并准确定位实体正文', () => {
  const source='# 标题\r\n\r\n<!-- A&B -->\r\n\r\nA&amp;B\r\n';
  assert.equal(edit('md',source,'A&B','新内容').content,'# 标题\r\n\r\n<!-- A&B -->\r\n\r\n新内容\r\n');
});
test('链接目标、代码和隐藏注释不当作正文来源', () => {
  const source='<!-- 原文 -->\n\n[链接](原文)\n\n`原文`\n\n原文';
  assert.equal(edit('md',source,'原文','新值').content,'<!-- 原文 -->\n\n[链接](原文)\n\n`原文`\n\n新值');
});
test('实体与额外正文混合无法可靠映射时安全拒绝', () => {
  const source='<!-- A&B -->\n\n前缀 A&amp;B 后缀';
  const result=edit('md',source,'A&B','修改');
  assert.ok(result.error);assert.equal(result.content,undefined);
});

test('patches a unique static HTML text node without changing other markup', () => {
  assert.equal(edit('html','<!doctype html><p class="旧字">旧字</p>','旧字','新 & 内容').content,'<!doctype html><p class="旧字">新 &amp; 内容</p>');
});

test('refuses scripted, encoded, ambiguous or missing HTML text', () => {
  for(const [source,quote] of [['<p>旧</p><script>1</script>','旧'],['<p>&amp;</p>','&'],['<p>旧</p><p>旧</p>','旧'],['<p>原文</p>','不存在']]) assert.ok(edit('html',source,quote,'新').error);
});

test('edits exact static target in scripted HTML and distinguishes duplicate text by DOM path', () => {
  const source = '<!doctype html><html><head><script>window.x=1</script></head><body><main><p>重复</p><p>重复</p></main></body></html>';
  const domPath = [{tag:'html',index:0},{tag:'body',index:0},{tag:'main',index:0},{tag:'p',index:1}];
  const result = applyRenderedText({type:'html', source, quote:'重复', replacement:'修改 & 安全', domPath});
  assert.equal(result.content, source.replace('<p>重复</p></main>', '<p>修改 &amp; 安全</p></main>'));
});

test('rejects generated, changed, encoded, structural and invalid DOM targets', () => {
  const source = '<html><body><main><p>静态</p><p>重&amp;要</p><p>嵌套<strong>文字</strong></p></main><script>1</script></body></html>';
  const base = [{tag:'html',index:0},{tag:'body',index:0},{tag:'main',index:0}];
  const check = (quote, tail) => applyRenderedText({type:'html',source,quote,replacement:'新',domPath:[...base,tail]}).error;
  assert.ok(check('动态生成',{tag:'p',index:0}));
  assert.ok(check('静态',{tag:'p',index:99}));
  assert.ok(check('重&要',{tag:'p',index:1}));
  assert.ok(check('嵌套文字',{tag:'p',index:2}));
  assert.ok(applyRenderedText({type:'html',source,quote:'静态',replacement:'新',domPath:[...base,{tag:'p',index:-1}]}).error);
});

const { applyRenderedEdits } = await import('../src/sourceEdit.js');
test('Markdown batch resolves all original positions before applying edits', () => {
  const source='# 标题\n\n第一段\n\n第二段\n\n第三段';
  assert.equal(applyRenderedEdits({type:'md',source,changes:[
    {before:'第一段',after:'第二段'}, {before:'第二段',after:'更长的新段落'}, {before:'第三段',after:'第一段'}
  ]}).content, '# 标题\n\n第二段\n\n更长的新段落\n\n第一段');
});
test('batch rejects overlapping or unmappable changes without partial content', () => {
  for(const changes of [
    [{before:'第一段',after:'已改'},{before:'不存在',after:'新'}],
    [{before:'第一段',after:'已改'},{before:'一段',after:'新'}],
    [{before:'第一段',after:'已改'},{before:'第一段',after:'重复'}]
  ]) {
    const result=applyRenderedEdits({type:'md',source:'第一段\n\n第二段',changes});
    assert.ok(result.error); assert.equal(result.content,undefined);
  }
});
test('HTML batch preserves source markup and scripts while editing repeated nodes', () => {
  const source='<html><body><p>相同</p><p>相同</p><p>第三段</p><script>window.x=1</script></body></html>';
  const p=index=>[{tag:'html',index:0},{tag:'body',index:0},{tag:'p',index}];
  const result=applyRenderedEdits({type:'html',source,changes:[
    {before:'相同',after:'第一 & 修改',domPath:p(0)},
    {before:'相同',after:'第二 <修改>',domPath:p(1)},
    {before:'第三段',after:'',domPath:p(2)}
  ]});
  assert.equal(result.content,'<html><body><p>第一 &amp; 修改</p><p>第二 &lt;修改&gt;</p><p></p><script>window.x=1</script></body></html>');
});
test('batch keeps no-op source identical and rejects malformed drafts', () => {
  const source='正文';
  assert.equal(applyRenderedEdits({type:'md',source,changes:[]}).content,source);
  assert.equal(applyRenderedEdits({type:'md',source,changes:[{before:'正文',after:'正文'}]}).content,source);
  for(const changes of [null,[null],[{}]])assert.ok(applyRenderedEdits({type:'md',source,changes}).error);
});
