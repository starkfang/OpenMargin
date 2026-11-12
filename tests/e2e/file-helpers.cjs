'use strict';
const fs = require('node:fs/promises');
// Wait for the actual persisted bytes, not merely the staged UI or a mark render.
async function waitForText(file, text) {
  let contents = '';
  for (let i = 0; i < 150; i++) {
    contents = await fs.readFile(file, 'utf8');
    if (contents.includes(text)) return contents;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for saved text in ${file}: ${text}`);
}
async function waitForAnnotation(file, type, body) {
  const store = require('../../electron/storage.cjs');
  for (let i = 0; i < 150; i++) {
    const raw = await fs.readFile(file, 'utf8');
    if (store.decode(raw, type).annotations.some(a => a.body === body)) return raw;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for saved annotation in ${file}: ${body}`);
}
module.exports = { waitForText, waitForAnnotation };
