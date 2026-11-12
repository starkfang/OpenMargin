import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { LAYOUT, defaultWorkspaceSizes, normalizeWorkspaceSizes, resizeWorkspacePane, workspaceGeometry } from './workspaceLayout.mjs';
import './WorkspaceLayout.css';

function readSizes(path) {
  if(!path)return defaultWorkspaceSizes();
  try{return normalizeWorkspaceSizes(JSON.parse(localStorage.getItem('openmargin:workspace:'+path)||'null'))}catch{return defaultWorkspaceSizes()}
}
function Divider({kind, label, value, disabled, style, onStart, onKey}) {
  return <div role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={Math.round(value)} tabIndex={disabled?-1:0} data-workspace-divider={kind} className={'workspace-divider workspace-divider-'+kind} style={style} onPointerDown={onStart} onKeyDown={onKey} />;
}

// All three slots remain mounted and in the same tree position while panes open,
// close, or resize. In particular, the document iframe is never re-created here.
const WorkspaceLayout = forwardRef(function WorkspaceLayout({filePath,outlineOpen,sidebarOpen,onSidebarCollapse,onOutlineVisibilityChange,children}, ref) {
  const [entry,setEntry]=useState(()=>({path:filePath,sizes:readSizes(filePath)}));
  const [width,setWidth]=useState(0), [dragging,setDragging]=useState(false), rootRef=useRef(null), dragRef=useRef(null);
  const mode=sidebarOpen?'review':'reading', sizes=entry.path===filePath?entry.sizes:defaultWorkspaceSizes();
  const current=mode==='review'&&!sizes.reviewInitialized?{...sizes.review,content:sizes.reading.content}:sizes[mode], geometry=workspaceGeometry(width,current,{outlineOpen,sidebarOpen});
  const onSidebarCollapseRef=useRef(onSidebarCollapse);onSidebarCollapseRef.current=onSidebarCollapse;
  const onOutlineVisibilityChangeRef=useRef(onOutlineVisibilityChange);onOutlineVisibilityChangeRef.current=onOutlineVisibilityChange;
  useLayoutEffect(()=>{if(entry.path!==filePath)setEntry({path:filePath,sizes:readSizes(filePath)})},[filePath,entry.path]);
  useLayoutEffect(()=>{if(!sidebarOpen||entry.path!==filePath||entry.sizes.reviewInitialized)return;setEntry(old=>({...old,sizes:{...old.sizes,review:{...old.sizes.review,content:old.sizes.reading.content},reviewInitialized:true}}))},[sidebarOpen,filePath,entry]);
  useLayoutEffect(()=>{if(sidebarOpen&&entry.path===filePath&&current.sidebarCollapsed)onSidebarCollapseRef.current?.()},[sidebarOpen,entry.path,filePath,current.sidebarCollapsed]);
  useLayoutEffect(()=>{onOutlineVisibilityChangeRef.current?.(!!outlineOpen&&!current.outlineCollapsed)},[outlineOpen,current.outlineCollapsed,filePath]);
  useLayoutEffect(()=>{const root=rootRef.current;if(!root)return;const update=()=>setWidth(root.clientWidth);update();const observer=new ResizeObserver(update);observer.observe(root);return()=>observer.disconnect()},[]);
  useEffect(()=>{const cancel=()=>{const drag=dragRef.current;if(!drag)return;dragRef.current=null;const root=rootRef.current;if(root?.hasPointerCapture(drag.id))root.releasePointerCapture(drag.id);setDragging(false)};window.addEventListener('blur',cancel);return()=>{window.removeEventListener('blur',cancel);const drag=dragRef.current;dragRef.current=null;const root=rootRef.current;if(drag&&root?.hasPointerCapture(drag.id))root.releasePointerCapture(drag.id)}},[]);
  useEffect(()=>{if(!filePath||entry.path!==filePath)return;try{localStorage.setItem('openmargin:workspace:'+filePath,JSON.stringify(entry.sizes))}catch{}},[filePath,entry]);
  const setModeSizes=update=>setEntry(old=>{if(old.path!==filePath)return old;return {...old,sizes:{...old.sizes,[mode]:update(old.sizes[mode])}}});
  useImperativeHandle(ref,()=>({isOutlineCollapsed:()=>!!current.outlineCollapsed,expandOutline:()=>setModeSizes(old=>({...old,outlineCollapsed:false})),expandSidebar:()=>setEntry(old=>old.path!==filePath?old:{...old,sizes:{...old.sizes,review:{...old.sizes.review,sidebarCollapsed:false}}})}));
  const start=(pane,e)=>{if(e.button!==0||dragRef.current)return;e.preventDefault();const root=rootRef.current;if(!root)return;root.setPointerCapture(e.pointerId);dragRef.current={pane,id:e.pointerId,x:e.clientX,mode,path:filePath,base:{...current}};setDragging(true)};
  const move=e=>{const drag=dragRef.current;if(!drag||drag.id!==e.pointerId||drag.path!==filePath||drag.mode!==mode)return;const dx=e.clientX-drag.x;if(dx===0){if(drag.moved)setModeSizes(()=>drag.base);return}drag.moved=true;setModeSizes(()=>resizeWorkspacePane({sizes:drag.base,mode,pane:drag.pane,delta:drag.pane==='content'?dx*2:dx,width:rootRef.current?.clientWidth||width,outlineOpen,sidebarOpen}))};
  const end=e=>{const drag=dragRef.current;if(drag?.id!==e.pointerId)return;if((e.type==='pointerup'||(e.type==='lostpointercapture'&&e.buttons===0))&&Number.isFinite(e.clientX)&&drag.path===filePath&&drag.mode===mode&&(e.clientX!==drag.x||drag.moved))move(e);dragRef.current=null;const root=rootRef.current;if(root?.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);setDragging(false)};
  const key=(pane,e)=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const amount=(e.key==='ArrowRight'?1:-1)*(e.shiftKey?40:10);setModeSizes(old=>resizeWorkspacePane({sizes:old,mode,pane,delta:amount,width:rootRef.current?.clientWidth||width,outlineOpen,sidebarOpen}))};
  const divider=(pane,label,value,disabled=false)=><Divider kind={pane} label={label} value={value} disabled={disabled} style={pane==='content'?{left:(geometry.center+geometry.content)/2-3}:undefined} onStart={e=>start(pane,e)} onKey={e=>key(pane,e)}/>;
  const slots=React.Children.toArray(children), outlineCollapsed=outlineOpen&&current.outlineCollapsed, sidebarCollapsed=sidebarOpen&&current.sidebarCollapsed;
  return <main ref={rootRef} className="workspace om-workspace" data-workspace-mode={mode} data-workspace-dragging={dragging?'true':undefined} style={{'--om-content-width':geometry.content+'px'}} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
    <div className="workspace-outline-pane" style={{width:geometry.outline}} data-workspace-pane="outline">
      <div className="workspace-pane-body" hidden={!outlineOpen||outlineCollapsed}>{slots[0]}</div>
    </div>
    {outlineOpen&&!outlineCollapsed&&divider('outline','调整大纲宽度',geometry.outline)}
    <div className="workspace-content-pane" data-workspace-pane="content">
      <div className="workspace-content-slot">{slots[1]}</div>
      {divider('content','调整正文宽度',geometry.content)}
    </div>
    {sidebarOpen&&!sidebarCollapsed&&divider('sidebar','调整侧栏宽度',geometry.sidebar)}
    <div className="workspace-sidebar-pane" style={{width:geometry.sidebar}} data-workspace-pane="sidebar">
      <div className="workspace-pane-body" hidden={!sidebarOpen||sidebarCollapsed}>{slots[2]}</div>
    </div>
  </main>;
});
export default WorkspaceLayout;
