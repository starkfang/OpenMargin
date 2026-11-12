'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {createQuitController}=require('../electron/quit-controller.cjs');
function harness(){const a={name:'a',isDestroyed:()=>false},b={name:'b',isDestroyed:()=>false};let watches=true,finishes=0,requests=[],closed=[];let controller;controller=createQuitController({getWindows:()=>[a,b],requestConfirm:w=>requests.push(w.name),closeWindow:w=>closed.push(w.name),finish:()=>{finishes++;assert.equal(controller.begin(),false);watches=false}});return {a,b,controller,requests,closed,get watches(){return watches},get finishes(){return finishes}}}
test('quit cancellation preserves all windows and file watchers',()=>{const h=harness();assert.equal(h.controller.begin(),true);assert.deepEqual(h.requests,['a']);assert.equal(h.controller.confirm(h.a),true);assert.deepEqual(h.requests,['a','b']);assert.deepEqual(h.closed,[]);assert.equal(h.controller.cancel(h.b),true);assert.equal(h.controller.pending(),false);assert.deepEqual(h.closed,[]);assert.equal(h.finishes,0);assert.equal(h.watches,true);});
test('quit closes every window only after all approvals and completes shutdown',()=>{const h=harness();assert.equal(h.controller.begin(),true);assert.equal(h.controller.confirm(h.b),false);assert.deepEqual(h.closed,[]);h.controller.confirm(h.a);h.controller.confirm(h.b);assert.deepEqual(h.closed,['a','b']);assert.equal(h.finishes,1);assert.equal(h.watches,false);assert.equal(h.controller.pending(),false);});
test('a cancelled quit can be requested again',()=>{const h=harness();h.controller.begin();h.controller.cancel(h.a);assert.equal(h.controller.begin(),true);assert.deepEqual(h.requests,['a','a']);h.controller.confirm(h.a);h.controller.confirm(h.b);assert.equal(h.finishes,1)});
test('approved windows cannot change drafts while the next window is being confirmed, and cancellation restores them',()=>{
 const a={name:'a',isDestroyed:()=>false},b={name:'b',isDestroyed:()=>false},events=[];
 const q=createQuitController({getWindows:()=>[a,b],requestConfirm:w=>events.push(`request:${w.name}`),setWindowEnabled:(w,enabled)=>events.push(`${enabled?'enable':'disable'}:${w.name}`),closeWindow:w=>events.push(`close:${w.name}`),finish:()=>events.push('finish')});
 q.begin();q.confirm(a);
 assert.deepEqual(events,['request:a','disable:a','request:b']);
 q.cancel(b);
 assert.deepEqual(events,['request:a','disable:a','request:b','enable:a']);
 assert.equal(q.pending(),false);
});
test('all approved windows stay disabled until programmatic close',()=>{
 const a={name:'a',isDestroyed:()=>false},b={name:'b',isDestroyed:()=>false},events=[];
 const q=createQuitController({getWindows:()=>[a,b],requestConfirm:w=>events.push(`request:${w.name}`),setWindowEnabled:(w,enabled)=>events.push(`${enabled?'enable':'disable'}:${w.name}`),closeWindow:w=>events.push(`close:${w.name}`),finish:()=>events.push('finish')});
 q.begin();q.confirm(a);q.confirm(b);
 assert.deepEqual(events,['request:a','disable:a','request:b','disable:b','close:a','close:b','finish']);
});
test('cancellation skips an approved window that was destroyed while waiting',()=>{
 let destroyed=false;const a={name:'a',isDestroyed:()=>destroyed},b={name:'b',isDestroyed:()=>false},events=[];
 const q=createQuitController({getWindows:()=>[a,b],requestConfirm:w=>events.push(`request:${w.name}`),setWindowEnabled:(w,enabled)=>events.push(`${enabled?'enable':'disable'}:${w.name}`),closeWindow:()=>{},finish:()=>{}});
 q.begin();q.confirm(a);destroyed=true;q.destroyed(a);assert.equal(q.cancel(b),true);
 assert.deepEqual(events,['request:a','disable:a','request:b']);
});
