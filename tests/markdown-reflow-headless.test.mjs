import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createDocumentZoom } from '../src/documentZoom.js';

test('Markdown 正文跟随预览宽度重新换行，字体缩放保持不变', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const style = source.match(/if \(file\.type === 'md'\) return `<!doctype html><html><head><meta charset="utf-8"><style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(style, '使用实际 Markdown 预览样式');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const installed = await access(chrome).then(() => true, () => false);
  const browser = await chromium.launch({headless:true, ...(installed ? {executablePath:chrome} : {})});
  try {
    const page = await browser.newPage({viewport:{width:1600,height:900}});
    await page.setContent('<iframe style="display:block;width:1100px;height:600px;border:0"></iframe>');
    await page.locator('iframe').evaluate((frame, css) => { frame.srcdoc = `<style>${css}</style><p>${'只有标准编码、单位、标本、部位和方法满足可比条件时，才形成趋势。'.repeat(5)}</p>`; }, style);
    await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('p'));
    await page.locator('iframe').evaluate((frame, factory) => { frame.contentWindow.testZoom = (0,eval)(`(${factory})`)(frame.contentDocument,'markdown'); }, createDocumentZoom.toString());
    const measure = async width => {
      await page.locator('iframe').evaluate((frame, width) => { frame.style.width = `${width}px`; }, width);
      return page.locator('iframe').evaluate(frame => {
        const d=frame.contentDocument, p=d.querySelector('p'), range=d.createRange();
        range.selectNodeContents(p);
        const bodyStyle=d.defaultView.getComputedStyle(d.body);
        return {width:p.getBoundingClientRect().width, height:p.getBoundingClientRect().height, lines:range.getClientRects().length, font:d.defaultView.getComputedStyle(p).fontSize, padding:[bodyStyle.paddingLeft,bodyStyle.paddingRight]};
      });
    };
    for (const [zoom,font] of [[80,'12.8px'],[100,'16px']]) {
      await page.locator('iframe').evaluate((frame, zoom) => frame.contentWindow.testZoom.apply(zoom), zoom);
      const first = await measure(1100), wider = await measure(1450), narrow = await measure(650);
      assert.ok(wider.width > first.width + 300, '大于原有 780px 上限时仍随预览区变宽');
      assert.ok(wider.lines < first.lines && narrow.lines > first.lines, '宽度变化导致真实换行，而非只改变背景宽度');
      assert.ok(wider.height < first.height && narrow.height > first.height, '段落高度随换行变化');
      assert.deepEqual([first.font,wider.font,narrow.font],[font,font,font], `${zoom}% 字体缩放在拖动宽度时保持一致`);
      assert.deepEqual([first.padding,wider.padding,narrow.padding],Array(3).fill(['48px','48px']), '拖动不改变左右内边距');
    }
  } finally { await browser.close(); }
});
