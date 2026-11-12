import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkspaceSizes, normalizeWorkspaceSizes, resizeWorkspacePane, workspaceGeometry } from '../src/workspaceLayout.mjs';

const reading=defaultWorkspaceSizes().reading, review=defaultWorkspaceSizes().review;
const geometry=(sizes,width=1500,sidebarOpen=false)=>workspaceGeometry(width,sizes,{outlineOpen:true,sidebarOpen});
const resize=(sizes,pane,delta,width=1500,mode='reading')=>resizeWorkspacePane({sizes,pane,delta,width,mode,outlineOpen:true,sidebarOpen:mode==='review'});

test('reading outline uses gutter first, then narrows the document without losing its width preference',()=>{
  const before=geometry(reading),after=resize(reading,'outline',100);
  assert.equal(after.outline,344);assert.equal(geometry(after).content,before.content);
  const narrow=geometry(reading,850),wider=resize(reading,'outline',100,850);
  assert.equal(wider.outline,344);assert.equal(geometry(wider,850).content,narrow.content-100);
  assert.equal(wider.content,reading.content,'正文偏好不因暂时挤压而改变');
  const restored=resize(wider,'outline',-100,850);
  assert.equal(geometry(restored,850).content,narrow.content);
  assert.equal(geometry(wider,1500).content,reading.content,'窗口变宽后恢复偏好');
  const capped=resize(reading,'outline',10000);assert.equal(geometry(capped).content,200);
});
test('document width resize keeps outline unchanged and respects available space',()=>{
  const result=resize(reading,'content',-250);assert.equal(result.outline,reading.outline);assert.equal(geometry(result).content,700);
  assert.equal(resize(reading,'content',-5000).content,200);assert.equal(resize(reading,'content',5000).content,geometry(reading).center);
});
test('review dividers affect only adjacent panes and clamp content to 200px',()=>{
  const left=resize(review,'outline',100,1200,'review');assert.equal(left.sidebar,review.sidebar);assert.equal(left.outline,344);
  assert.equal(left.content,review.content);assert.equal(geometry(left,1200,true).content,geometry(review,1200,true).content-100);
  const right=resize(review,'sidebar',-100,1200,'review');assert.equal(right.outline,review.outline);assert.equal(right.sidebar,420);
  const extreme=resize(review,'sidebar',-10000,850,'review');assert.ok(geometry(extreme,850,true).center>=200);
});
test('dragging the outline closed removes its width and divider, preserving the expanded width',()=>{
  const leftEdge=resize(reading,'outline',-84);assert.equal(leftEdge.outline,160);assert.equal(leftEdge.outlineCollapsed,false);
  const leftSnap=resize(reading,'outline',-124);assert.equal(leftSnap.outlineCollapsed,true);assert.equal(leftSnap.outline,244);assert.equal(geometry(leftSnap).outline,0);
  assert.equal(geometry(leftSnap).center,1500);assert.equal(geometry(leftSnap).content,geometry(reading).content);
  assert.equal(geometry({...leftSnap,outlineCollapsed:false}).outline,244);
  const narrowSnap=resize(reading,'outline',-124,850);assert.equal(narrowSnap.content,reading.content,'窄窗口收起时不覆盖正文宽度偏好');
  const rightEdge=resize(review,'sidebar',80,1500,'review');assert.equal(rightEdge.sidebar,240);assert.equal(rightEdge.sidebarCollapsed,false);
  const rightSnap=resize(review,'sidebar',120,1500,'review');assert.equal(rightSnap.sidebarCollapsed,true);assert.equal(rightSnap.sidebar,320);assert.equal(geometry(rightSnap,1500,true).sidebar,0);
  assert.equal(geometry({...rightSnap,sidebarCollapsed:false},1500,true).sidebar,320);
});
test('stored modes are separate and malformed stored widths are normalized',()=>{
  const saved=normalizeWorkspaceSizes({reading:{outline:300,content:720},review:{outline:-3,content:NaN,sidebar:400,sidebarCollapsed:true},reviewInitialized:true});
  assert.equal(saved.reading.outline,300);assert.equal(saved.reading.content,720);assert.equal(saved.review.outline,160);assert.equal(saved.review.sidebar,400);assert.equal(saved.review.sidebarCollapsed,true);assert.equal(saved.reviewInitialized,true);
});
test('legacy collapsed outline occupies no pixels and retains both mode widths',()=>{
  const saved=normalizeWorkspaceSizes({reading:{outline:310,content:700,outlineCollapsed:true},review:{outline:280,content:650,sidebar:320,outlineCollapsed:true},reviewInitialized:true});
  assert.equal(geometry(saved.reading).outline,0);
  assert.equal(geometry(saved.review,1500,true).outline,0);
  assert.equal(geometry({...saved.reading,outlineCollapsed:false}).outline,310);
  assert.equal(geometry({...saved.review,outlineCollapsed:false},1500,true).outline,280);
  assert.equal(geometry({...saved.review,sidebarCollapsed:true},1500,true).sidebar,0);
});
