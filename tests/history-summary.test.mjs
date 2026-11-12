import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHistory } from '../src/historySummary.mjs';

test('修改摘要聚焦变化，不被长相同前缀和空行淹没', () => {
  const prefix = '长期相同前缀\n'.repeat(120), suffix = '\n长期相同后缀'.repeat(120);
  const summary = summarizeHistory(prefix + '风险等级：一般' + suffix, prefix + '风险等级：严重' + suffix);
  assert.match(summary.before, /一般/); assert.match(summary.after, /严重/);
  assert.ok(summary.before.length < 200 && summary.after.length < 200);
});
test('纯插入和纯删除使用明确的空侧说明', () => {
  const added = summarizeHistory('', '新增整段');
  assert.match(added.before, /无删除内容/); assert.match(added.after, /新增/);
  const removed = summarizeHistory('删除整段', '');
  assert.match(removed.before, /删除/); assert.match(removed.after, /无新增内容/);
});
test('句内增补的修改前保留原句上下文', () => {
  const summary=summarizeHistory('正常报告：当前报告可解读。','正常报告：当前报告可解读，结果不强行异常。');
  assert.match(summary.before,/正常报告/);
  assert.match(summary.before,/当前报告可解读/);
  assert.doesNotMatch(summary.before,/无删除内容/);
  assert.match(summary.after,/结果不强行异常/);
});
test('长句截断标记省略并保留实际变化', () => {
  const text='长句'.repeat(150)+'旧值'+'结尾'.repeat(150)+'。';
  const summary=summarizeHistory(text,text.replace('旧值','新值'));
  assert.match(summary.before,/旧值/);assert.match(summary.after,/新值/);
  assert.match(summary.before,/…/);assert.ok(summary.before.length<150);
});
test('多处修改均进入摘要，并提示超出展示的变化', () => {
  const summary = summarizeHistory('第一行旧一\n第二行原文\n第三行旧二\n第四行原文\n第五行旧三\n第六行原文\n第七行旧四', '第一行新一\n第二行原文\n第三行新二\n第四行原文\n第五行新三\n第六行原文\n第七行新四');
  assert.match(summary.before, /旧一/); assert.match(summary.after, /新一/);
  assert.match(summary.before, /旧二/); assert.match(summary.after, /新二/);
  assert.ok(summary.omitted >= 1);
});
test('同一句中紧邻的替换合并，不拆成无删除和无新增', () => {
  const summary=summarizeHistory('历史报告时，明确无可用历史。','历史报告时，明确历史资料不足。');
  assert.doesNotMatch(summary.before,/无删除内容/);
  assert.doesNotMatch(summary.after,/无新增内容/);
  assert.match(summary.before,/无可用历史/);
  assert.match(summary.after,/历史资料不足/);
});
test('纯空格和换行变化明确说明，不显示相同的普通文本', () => {
  const space = summarizeHistory('甲乙', '甲 乙');
  assert.match(space.after, /新增空格/);
  const newline = summarizeHistory('甲\n乙', '甲\n\n乙');
  assert.match(newline.after, /新增换行/);
  const removed = summarizeHistory('甲\t乙', '甲乙');
  assert.match(removed.before, /删除制表符/);
});
test('整篇替换摘要有长度上限，原始内容未被修改', () => {
  const before = '旧'.repeat(20000), after = '新'.repeat(20000);
  const summary = summarizeHistory(before, after);
  assert.ok(summary.before.length <= 142 && summary.after.length <= 142);
  assert.equal(before.length, 20000); assert.equal(after.length, 20000);
});
