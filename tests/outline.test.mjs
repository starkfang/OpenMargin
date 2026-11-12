import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOutline } from '../src/outline.mjs';

test('blank headings do not shift the indices used for jumping', () => {
  const headings=[{tagName:'H1',textContent:'项目'}, {tagName:'H2',textContent:'   '}, {tagName:'H2',textContent:'目标'}, {tagName:'H3',textContent:'细节'}];
  const outline=extractOutline(headings);
  assert.deepEqual(outline,[{id:0,level:1,text:'项目'},{id:1,level:2,text:'目标'},{id:2,level:3,text:'细节'}]);
  const renderedHeadings=headings.filter(h=>h.textContent.trim());
  for (const item of outline) assert.equal(renderedHeadings[item.id].textContent,item.text);
});
