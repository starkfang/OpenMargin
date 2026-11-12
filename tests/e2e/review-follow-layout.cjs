'use strict';
// Isolated Electron window and synthetic files; exercise actual wheel/resize inputs.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),store=require('../../electron/storage.cjs');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-follow-layout-'));let app;
 try{
  const docs=Array.from({length:35},(_,i)=>`第${i+1}段独特引用${String(i+1).padStart(2,'0')}。${'这段正文让长文档保留足够可滚动空间。'.repeat(3)}`);
  const annotations=docs.slice(0,18).map((_,i)=>({id:`n${i+1}`,kind:'text',quote:`独特引用${String(i+1).padStart(2,'0')}`,before:`第${i+1}段`,after:'。这段正文让长文档保留足够可滚动空间。',body:`批注${i+1} ${'这是一条会自动换行的评审意见。'.repeat(i%3+3)}`,createdAt:new Date(2020,0,1,0,0,i).toISOString()}));
  const files=[];
  for(const size of ['short','few','long'])for(const type of ['md','html']){
   const file=path.join(dir,`${size}.${type}`),body=type==='md'?'# 正文跟随\n\n'+docs.join('\n\n'):`<!doctype html><html><head><style>body{padding:32px}p{margin:34px 0;max-width:700px}</style></head><body><h1>正文跟随</h1>${docs.map(p=>`<p>${p}</p>`).join('')}</body></html>`;
   await fs.writeFile(file,store.encode(body,size==='short'?annotations.filter(a=>a.id==='n12').map(a=>({...a,body:'一条简短批注'})):size==='few'?annotations.slice(11,14).map(a=>({...a,body:'简短批注'+a.id})):annotations,type));files.push({file,type,size});
  }
  const packaged=process.env.OPENMARGIN_TEST_APP;app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),files[0].file,`--user-data-dir=${dir}/profile`]});
  const w=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const win=BrowserWindow.getAllWindows()[0],area=screen.getDisplayMatching(win.getBounds()).workArea;win.setBounds({x:area.x+5,y:area.y+5,width:Math.min(1450,area.width-10),height:Math.min(850,area.height-10)});win.show();win.focus()});w.setDefaultTimeout(7000);
  const f=()=>w.frameLocator('iframe[title="文档预览"]'),side=w.locator('aside.comments'),scroll=side.locator('.comments-scroll');
  const mark=n=>f().locator(`[data-om-mark="n${n}"]`).first(),card=n=>side.locator(`#note-n${n}`),switchComments=()=>w.locator('.sidebar-switch').getByRole('button',{name:/^批注/});
  async function open(file){await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]})},file);await w.getByRole('button',{name:'打开文件',exact:true}).click();await w.getByRole('tab',{name:new RegExp(path.basename(file).replace('.','\\.'))}).waitFor();await f().locator('p').first().waitFor();}
  let currentNote=12;
  async function pick(n=currentNote){currentNote=n;if(!await side.isVisible())await switchComments().click();await mark(n).click();await w.waitForTimeout(300);}
  async function state(n=currentNote){
   let boxes;
   for(let attempt=0;attempt<30;attempt++){
    boxes=await Promise.all([mark(n).boundingBox(),card(n).locator('.review-excerpt').boundingBox(),card(n).boundingBox(),scroll.boundingBox()]);
    const [m,c,k,s]=boxes;
    if(m&&c&&k&&s){const quoteY=c.y+Math.min(c.height/2,22),quoteOffset=Math.min(quoteY-k.y,s.height/2);return {...await scroll.evaluate(e=>({top:e.scrollTop,max:e.scrollHeight-e.clientHeight,follow:e.dataset.annotationFollow})),markY:m.y+m.height/2,cardY:quoteY,desired:Math.max(s.y+quoteOffset,Math.min(s.y+s.height-20,m.y+m.height/2))};}
    // Pane reopening briefly replaces preview marks; measure after that reflow.
    await w.waitForTimeout(50);
   }
   throw Error('Missing annotation layout: '+JSON.stringify(boxes));
  }
  async function drag(name,dx){const b=await w.getByRole('separator',{name}).boundingBox();await w.mouse.move(b.x+b.width/2,b.y+180);await w.mouse.down();await w.mouse.move(b.x+b.width/2+dx,b.y+180,{steps:12});await w.mouse.up();await w.waitForTimeout(300);}
  async function wheelBody(delta){const b=await w.locator('iframe[title="文档预览"]').boundingBox();await w.mouse.move(b.x+b.width/2,b.y+b.height/2);await w.mouse.wheel(0,delta);await w.waitForTimeout(350);}
  const failures=[];
  async function aligned(label){let data;for(let i=0;i<30;i++){data=await state();if(data.follow==='true'&&Math.abs(data.cardY-data.desired)<3)return data;await w.waitForTimeout(50);}failures.push(`${label}: ${JSON.stringify(data)}`);console.log('FAIL',failures.at(-1));return data;}
  for(let index=0;index<files.length;index++){
   const {file,type,size}=files[index],label=`${type}/${size}`;
   if(index)await open(file);await mark(12).waitFor();
   if(!await side.isVisible())await switchComments().click();
   const naturalPadding=await scroll.evaluate(e=>{const s=getComputedStyle(e);return {top:parseFloat(s.paddingTop),bottom:parseFloat(s.paddingBottom)};});
   await pick(12);
   await aligned(`${label} selected`);const before=await state();await wheelBody(100);const after=await aligned(`${label} body wheel`);
   if(Math.abs((after.cardY-before.cardY)-(after.markY-before.markY))>3)failures.push(`${label} card did not follow body movement: ${JSON.stringify({before,after})}`);
   await wheelBody(-100);await aligned(`${label} reverse wheel`);
   await drag('调整侧栏宽度',-100);await aligned(`${label} wider sidebar`);
   await drag('调整侧栏宽度',160);await aligned(`${label} narrower sidebar`);
   await switchComments().click();assert.equal(await side.isVisible(),false);await switchComments().click();await aligned(`${label} reopen sidebar`);
   // Manual sidebar intent pauses follow; the next explicit selection resumes it.
   await scroll.hover();await w.mouse.wheel(0,80);await w.waitForTimeout(200);assert.equal(await scroll.getAttribute('data-annotation-follow'),'false',`${label} manual sidebar wheel pauses follow`);const manual=await state();await wheelBody(60);const paused=await state();assert.ok(Math.abs(manual.cardY-paused.cardY)<2,`${label} document must not seize sidebar after manual scroll`);await pick();await aligned(`${label} reselect resumes`);
   await w.getByRole('button',{name:'放大页面'}).click();await aligned(`${label} zoom`);
   await card(12).hover();await card(12).getByRole('button',{name:'编辑批注'}).click();const input=card(12).getByLabel('编辑批注内容');await input.fill('更新后的批注。'.repeat(10));await card(12).getByRole('button',{name:'暂存修改'}).click();await aligned(`${label} staged edit`);
   assert.equal(store.decode(await fs.readFile(file,'utf8'),type).annotations.find(a=>a.id==='n12').body,size==='short'?'一条简短批注':size==='few'?'简短批注n12':annotations[11].body,`${label} staging must not write file`);
   if(size==='few'||size==='long'){await pick(size==='few'?14:18);await aligned(`${label} last card`);const lastBefore=await state();await wheelBody(80);const lastAfter=await aligned(`${label} last card wheel`);assert.ok(Math.abs((lastAfter.cardY-lastBefore.cardY)-(lastAfter.markY-lastBefore.markY))<3,`${label} last card follows document movement`);}
   if(size==='short'){
    async function emptyListAtNaturalPosition(message){
     await scroll.locator('.blank').waitFor();
     await w.waitForFunction(expected=>{const e=document.querySelector('.comments-scroll'),list=e?.querySelector('.comments-list');if(!e||!list)return false;const css=getComputedStyle(e);return Math.abs(parseFloat(css.paddingTop)-expected.top)<1&&Math.abs(parseFloat(css.paddingBottom)-expected.bottom)<1&&Math.abs(e.scrollTop)<1&&Math.abs(list.getBoundingClientRect().top-e.getBoundingClientRect().top-expected.top)<1;},naturalPadding);
     assert.equal(await scroll.locator('.review-card').count(),0,`${message}: no hidden card should occupy the list`);
     assert.equal(await w.locator('svg[data-annotation-connector]').count(),0,`${message}: no stale connector`);
    }
    // Filtering out the selected card must remove alignment space, then restore
    // the same selection and following when the card is shown again.
    await side.getByRole('button',{name:/^无法定位/}).click();
    await scroll.getByText('没有无法定位的批注',{exact:true}).waitFor();
    await emptyListAtNaturalPosition(`${label} filtered selection`);
    await side.getByRole('button',{name:/^全部/}).click();
    await aligned(`${label} filter restored`);
    assert.equal(await card(12).getAttribute('aria-current'),'true',`${label} filter restores selected card`);
    // Deleting the only selected card must not leave follow padding or a ghost
    // selection, and remains staged until the user explicitly saves the file.
    const original=await fs.readFile(file,'utf8');
    await card(12).hover();await card(12).getByRole('button',{name:'删除批注'}).click();
    const confirmation=w.getByRole('alertdialog',{name:'确认操作'});await confirmation.waitFor();await confirmation.getByRole('button',{name:'确认',exact:true}).click();
    await scroll.getByText('还没有批注',{exact:true}).waitFor();
    await emptyListAtNaturalPosition(`${label} deleted selection`);
    assert.equal(await scroll.getAttribute('data-annotation-follow'),'false',`${label} deleting selected card clears following`);
    assert.equal(await fs.readFile(file,'utf8'),original,`${label} deleting a card remains staged`);
   }
   console.log(`CHECKED ${label}: wheel, resize, collapse, manual pause, resume, zoom, staged edit${size==='short'?', filter restore, delete cleanup':''}`);
  }
  assert.deepEqual(failures,[],`Annotation follow layout failures:\n${failures.join('\n')}`);
  console.log('PASS Markdown and HTML annotation following through layout changes, including a single short annotation');
 }finally{if(app)app.process().kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1});
