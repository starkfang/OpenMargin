import { installGutterWheel } from '../src/gutterWheel.mjs';
import { injectHtmlBridge } from '../src/htmlBridge.js';
document.body.innerHTML='<div class="om-workspace"><div class="workspace-content-pane"><div class="workspace-content-slot"><div class="canvas"></div></div><div class="workspace-divider-content"></div><textarea aria-label="编辑输入"></textarea></div><aside class="comments">批注</aside></div><style>.workspace-content-pane{width:900px;height:300px;position:relative}.workspace-content-slot,.canvas{height:100%;width:100%}.canvas{display:flex;justify-content:center}iframe{width:400px;height:300px}.workspace-divider-content{position:absolute;width:6px;height:300px;left:720px;top:0}</style>';
const pane=document.querySelector('.workspace-content-pane');let frame,type;
installGutterWheel(pane,()=>frame,()=>type);
window.messages=[];window.addEventListener('message',e=>{if(e.source===frame?.contentWindow)window.messages.push(e.data)});
window.openFixture=next=>{type=next;window.messages=[];frame?.remove();frame=document.createElement('iframe');if(type==='html')frame.sandbox='allow-scripts';const html='<!doctype html><html><head></head><body>'+Array.from({length:100},(_,i)=>'<p>段落 '+i+'</p>').join('')+'</body></html>';frame.srcdoc=type==='html'?injectHtmlBridge(html):html;document.querySelector('.canvas').append(frame)};
window.sendWheel=(selector,options={})=>document.querySelector(selector).dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:120,...options}));
