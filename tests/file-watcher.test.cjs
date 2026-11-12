'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {watchFile}=require('../electron/fileWatcher.cjs');
const {atomicWrite}=require('../electron/atomicWrite.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(predicate,message){const until=Date.now()+3000;while(Date.now()<until){if(predicate())return;await sleep(20)}throw new Error(message)}
test('轮询单个文件可发现原子替换、删除和恢复；关闭后不再通知',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-file-watch-')),file=path.join(dir,'文档.md');let watcher;
 try{
  await fs.writeFile(file,'原文');let count=0;
  watcher=watchFile(file,()=>count++,{interval:40,debounce:15});
  await sleep(120);
  await atomicWrite(file,'原子保存后的内容');
  await waitFor(()=>count>=1,'未发现原子替换');await sleep(80);const saved=count;
  await fs.unlink(file);await waitFor(()=>count>saved,'未发现删除');await sleep(80);const removed=count;
  await fs.writeFile(file,'重新创建的文件');await waitFor(()=>count>removed,'未发现恢复');await sleep(80);
  watcher.close();watcher.close();const closed=count;
  await atomicWrite(file,'关闭之后的新内容');await sleep(180);
  assert.equal(count,closed,'关闭后不触发回调');
 }finally{watcher?.close();await fs.rm(dir,{recursive:true,force:true})}
});
test('指定仅轮询文件、非持久运行，close 取消防抖并只移除自己的监听',async()=>{
 let listener,unwatched,called=0,options;
 const io={watchFile(file,opts,cb){assert.equal(file,'/authorized/document.md');options=opts;listener=cb},unwatchFile(file,cb){unwatched={file,cb}}};
 const watcher=watchFile('/authorized/document.md',()=>called++,{interval:50,debounce:30,io});
 assert.deepEqual(options,{interval:50,persistent:false});
 const base={dev:1,ino:2,mode:33188,nlink:1,size:1,mtimeMs:10,ctimeMs:10};
 listener({...base,ino:3},base);watcher.close();
 await sleep(60);assert.equal(called,0);
 assert.equal(unwatched.file,'/authorized/document.md');assert.equal(unwatched.cb,listener);
});
test('初次读取即缺失时仍发变更提示',async()=>{
 let listener,called=0;
 const io={watchFile(_file,_opts,cb){listener=cb},unwatchFile(){}};
 const watcher=watchFile('/authorized/missing.md',()=>called++,{debounce:5,io});
 const absent={dev:0,ino:0,mode:0,nlink:0,size:0,mtimeMs:0,ctimeMs:0};
 try{listener(absent,absent);await sleep(25);assert.equal(called,1)}finally{watcher.close()}
});
