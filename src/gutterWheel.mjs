// Forward wheel gestures over the document's surrounding empty space only.
export function normalizeGutterWheel(event, width, height) {
  if (!event || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return null;
  const x=Number(event.deltaX),y=Number(event.deltaY);
  if(!Number.isFinite(x)||!Number.isFinite(y)||(!x&&!y))return null;
  const mode=Number(event.deltaMode)||0;
  if(mode!==0&&mode!==1&&mode!==2)return null;
  const w=Number.isFinite(width)&&width>0?width:800,h=Number.isFinite(height)&&height>0?height:600;
  return {x:x*(mode===1?16:mode===2?w:1),y:y*(mode===1?16:mode===2?h:1)};
}

export function installGutterWheel(pane, getFrame, getType) {
  const onWheel=event=>{
    const ElementClass=pane.ownerDocument.defaultView.Element,target=event.target;
    if(!(target instanceof ElementClass)||!target.matches('.workspace-content-pane,.workspace-content-slot,.canvas,.workspace-divider-content'))return;
    if(pane.closest('[data-workspace-dragging="true"]'))return;
    const frame=getFrame(),type=getType();
    if(!frame?.isConnected||!frame.contentWindow||!['md','html'].includes(type))return;
    const delta=normalizeGutterWheel(event,frame.clientWidth,frame.clientHeight);if(!delta)return;
    if(type==='md'){
      try{frame.contentWindow.scrollBy({left:delta.x,top:delta.y,behavior:'auto'})}catch{return}
    }else frame.contentWindow.postMessage({channel:'openmargin:host',type:'scroll-by',x:delta.x,y:delta.y},'*');
    event.preventDefault();
  };
  pane.addEventListener('wheel',onWheel,{passive:false});
  return ()=>pane.removeEventListener('wheel',onWheel);
}
