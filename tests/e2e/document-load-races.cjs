'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-load-races-'));let app;try{
 const a=path.join(dir,'first.md'),b=path.join(dir,'slow.md'),c=path.join(dir,'dropped.md');
 for(const [file,title] of [[a,'First'],[b,'Slow'],[c,'Dropped']])await fs.writeFile(file,`# ${title}\n`);
 const packaged=process.env.OPENMARGIN_TEST_APP;app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),b,`--user-data-dir=${dir}/profile`]});
 const w=await app.firstWindow();const tab=name=>w.getByRole('tab',{name:new RegExp(name+'\\.md')});await tab('slow').waitFor();
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},a);await w.getByRole('button',{name:'打开文件',exact:true}).click();await tab('first').waitFor();await w.waitForFunction(()=>[...document.querySelectorAll('[role=tab]')].find(t=>t.textContent.includes('first.md'))?.getAttribute('aria-selected')==='true');
 await app.evaluate(({app},target)=>{const store=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')('./electron/storage.cjs'),read=store.readDocument;globalThis.__slowReadStarted=false;globalThis.__slowReadDone=false;store.readDocument=async file=>{if(file===target){globalThis.__slowReadStarted=true;await new Promise(resolve=>setTimeout(resolve,700));try{return await read(file)}finally{globalThis.__slowReadDone=true}}return read(file)}},await fs.realpath(b));
 async function waitFlag(flag){await app.evaluate(async (_electron,flag)=>{for(let i=0;i<300&&!globalThis[flag];i++)await new Promise(r=>setTimeout(r,10));if(!globalThis[flag])throw Error(flag+' timeout')},flag)}
 async function pending(){await app.evaluate(()=>{globalThis.__slowReadStarted=false;globalThis.__slowReadDone=false});await tab('slow').click();await waitFlag('__slowReadStarted')}
 await w.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='test-drop';document.body.append(input)});await w.locator('#test-drop').setInputFiles(c);
 await pending();await w.evaluate(()=>{const transfer=new DataTransfer();transfer.items.add(document.querySelector('#test-drop').files[0]);document.querySelector('.app').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}))});
 await tab('dropped').waitFor();await waitFlag('__slowReadDone');await w.waitForTimeout(250);assert.equal(await tab('dropped').getAttribute('aria-selected'),'true','拖放新文档后旧读取不能抢回标签');
 await pending();await tab('dropped').getByRole('button',{name:'关闭 dropped.md'}).click();await tab('dropped').waitFor({state:'detached'});await waitFlag('__slowReadDone');await w.waitForTimeout(250);assert.equal(await tab('first').getAttribute('aria-selected'),'true','关闭当前标签后的备用文档不能被旧读取覆盖');
 await w.evaluate(()=>{const transfer=new DataTransfer();transfer.items.add(document.querySelector('#test-drop').files[0]);document.querySelector('.app').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}))});await tab('dropped').waitFor();
 await pending();await tab('slow').getByRole('button',{name:'关闭 slow.md'}).click();await tab('slow').waitFor({state:'detached'});await waitFlag('__slowReadDone');await w.waitForTimeout(250);assert.equal(await tab('slow').count(),0,'已关闭标签不能被旧读取重新打开');assert.equal(await tab('dropped').getAttribute('aria-selected'),'true','关闭未激活标签后保留当前文档');
 console.log('PASS 旧的异步读取不能覆盖拖放、关闭后的备用文档或重新打开已关闭标签');
 }finally{if(app)app.process().kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100})}})().catch(e=>{console.error(e);process.exitCode=1});
