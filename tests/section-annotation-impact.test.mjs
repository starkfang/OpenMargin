import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

test('section deletion identifies affected and uncertain annotations without touching other sections', async () => {
  const source = (await readFile(new URL('../src/sectionAnnotationImpact.mjs', import.meta.url), 'utf8')).replace('export function', 'window.classifySectionAnnotations = function');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({headless:true, ...(existsSync(chrome) ? {executablePath:chrome} : {})});
  try {
    const page = await browser.newPage();
    await page.setContent('<h1>A</h1><p><mark data-om-mark="a">one</mark></p><h2>A.1</h2><p><mark data-om-area="sub">two</mark></p><h1>B</h1><p><mark data-om-mark="b">three</mark></p>');
    await page.addScriptTag({content: source});
    const actual = await page.evaluate(() => {
      const items = [{id:'a'}, {id:'sub',kind:'area',contentAnchor:{}}, {id:'b'}, {id:'lost'}, {id:'legacy',kind:'area'}];
      return [...window.classifySectionAnnotations(document, 0, items)];
    });
    assert.deepEqual(actual, ['a', 'sub', 'lost', 'legacy']);
    const partial = await page.evaluate(() => [...window.classifySectionAnnotations(document, 0, [{id:'b'}], [], ['b'])]);
    assert.deepEqual(partial, ['b']);
    const invalid = await page.evaluate(() => [...window.classifySectionAnnotations(document, 99, [{id:'a'}, {id:'b'}])]);
    assert.deepEqual(invalid, ['a', 'b']);
    await page.setContent('<h1>A</h1><p><mark data-om-mark="a">one</mark></p><h1></h1><p><mark data-om-mark="b">two</mark></p>');
    const blankBoundary = await page.evaluate(() => [...window.classifySectionAnnotations(document, 0, [{id:'a'}, {id:'b'}])]);
    assert.deepEqual(blankBoundary, ['a']);
  } finally { await browser.close(); }
});
