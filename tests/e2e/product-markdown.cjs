'use strict';
const {waitForAnnotation}=require('./file-helpers.cjs');
const {_electron:electron}=require('playwright'),path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const root=path.resolve(__dirname,'../..');
const watchdog=new Worker(`
 const {parentPort,workerData}=require('node:worker_threads');const fs=require('node:fs');let phase='startup';
 parentPort.on('message',value=>{phase=value});
 setTimeout(()=>{fs.writeSync(2,'FATAL markdown test watchdog expired; phase: '+phase+'\\n');process.kill(process.pid)},workerData);
`,{eval:true,workerData:110000});
async function stage(name,task,timeout=15000){watchdog.postMessage(name);console.log(`START ${name}`);let timer;
 try{const result=await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>{console.error(`TIMEOUT ${name} (${timeout}ms)`);reject(new Error(`Timeout during ${name} (${timeout}ms)`))},timeout)})]);console.log(`PASS ${name}`);return result}
 catch(error){console.error(`FAIL ${name}: ${error.message}`);throw error}finally{clearTimeout(timer)}}
(async()=>{let dir,app,failed=false;try{
 dir=await stage('创建 Markdown 测试目录',()=>fs.mkdtemp(path.join(os.tmpdir(),'om-product-md-')));const file=path.join(dir,'产品介绍与功能指南.md');
 await stage('准备文档与图片',async()=>{await fs.copyFile(path.join(root,'docs','产品介绍与功能指南.md'),file);await fs.cp(path.join(root,'docs','images'),path.join(dir,'images'),{recursive:true})});
 const packaged=process.env.OPENMARGIN_TEST_APP;
 app=await stage('启动 Electron',()=>electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),file,`--user-data-dir=${dir}/data`],timeout:30000}),35000);
 const w=await stage('获取窗口',()=>app.firstWindow());w.on('pageerror',error=>console.error('MARKDOWN_RENDERER_ERROR',error.message.slice(0,500)));w.setDefaultTimeout(10000);const frame=w.frameLocator('iframe[title="文档预览"]');
 await stage('等待文档与 iframe 初始化',async()=>{await frame.getByRole('heading',{name:'OpenMargin · 让内容独立呈现，让反馈准确回流',exact:true}).waitFor();await w.locator('.outline').getByRole('button',{name:/01 · AI 生成之后/}).waitFor();await frame.locator('style[data-om-edit-style]').waitFor({state:'attached'});await frame.locator('body').evaluate(async el=>{const fonts=el.ownerDocument.fonts;if(fonts)await Promise.race([fonts.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('document fonts did not settle')),10000))])})});
 await stage('加载相对图片',async()=>{const img=frame.locator('img').first();await img.evaluate(e=>new Promise((resolve,reject)=>{if(e.complete)return e.naturalWidth?resolve():reject(Error('image failed'));e.onload=resolve;e.onerror=()=>reject(Error('image failed'))}));assert.ok(await img.evaluate(e=>e.naturalWidth>0))});
 await stage('搜索与清除高亮',async()=>{await w.getByPlaceholder('搜索正文').fill('独立呈现');await w.getByLabel('搜索结果').waitFor();await w.getByPlaceholder('搜索正文').fill('');await w.waitForFunction(()=>{const d=document.querySelector('iframe[title="文档预览"]')?.contentDocument;return !!d&&!d.defaultView.CSS?.highlights?.has('openmargin-search')},null,{timeout:10000})});
 const selected=frame.getByText('一次原本很直接的评审',{exact:false}).first();
 await stage('稳定选区位置',async()=>{await selected.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));let previous=null,stable=0,geometry=null;for(let i=0;i<50&&stable<4;i++){geometry=await selected.evaluate(el=>{const r=el.getBoundingClientRect(),v=el.ownerDocument.defaultView;return {x:r.x,y:r.y,width:r.width,height:r.height,scrollY:v.scrollY,viewportHeight:v.innerHeight}});const current=[geometry.x,geometry.y,geometry.width,geometry.height,geometry.scrollY];stable=previous&&current.every((n,j)=>Math.abs(n-previous[j])<0.25)?stable+1:0;previous=current;if(stable<4)await new Promise(resolve=>setTimeout(resolve,100))}assert.ok(stable>=4&&geometry.y>=0&&geometry.y<geometry.viewportHeight,`文档选区位置未稳定: ${JSON.stringify(geometry)}`)});
 // A real selection focuses the iframe; a synthetic mouseup alone does not.
 await stage('聚焦预览',async()=>{await frame.locator('body').evaluate(el=>{if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','-1');el.focus({preventScroll:true})});await w.waitForFunction(()=>document.activeElement?.getAttribute('title')==='文档预览',null,{timeout:10000})});
 await stage('选择文档文字',()=>selected.evaluate(el=>{const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode())if(n.nodeValue.includes('一次原本很直接的评审')){const i=n.nodeValue.indexOf('一次原本很直接的评审'),r=document.createRange();r.setStart(n,i);r.setEnd(n,i+'一次原本很直接的评审'.length);const s=document.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return}throw Error('sample selection not found')}));
 const pop=w.locator('.annotation-popover');
 await stage('等待选区工具条',async()=>{try{await pop.waitFor()}catch(error){const diagnostic=await w.evaluate(()=>{const f=document.querySelector('iframe[title="文档预览"]'),d=f?.contentDocument,r=d?.getSelection()?.rangeCount?d.getSelection().getRangeAt(0).getBoundingClientRect():null,b=document.querySelector('[aria-label="划词批注"]');return {selectionLength:d?.getSelection()?.toString().length||0,scrollY:d?.defaultView.scrollY,documentReady:d?.readyState,frameFocused:document.activeElement===f,modeClass:b?.className,popupAttached:!!document.querySelector('.annotation-popover'),range:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null}}).catch(()=>null);console.error('MARKDOWN_SELECTION_DIAGNOSTIC',JSON.stringify(diagnostic));throw error}});
 await stage('暂存文档批注',async()=>{if(await pop.getByRole('button',{name:'自定义批注'}).isVisible())await pop.getByRole('button',{name:'自定义批注'}).click();await pop.getByPlaceholder('写下你的想法或修改建议…').fill('演示评审：补充展示到修改的工作流程。');await pop.getByRole('button',{name:'添加批注'}).click();await pop.waitFor({state:'hidden'})});
 await stage('点击保存',()=>w.getByRole('button',{name:'保存',exact:true}).click());
 await stage('验证磁盘批注',()=>waitForAnnotation(file,'md','演示评审：补充展示到修改的工作流程。'));
 console.log('PASS 产品介绍 Markdown 大纲、搜索、相对图片与批注持久化');
 }catch(error){failed=true;console.error('MARKDOWN_TEST_ERROR',error.stack||String(error))}finally{
  if(app){try{await stage('关闭 Electron',()=>app.close(),5000)}catch{failed=true;console.error('CLEANUP forced Electron termination');app.process().kill()}}
  if(dir){try{await stage('删除临时目录',()=>fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100}),8000)}catch{failed=true}}
  await watchdog.terminate();
 }
 if(failed)process.exit(1);
})().catch(e=>{console.error('MARKDOWN_TEST_FATAL',e.stack||String(e));process.exit(1)});
