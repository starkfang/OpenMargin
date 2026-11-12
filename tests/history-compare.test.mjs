import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historyCompare} from '../src/historyCompare.mjs';

test('比较保留两侧完整正文，并准确表示替换、增删与未变行',()=>{
  for(const [before,after] of [['共同\n原句\n尾','共同\n新句\n尾'],['','新增'],['删除',''],['开始\n删除\n尾','开始\n新增一\n新增二\n尾'],['相同','相同']]){
    const result=historyCompare(before,after);
    const left=result.groups.flatMap(g=>g.kind==='same'?g.lines:g.removed).join('\n');
    const right=result.groups.flatMap(g=>g.kind==='same'?g.lines:g.added).join('\n');
    assert.equal(left,before);assert.equal(right,after);
    assert.equal(result.changes===0,before===after);
  }
});

test('大篇幅差异使用保守范围且显式标示',()=>{
  const before=Array.from({length:1500},(_,i)=>`旧${i}`).join('\n');
  const after=Array.from({length:1500},(_,i)=>`新${i}`).join('\n');
  const result=historyCompare(before,after);
  assert.equal(result.coarse,true);
  assert.equal(result.groups[0].removed.join('\n'),before);
  assert.equal(result.groups[0].added.join('\n'),after);
});
