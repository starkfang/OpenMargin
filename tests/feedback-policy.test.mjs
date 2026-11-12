import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackKind,feedbackDuration} from '../src/feedbackPolicy.mjs';
test('saved, staged, and failed actions have distinct feedback and lifetimes',()=>{
  assert.equal(feedbackKind('已复制'),'success');assert.equal(feedbackDuration('已复制'),2000);
  assert.equal(feedbackKind('已保存'),'success');assert.equal(feedbackDuration('已保存'),2000);
  assert.equal(feedbackKind('批注已添加，请保存文件'),'info');assert.equal(feedbackDuration('批注已添加，请保存文件'),3000);
  assert.equal(feedbackKind('无法在 Markdown 源文件中唯一定位这段文字，请使用源码编辑或批注。'),'error');assert.equal(feedbackDuration('无法在 Markdown 源文件中唯一定位这段文字，请使用源码编辑或批注。'),5000);
  assert.equal(feedbackDuration('文件已在外部更改，请先重新加载。'),5000);
});
