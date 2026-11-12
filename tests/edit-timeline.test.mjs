import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startEditTimeline,recordEdit,stepEdit,breakEditGroup,timelineKnownChanges } from '../src/editTimeline.mjs';

test('typing coalesces, paste and position changes form separate undo steps',()=>{
 let t=startEditTimeline('source','');
 t=recordEdit(t,'a',{inputType:'insertText',groupKey:'source',at:100});t=recordEdit(t,'ab',{inputType:'insertText',groupKey:'source',at:200});
 assert.equal(t.past.length,1);t=recordEdit(t,'ab paste',{inputType:'insertFromPaste',groupKey:'source',at:210});assert.equal(t.past.length,2);
 t=stepEdit(t);assert.equal(t.present,'ab');t=stepEdit(t);assert.equal(t.present,'');t=stepEdit(t,true);assert.equal(t.present,'ab');
 t=recordEdit(breakEditGroup(t),'ac',{inputType:'insertText',groupKey:'source',at:220});assert.equal(t.future.length,0);
});
test('inline history groups per block and preserves prior snapshots independently',()=>{
 const a={before:'A',after:'A1',domPath:[{tag:'p',index:0}]},b={before:'B',after:'B1',domPath:[{tag:'p',index:1}]};
 let t=startEditTimeline('inline',[]);t=recordEdit(t,[a],{inputType:'insertText',groupKey:'A',at:100});t=recordEdit(t,[a,b],{inputType:'insertText',groupKey:'B',at:110});
 let u=stepEdit(t);assert.deepEqual(u.present,[a]);u=stepEdit(u);assert.deepEqual(u.present,[]);assert.equal(timelineKnownChanges(u).length,2);
 u=stepEdit(u,true);assert.deepEqual(u.present,[a]);assert.deepEqual(t.present,[a,b]);
});
test('unchanged snapshots do not create dirty history, timeout ends groups',()=>{
 let t=startEditTimeline('source','A');t=recordEdit(t,'A');assert.equal(t.past.length,0);
 t=recordEdit(t,'AB',{inputType:'insertText',groupKey:'p',at:1});t=recordEdit(t,'ABC',{inputType:'insertText',groupKey:'p',at:900});assert.equal(t.past.length,2);t=stepEdit(t);assert.equal(t.present,'AB');t=stepEdit(t);assert.equal(t.present,'A');
});
