import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotationConnectorPath, annotationConnectorBounds, connectorCandidates } from '../src/annotationConnector.mjs';
import { connectorClearance } from '../src/connectorClearance.mjs';

test('routes to cards above or below with vertical segment near sidebar', () => {
  assert.equal(annotationConnectorPath({x:10,y:20,endX:110,endY:80}), 'M 10 20 H 84 Q 90 20 90 26 V 74 Q 90 80 96 80 H 110');
  assert.equal(annotationConnectorPath({x:110,y:80,endX:10,endY:20}), 'M 110 80 H 36 Q 30 80 30 74 V 26 Q 30 20 24 20 H 10');
});

test('clamps rounded corners for narrow or shallow gaps', () => {
  assert.equal(annotationConnectorPath({x:0,y:0,endX:4,endY:10}), 'M 0 0 H 1 Q 2 0 2 1 V 9 Q 2 10 3 10 H 4');
  assert.equal(annotationConnectorPath({x:0,y:0,endX:100,endY:2}), 'M 0 0 H 79 Q 80 0 80 1 V 1 Q 80 2 81 2 H 100');
});

test('aligned endpoints have a straight horizontal or vertical line', () => {
  assert.equal(annotationConnectorPath({x:0,y:5,endX:10,endY:5}), 'M 0 5 L 10 5');
  assert.equal(annotationConnectorPath({x:5,y:0,endX:5,endY:10}), 'M 5 0 L 5 10');
});

function fixture(textRects=[],visualRects=[]) {
  let index=0;
  const nodes=textRects.map(r=>({nodeValue:'文字',parentElement:{closest:()=>null},r}));
  const elements=visualRects.map(r=>({localName:'img',complete:true,closest:()=>null,matches:()=>true,getBoundingClientRect:()=>r}));
  return {body:{},fonts:{status:'loaded'},getAnimations:()=>[],createTreeWalker:()=>({nextNode:()=>nodes[index++]||null}),createRange:()=>{let node;return{selectNodeContents:n=>{node=n},getClientRects:()=>[node.r]}},querySelectorAll:()=>elements,defaultView:{getComputedStyle:(_e,pseudo)=>pseudo?{content:'none'}:{backgroundImage:'none'}}};
}
const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
test('only allows line through empty space, including round corner safety area', () => {
  const bounds=annotationConnectorBounds({x:10,y:20,endX:110,endY:80});
  assert.equal(connectorClearance(fixture([rect(0,10,10,30)]),bounds),true);
  assert.equal(connectorClearance(fixture([rect(30,10,50,30)]),bounds),false);
  assert.equal(connectorClearance(fixture([],[rect(88,40,100,60)]),bounds),false);
  assert.equal(connectorClearance(fixture([],[rect(70,22,88,30)]),bounds),false);
});

test('fails closed when layout is uncertain',()=>{
  const doc=fixture();doc.fonts.status='loading';
  assert.equal(connectorClearance(doc,annotationConnectorBounds({x:0,y:0,endX:100,endY:100})),false);
});

test('connector uses a thin red dashed stroke without capturing pointer events', async () => {
  const { readFile } = await import('node:fs/promises');
  const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
  const svg=source.match(/<svg data-annotation-connector[\s\S]*?<\/svg>/)?.[0];
  assert.ok(svg);
  assert.match(svg,/pointerEvents:'none'/);
  assert.match(svg,/stroke="#e5484d"/);
  assert.match(svg,/strokeWidth="1"/);
  assert.match(svg,/strokeDasharray="4 4"/);
});


test('candidates clip each source fragment and keep paths orthogonal',()=>{
  const candidates=connectorCandidates([{left:-20,top:10,right:80,bottom:30},{left:20,top:200,right:40,bottom:220}],{left:0,top:0,right:150,bottom:100},180,70);
  assert.ok(candidates.some(c=>c.side==='right'));assert.ok(candidates.some(c=>c.side==='bottom'));assert.ok(candidates.some(c=>c.side==='top'));
  assert.ok(candidates.every(c=>c.rectIndex===0&&c.x>=0&&c.x<=80&&c.y>=10&&c.y<=30));
  for(const c of candidates){assert.deepEqual(c.points[0],{x:c.x,y:c.y});assert.deepEqual(c.points.at(-1),{x:180,y:70});for(let i=1;i<c.points.length;i++)assert.ok(c.points[i].x===c.points[i-1].x||c.points[i].y===c.points[i-1].y);assert.match(annotationConnectorPath(c),/^M /);assert.ok(annotationConnectorBounds(c).length)}
});

test('an alternate line-gap route avoids a neighboring text obstacle',()=>{
  const bounds={left:0,top:0,right:200,bottom:200},candidates=connectorCandidates([{left:20,top:40,right:100,bottom:60}],bounds,230,110);
  const obstacles=[rect(20,40,100,60),rect(110,40,180,60)];
  const right=candidates.find(c=>c.side==='right');assert.equal(connectorClearance(fixture(obstacles),annotationConnectorBounds(right)),false);
  assert.ok(candidates.some(c=>c.side==='bottom'&&connectorClearance(fixture(obstacles),annotationConnectorBounds(c))));
});

test('multi-segment rounding and bounds fail closed on invalid paths',()=>{
  const candidate={points:[{x:10,y:20},{x:10,y:30},{x:100,y:30},{x:100,y:80},{x:120,y:80}]};
  assert.equal(annotationConnectorPath(candidate),'M 10 20 V 25 Q 10 30 15 30 H 94 Q 100 30 100 36 V 74 Q 100 80 106 80 H 120');
  const b=annotationConnectorBounds(candidate);assert.ok(b.some(r=>r.left<=10&&r.right>=10&&r.top<=30&&r.bottom>=30));
  const bad={points:[{x:0,y:0},{x:10,y:10}]};assert.equal(annotationConnectorPath(bad),'');assert.deepEqual(annotationConnectorBounds(bad),[]);
  assert.deepEqual(connectorCandidates([{left:0,top:0,right:2,bottom:2}],{left:0,top:0,right:10,bottom:10},NaN,2),[]);
});
