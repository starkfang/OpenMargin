'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'om-md-assets-')),root=path.resolve(__dirname,'../..');let app;try{
 const folder=path.join(dir,'文档 目录'),assets=path.join(folder,'assets');await fs.mkdir(assets,{recursive:true});
 await fs.writeFile(path.join(assets,'相对 图.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="red"/></svg>');
 const file=path.join(folder,'图片.md');await fs.writeFile(file,'# 相对图片\n\n![同目录图片](<assets/相对 图.svg>)\n');
 const packaged=process.env.OPENMARGIN_TEST_APP;app=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),file,'--user-data-dir='+dir+'/profile']});
 const page=await app.firstWindow();await page.getByRole('tab',{name:/图片\.md/}).waitFor();
 const image=page.frameLocator('iframe[title="文档预览"]').locator('img');await image.waitFor();
 await image.evaluate(img=>new Promise((resolve,reject)=>{if(img.complete)return img.naturalWidth?resolve():reject(Error('image failed: '+img.src));img.onload=resolve;img.onerror=()=>reject(Error('image failed: '+img.src))}));
 assert.deepEqual(await image.evaluate(img=>[img.naturalWidth,img.naturalHeight]),[40,20]);
 const expected=require('node:url').pathToFileURL(await fs.realpath(path.join(assets,'相对 图.svg'))).href;
 assert.equal(await image.evaluate(img=>img.src),expected);
 assert.equal(await page.frameLocator('iframe').locator('script').count(),0);
 console.log('PASS packaged Markdown relative image with Chinese filename and spaces');
 }finally{if(app)await app.close();await fs.rm(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
