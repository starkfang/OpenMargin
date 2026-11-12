'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {atomicWrite}=require('../electron/atomicWrite.cjs');
test('history remains complete while its replacement is being written',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-history-atomic-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'history.json'),before=JSON.stringify([{before:'旧'}]),after=JSON.stringify([{before:'旧'},{after:'新'}]);await fs.writeFile(file,before);
 let observed;const io={...fs,writeFile:async(...args)=>{await fs.writeFile(...args);observed=await fs.readFile(file,'utf8')}};await atomicWrite(file,after,io);assert.deepEqual(JSON.parse(observed),JSON.parse(before));assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),JSON.parse(after));assert.deepEqual(await fs.readdir(dir),['history.json']);
});
test('failed replacement preserves the previous history and removes its temporary file',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-history-fail-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'history.json'),before='[{"before":"旧"}]';await fs.writeFile(file,before);const io={...fs,rename:async()=>{throw new Error('rename failed')}};await assert.rejects(atomicWrite(file,'[]',io),/rename failed/);assert.equal(await fs.readFile(file,'utf8'),before);assert.deepEqual(await fs.readdir(dir),['history.json']);
});
