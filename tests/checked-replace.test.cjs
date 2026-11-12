'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checkedReplace}=require('../electron/checkedReplace.cjs');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const failure=code=>Object.assign(new Error(code),{code});
test('Windows transient rename locks retry with a fresh hash check on every attempt',async()=>{
 let attempts=0,reads=0;const delays=[];
 const io={readFile:async()=>{reads++;return 'original'},rename:async()=>{if(++attempts<3)throw failure('EPERM')}};
 await checkedReplace('temporary','document',hash('original'),{io,platform:'win32',delay:async ms=>delays.push(ms)});
 assert.equal(attempts,3);assert.equal(reads,3);assert.deepEqual(delays,[50,100]);
});
test('an external edit during a transient lock is never overwritten',async()=>{
 let attempts=0,reads=0;const io={readFile:async()=>++reads===1?'original':'external edit',rename:async()=>{attempts++;throw failure('EBUSY')}};
 await assert.rejects(checkedReplace('temporary','document',hash('original'),{io,platform:'win32',delay:async()=>{}}),/FILE_CONFLICT/);
 assert.equal(attempts,1);assert.equal(reads,2);
});
test('Windows persistent lock stops after a bounded number of attempts',async()=>{
 let attempts=0;const io={readFile:async()=>'original',rename:async()=>{attempts++;throw failure('EACCES')}};
 await assert.rejects(checkedReplace('temporary','document',hash('original'),{io,platform:'win32',delay:async()=>{}}),{code:'EACCES'});
 assert.equal(attempts,8);
});
test('other platforms and non-lock errors are not retried',async()=>{
 for(const [platform,code] of [['darwin','EPERM'],['win32','ENOSPC']]){let attempts=0;const io={readFile:async()=>'original',rename:async()=>{attempts++;throw failure(code)}};await assert.rejects(checkedReplace('temporary','document',hash('original'),{io,platform,delay:async()=>{}}),{code});assert.equal(attempts,1)}
});
