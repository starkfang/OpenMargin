import React from 'react';
import { createRoot } from 'react-dom/client';
import WorkspaceLayout from '../src/WorkspaceLayout.jsx';
import '../src/style.css';
import { installGutterWheel } from '../src/gutterWheel.mjs';
import { injectHtmlBridge } from '../src/htmlBridge.js';
const root=createRoot(document.getElementById('root'));
function Fixture(){
  const [outline,setOutline]=React.useState(true),[sidebar,setSidebar]=React.useState(false),[filePath,setFilePath]=React.useState('/fixture.md');
  React.useEffect(()=>{window.switchWorkspaceFixture=setFilePath;return()=>{delete window.switchWorkspaceFixture}},[]);
  const ref=React.useRef(null);
  React.useEffect(()=>{const pane=document.querySelector('.workspace-content-pane');return pane?installGutterWheel(pane,()=>document.querySelector('iframe[title="文档预览"]'),()=>filePath.endsWith('.html')?'html':'md'):undefined},[filePath]);
  const documentHtml='<!doctype html><html><head></head><body><p id="edit-probe" contenteditable="true">原位编辑检查</p><p id="wrap-test">'+('宽度变化时这段正文必须重新换行。'.repeat(60))+'</p>'+Array.from({length:120},(_,i)=>`<p>正文内容 ${i}</p>`).join('')+'</body></html>';
  return <><button aria-label="显示或隐藏大纲" onClick={()=>{if(ref.current?.isOutlineCollapsed()){ref.current.expandOutline();if(!outline)setOutline(true)}else setOutline(!outline)}}>大纲</button><button aria-label="批注" aria-pressed={sidebar} onClick={()=>{if(sidebar)setSidebar(false);else{ref.current?.expandSidebar();setSidebar(true)}}}>批注</button><div style={{height:500,width:'min(1200px, 100%)'}}><WorkspaceLayout ref={ref} filePath={filePath} outlineOpen={outline} sidebarOpen={sidebar} onSidebarCollapse={()=>setSidebar(false)}><div><aside className="outline">大纲内容</aside></div><div><section className="canvas"><iframe key={filePath} sandbox={filePath.endsWith('.html')?'allow-scripts allow-forms':'allow-same-origin'} title="文档预览" srcDoc={filePath.endsWith('.html')?injectHtmlBridge(documentHtml):documentHtml}/></section></div><div><aside className="comments" hidden={!sidebar}><textarea aria-label="草稿" defaultValue="未保存内容"/></aside></div></WorkspaceLayout></div></>;
}
window.renderWorkspaceTest=(sizes)=>{localStorage.setItem('openmargin:workspace:/fixture.md',JSON.stringify(sizes));root.render(<Fixture/>)};
