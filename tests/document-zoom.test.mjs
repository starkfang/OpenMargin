import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentZoom } from '../src/documentZoom.js';

function fakeDocument(initialZoom = '1', inlineZoom = '') {
  const values = new Map();
  if (inlineZoom) values.set('zoom', inlineZoom);
  const root = { style: {
    getPropertyValue: name => values.get(name) || '',
    getPropertyPriority: () => '',
    setProperty: (name, value) => values.set(name, value),
    removeProperty: name => values.delete(name),
  }};
  const sheets = [];
  return { documentElement: root, head: { appendChild: sheet => sheets.push(sheet) }, createElement: () => ({}), defaultView: { getComputedStyle: () => ({ zoom: initialZoom }) }, values, sheets };
}

test('Markdown zoom changes font scale, keeps point coordinates and page zoom unchanged', () => {
  const doc = fakeDocument();
  const zoom = createDocumentZoom(doc, 'markdown');
  assert.equal(zoom.apply(120), 120);
  assert.equal(doc.values.get('--openmargin-text-scale'), '1.2');
  assert.equal(doc.values.has('zoom'), false);
  assert.equal(zoom.scale(), 1);
  assert.deepEqual(zoom.point(102, 204), { x: 102, y: 204 });
  assert.match(doc.sheets[0].textContent, /h1.*30px/s);
  assert.match(doc.sheets[0].textContent, /table, pre, code/);
  zoom.apply(100);
  assert.equal(doc.values.get('--openmargin-text-scale'), '1');
});

test('HTML zoom preserves existing page zoom and restores it at 100%', () => {
  const doc = fakeDocument('1.1', '1.1');
  const zoom = createDocumentZoom(doc);
  assert.equal(zoom.apply(120), 120);
  assert.equal(Number(doc.values.get('zoom')), 1.32);
  assert.ok(Math.abs(zoom.point(132, 264).x - 100) < 1e-9);
  zoom.apply(100);
  assert.equal(doc.values.get('zoom'), '1.1');
});
