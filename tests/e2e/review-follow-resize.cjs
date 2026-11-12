'use strict';

// Synthetic documents and an isolated profile: never use an open user document.
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const store = require('../../electron/storage.cjs');

const root = path.resolve(__dirname, '../..');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'om-follow-resize-'));
  let app;
  try {
    const paragraphs = Array.from({ length: 24 }, (_, i) =>
      `第${i + 1}段：唯一引用${i + 1}，正文示例让页面能够滚动。${'这是正文。'.repeat(10)}`);
    const notes = paragraphs.map((_, i) => ({
      id: `n${i + 1}`, kind: 'text', quote: `唯一引用${i + 1}`,
      before: `第${i + 1}段：`, after: '，正文示例让页面能够滚动。',
      body: `批注 ${i + 1}，${'较长批注内容'.repeat(12)}`,
      createdAt: new Date(2020, 0, 1, 0, 0, i).toISOString(),
    }));
    const tail = Array.from({ length: 12 }, (_, i) => `附录 ${i + 1}：${'保留末条批注后的阅读空间。'.repeat(10)}`);
    const files = { md: path.join(dir, 'follow-resize.md'), html: path.join(dir, 'follow-resize.html') };
    await fs.writeFile(files.md, store.encode('# 阅读跟随\n\n' + [...paragraphs, ...tail].join('\n\n'), notes, 'md'));
    await fs.writeFile(files.html, store.encode('<!doctype html><html><head><style>body{padding:32px}p{margin:34px 0;max-width:560px}</style></head><body><h1>阅读跟随</h1>' + [...paragraphs, ...tail].map(p => `<p>${p}</p>`).join('') + '</body></html>', notes, 'html'));

    const packaged = process.env.OPENMARGIN_TEST_APP;
    app = await electron.launch({ executablePath: packaged || require('electron'), args: [...(packaged ? [] : [root]), files.md, `--user-data-dir=${dir}/profile`] });
    const w = await app.firstWindow();
    const preview = () => w.frameLocator('iframe[title="文档预览"]');
    const scroll = w.locator('.comments-scroll');
    const mark = () => preview().locator('[data-om-mark="n24"]').first();
    const card = () => w.locator('#note-n24');
    const state = () => scroll.evaluate(el => ({ following: el.dataset.annotationFollow, top: el.scrollTop, max: el.scrollHeight - el.clientHeight, height: el.clientHeight }));
    const follow = value => w.waitForFunction(expected => document.querySelector('.comments-scroll')?.dataset.annotationFollow === expected, value);
    const cardY = async () => { const b = await card().locator('.review-excerpt').boundingBox(); return b.y + b.height / 2; };
    const failures = [];

    for (const type of ['md', 'html']) {
      try {
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1450, 600));
        if (type === 'html') {
          await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, files.html);
          await w.getByRole('button', { name: '打开文件', exact: true }).click();
          await w.getByRole('tab', { name: /follow-resize\.html/ }).waitFor();
        }
        await mark().waitFor();
        if (!await scroll.isVisible()) await w.locator('.sidebar-switch').getByRole('button', { name: /^批注/ }).click();
        await mark().click();
        await follow('true');
        await w.waitForTimeout(220);
        // Put the last annotation above its lowest reachable sidebar position.
        // This ensures a genuine browser scroll clamp when the viewport grows.
        await mark().evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - innerHeight / 2));
        await w.waitForTimeout(220);
        const beforeResize = await state();
        assert.ok(Math.abs(beforeResize.top - beforeResize.max) < 2, `${type}: test must start at the sidebar scroll boundary: ${JSON.stringify(beforeResize)}`);

        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1450, 760));
        await w.waitForTimeout(350);
        const resized = await state();
        assert.ok(resized.height > beforeResize.height + 80, `${type}: real window resize must increase sidebar height`);
        assert.equal(resized.following, 'true', `${type}: layout-induced scroll clamping must not pause annotation following; ${JSON.stringify({ beforeResize, resized })}`);

        // Move the same selected anchor into the lower visible area, then scroll
        // the document. Its card must move, without clicking it to re-enable follow.
        await mark().evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - (innerHeight - 24)));
        await w.waitForTimeout(220);
        const beforeScrollY = await cardY();
        await preview().locator('body').evaluate(() => window.scrollBy(0, 110));
        await w.waitForTimeout(220);
        assert.equal((await state()).following, 'true', `${type}: document scroll must preserve following after resize`);
        assert.ok(await cardY() < beforeScrollY - 4, `${type}: the selected card must move upward with the document after resize`);

        // Explicit sidebar scrolling still suspends following. Selection resumes it.
        await scroll.hover();
        await w.mouse.wheel(0, -240);
        await follow('false');
        await w.waitForTimeout(250);
        const manualTop = (await state()).top;
        await preview().locator('body').evaluate(() => window.scrollBy(0, 60));
        await w.waitForTimeout(200);
        assert.ok(Math.abs((await state()).top - manualTop) < 2, `${type}: document scroll must respect manual sidebar position`);
        await mark().click();
        await follow('true');

        // Keyboard navigation is also an explicit request to scroll the sidebar.
        await card().focus();
        await w.keyboard.press('PageDown');
        await follow('false');
        await mark().click();
        await follow('true');
        await card().focus();
        await w.keyboard.press('Meta+ArrowDown');
        await follow('false');
        await mark().click();
        await follow('true');

        // Moving the caret inside an annotation draft is not sidebar scrolling.
        await card().getByRole('button', { name: '编辑批注' }).click();
        const editor = card().getByLabel('编辑批注内容');
        await editor.focus();
        await w.keyboard.press('ArrowLeft');
        assert.equal((await state()).following, 'true', `${type}: textarea caret movement must not suspend following`);
        await card().getByRole('button', { name: '取消', exact: true }).click();
        console.log(`PASS ${type}: window resize preserves follow, document/card movement, mouse/keyboard pause, selection resume and editor caret isolation`);
      } catch (error) { failures.push(error); console.error(error.message); }
    }
    if (failures.length) throw new AggregateError(failures, `${failures.length} follow resize regression(s)`);
  } finally {
    if (app) app.process().kill('SIGKILL');
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
