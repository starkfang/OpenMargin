'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const {inlineHtmlAssets}=require('../electron/html-assets.cjs');
test('HTML resource inlining preserves document source and excludes escaped paths',async()=>{const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'om-assets-'));const root=path.join(tmp,'project');await fs.mkdir(root);await fs.writeFile(path.join(tmp,'secret.js'),'SECRET');await fs.writeFile(path.join(root,'app.js'),'window.loaded=1');await fs.writeFile(path.join(root,'icon.png'),'PNG');await fs.writeFile(path.join(root,'style.css'),'body{background:url(icon.png)}');await fs.symlink(path.join(tmp,'secret.js'),path.join(root,'escape.js'));try{const content='<link href="style.css"><script src="app.js"></script><script src="escape.js"></script><script src="../secret.js"></script>';const out=await inlineHtmlAssets(content,path.join(root,'page.html'));assert.match(out,/data:text\/css;base64,/);assert.match(out,/data:text\/javascript;base64,/);assert.ok(out.includes('escape.js'));assert.ok(out.includes('../secret.js'));assert.ok(!out.includes(Buffer.from('SECRET').toString('base64')));const css=out.match(/data:text\/css;base64,([^"']+)/)[1];assert.match(Buffer.from(css,'base64').toString(),/data:image\/png;base64,/);assert.ok(content.includes('style.css'));}finally{await fs.rm(tmp,{recursive:true,force:true})}});

test('embeds inline styles, srcset, and nested CSS imports without touching scripts or escaped assets', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'om-assets-inline-'));
  const root = path.join(tmp, 'project');
  await fs.mkdir(root);
  try {
    await fs.writeFile(path.join(root, 'one.png'), 'one');
    await fs.writeFile(path.join(root, 'two.png'), 'two');
    await fs.writeFile(path.join(root, 'import.css'), '.imported{background:url(two.png)}');
    await fs.writeFile(path.join(root, 'outer.css'), '@import "import.css"; .outer{background:url(one.png)}');
    await fs.writeFile(path.join(tmp, 'secret.png'), 'PRIVATE');
    await fs.symlink(path.join(tmp,'secret.png'), path.join(root,'secret.png'));
    const html = '<link rel="stylesheet" href="outer.css"><style>.a{background:url(one.png)} .bad{background:url(../secret.png)}</style><div style="background:url(one.png)"></div><img srcset="one.png 1x, two.png 2x"><img srcset="secret.png 1x, ../secret.png 2x"><script>const s="<img src=one.png>";</script>';
    const result = await inlineHtmlAssets(html, path.join(root, 'index.html'));
    const css = Buffer.from(result.match(/href="data:text\/css;base64,([^\"]+)/)[1], 'base64').toString();
    assert.match(css, /@import "data:text\/css;base64,/);
    const imported = Buffer.from(css.match(/@import "data:text\/css;base64,([^\"]+)/)[1], 'base64').toString();
    assert.match(imported, /data:image\/png;base64,dHdv/);
    assert.match(result, /<style>\.a\{background:url\("data:image\/png;base64,b25l"\)\}/);
    assert.match(result, /style="background:url\(&quot;data:image\/png;base64,b25l&quot;\)"/);
    assert.match(result, /srcset="data:image\/png;base64,b25l 1x, data:image\/png;base64,dHdv 2x"/);
    assert.match(result, /srcset="secret.png 1x, ..\/secret.png 2x"/);
    assert.ok(!result.includes(Buffer.from('PRIVATE').toString('base64')));
    assert.ok(result.includes('<script>const s="<img src=one.png>";</script>'));
  } finally { await fs.rm(tmp,{recursive:true,force:true}); }
});
