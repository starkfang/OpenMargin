import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMarkdownSection } from '../src/markdownSections.mjs';

const outline = (...values) => values.map(([level, text], id) => ({id, level, text}));

test('selects a chapter and its descendants, preserving original CRLF and duplicate titles', () => {
  const source = '# Title\r\n\r\n## Same\r\nfirst\r\n### Child\r\nbody\r\n## Same\r\nlast\r\n';
  const headings = outline([1,'Title'],[2,'Same'],[3,'Child'],[2,'Same']);
  const first = resolveMarkdownSection(source, headings, 1);
  assert.equal(first.raw, '## Same\r\nfirst\r\n### Child\r\nbody\r\n');
  assert.equal(resolveMarkdownSection(source, headings, 3).raw, '## Same\r\nlast\r\n');
  assert.equal(source.slice(0, first.start) + source.slice(first.end), '# Title\r\n\r\n## Same\r\nlast\r\n');
});

test('ignores code headings and recognizes setext and inline formatted headings', () => {
  const source = 'Start\n=====\n\n```md\n## fake\n```\n\nMiddle *em*\n-----------\nbody\n\n## Next\n';
  const headings = outline([1,'Start'],[2,'Middle em'],[2,'Next']);
  assert.equal(resolveMarkdownSection(source, headings, 1).raw, 'Middle *em*\n-----------\nbody\n\n');
  assert.match(resolveMarkdownSection(source, headings, 0).raw, /## fake/);
});

test('blank headings still terminate a section at the same level', () => {
  const source = '## A\nbody\n##\nother\n## B\n';
  assert.equal(resolveMarkdownSection(source, outline([2,'A'],[2,'B']), 0).raw, '## A\nbody\n');
});

test('link definitions remain in their source location without moving later headings', () => {
  const source = '# [Name][x]\n\n[x]: /url\n\n## Next\ntext\n';
  const headings = outline([1,'Name'],[2,'Next']);
  assert.equal(resolveMarkdownSection(source, headings, 1).raw, '## Next\ntext\n');
  assert.equal(resolveMarkdownSection(source, headings, 0).raw, source);
});

test('refuses stale outlines, raw HTML and nested container headings', () => {
  assert.equal(resolveMarkdownSection('## A\n', outline([2,'B']), 0), null);
  assert.equal(resolveMarkdownSection('<h2>A</h2>\n', outline([2,'A']), 0), null);
  assert.equal(resolveMarkdownSection('> ## A\n', outline([2,'A']), 0), null);
});
