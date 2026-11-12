import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActiveDocumentDebouncer } from '../src/changeDebouncer.mjs';

test('a background-file event cannot cancel the active-file refresh', () => {
  let active = 'a.md', next = 0;
  const pending = new Map(), refreshed = [];
  const d = createActiveDocumentDebouncer({getActivePath:()=>active,onChange:path=>refreshed.push(path),schedule:fn=>{const id=++next;pending.set(id,fn);return id},cancel:id=>pending.delete(id)});
  d.notify('a.md');
  d.notify('b.md');
  for (const fn of pending.values()) fn();
  assert.deepEqual(refreshed,['a.md']);
});

test('repeated active events coalesce, and switching away suppresses a stale refresh', () => {
  let active = 'a.md', next = 0;
  const pending = new Map(), refreshed = [];
  const d = createActiveDocumentDebouncer({getActivePath:()=>active,onChange:path=>refreshed.push(path),schedule:fn=>{const id=++next;pending.set(id,fn);return id},cancel:id=>pending.delete(id)});
  d.notify('a.md');d.notify('a.md');
  assert.equal(pending.size,1);
  active='b.md';for (const fn of pending.values()) fn();
  assert.deepEqual(refreshed,[]);
});
