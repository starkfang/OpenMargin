import { selectionContext } from './selectionAnchor.mjs';
import { createSearchEngine } from './searchEngine';
import { createDocumentZoom } from './documentZoom';
import { connectorClearance } from './connectorClearance.mjs';
import { createContentArea } from './contentArea.mjs';
// Runs inside the opaque-origin HTML sandbox. Messages contain only display data;
// the host must validate all messages and never persist changes without a user action.
function previewBridge(searchEngine, zoomFactory, checkConnector, contentAreaFactory, selectionContext) {
  'use strict';
  const send=(type,data={})=>parent.postMessage({channel:'openmargin:preview',type,...data},'*');
  let mode='text', drag=null, editing=null, editEntries=[], editConflict=false, observer=null, hostDirty=false, lastItems=[], zoomControl=null, copySelectionRaw=null, copySelectionGeneration=0;
  const contentArea=contentAreaFactory(document);
  let activeNote=null,draftAnchor=null,editRegistry=new Map();
  const draftStyle=document.createElement('style');draftStyle.textContent='::highlight(openmargin-area-draft){background:#dceaff;color:inherit}';(document.head||document.documentElement).append(draftStyle);
  const zoom=()=>zoomControl||(zoomControl=zoomFactory(document));
  const headings=()=>Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(h=>h.textContent.trim());
  const outline=()=>send('outlines',{headings:headings().map((h,i)=>({id:i,level:+h.tagName.slice(1),text:h.textContent.trim().slice(0,1000)}))});
  const ignore=n=>n.parentElement?.closest('script,style,noscript,textarea,[data-om-area]:not(mark),[data-om-draft]');
  function textMap(){const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n,full='',nodes=[];while((n=w.nextNode()))if(!ignore(n)){nodes.push({n,start:full.length,end:full.length+n.length});full+=n.nodeValue}return {full,nodes}}
  function match(quote,before,after){if(!quote||typeof before!=='string'||typeof after!=='string')return null;const {full,nodes}=textMap(), candidates=[];let p=-1;while((p=full.indexOf(quote,p+1))>=0)candidates.push(p);const matches=candidates.filter(p=>(before?full.slice(Math.max(0,p-before.length),p)===before:p===0)&&(after?full.slice(p+quote.length,p+quote.length+after.length)===after:p+quote.length===full.length));if(matches.length!==1)return null;const at=matches[0],a=nodes.find(x=>at>=x.start&&at<x.end),b=nodes.find(x=>at+quote.length>x.start&&at+quote.length<=x.end);if(!a||!b)return null;const range=document.createRange();range.setStart(a.n,at-a.start);range.setEnd(b.n,at+quote.length-b.start);return range}
  function wrap(range,id){const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT), hits=[];let n;while((n=w.nextNode())){if(ignore(n)||!range.intersectsNode(n))continue;const start=n===range.startContainer?range.startOffset:0,end=n===range.endContainer?range.endOffset:n.length;if(end>start)hits.push({n,start,end})}for(const h of hits.reverse()){const r=document.createRange();r.setStart(h.n,h.start);r.setEnd(h.n,h.end);const m=document.createElement('mark');m.dataset.omMark=id;m.style.cssText='background:#fff1a8;color:inherit;cursor:pointer';r.surroundContents(m);m.addEventListener('click',()=>send('note-click',{id,rect:rect(m.getBoundingClientRect())}))}return !!hits.length}
  const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
  function unwrapAreaMarks(){document.querySelectorAll('[data-om-area]').forEach(e=>{if(e.localName==='mark')e.replaceWith(...e.childNodes);else e.remove()})}
  function updateActiveNote(){for(const el of document.querySelectorAll('mark[data-om-mark],mark[data-om-area]')){const active=!!activeNote&&(el.dataset.omMark===activeNote||el.dataset.omArea===activeNote);if(active)el.dataset.omActive='true';else delete el.dataset.omActive;el.style.background=active?'#ffe1e3':el.dataset.omArea?'#dceaff':'#fff1a8';el.style.boxShadow=active?'inset 0 -2px #e5484d':''}}
  function wrapArea(range,id){
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),hits=[];let n;
    while((n=w.nextNode())){if(ignore(n)||!range.intersectsNode(n))continue;const start=n===range.startContainer?range.startOffset:0,end=n===range.endContainer?range.endOffset:n.length;if(end>start)hits.push({n,start,end})}
    for(const h of hits.reverse()){
      const r=document.createRange();r.setStart(h.n,h.start);r.setEnd(h.n,h.end);
      const m=document.createElement('mark');m.dataset.omArea=id;m.setAttribute('role','button');m.setAttribute('aria-label','查看区域批注');m.tabIndex=0;m.style.cssText='background:#dceaff;color:inherit;cursor:pointer;border-bottom:1px solid #3370ff';
      r.surroundContents(m);
      const open=e=>{e.preventDefault();e.stopPropagation();send('note-click',{id,rect:rect(m.getBoundingClientRect())})};
      m.addEventListener('click',open);m.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')open(e)});
    }
    return !!hits.length;
  }
  function marks(items){
    lastItems=Array.isArray(items)?items:[];if(mode==='edit')return;
    observer?.disconnect();
    document.querySelectorAll('[data-om-mark]').forEach(e=>e.replaceWith(...e.childNodes));unwrapAreaMarks();
    const missing=[],partial=[];
    for(const item of lastItems.slice(0,5000)){
      if(item.kind==='area'&&item.contentAnchor){
        try{const result=contentArea.resolve(item.contentAnchor);if(result.status==='missing'){missing.push(item.id);continue}if(result.status==='partial')partial.push(item.id);for(const range of [...result.ranges].reverse())wrapArea(range,item.id)}catch{missing.push(item.id)}
      }else if(item.kind==='area'){
        if(item.validArea===false||!item.area||(item.area.zoom??100)!==zoom().percent()||Math.abs((item.area.viewportWidth||0)-document.documentElement.clientWidth)>8){missing.push(item.id);continue}
        const a=item.area,el=document.createElement('div');el.dataset.omArea=item.id;Object.assign(el.style,{position:'absolute',left:a.x+'px',top:a.y+'px',width:a.width+'px',height:a.height+'px',border:'2px solid #3370ff',background:'rgba(51,112,255,.08)',zIndex:'2147483640',pointerEvents:'none',boxSizing:'border-box'});
        const badge=document.createElement('button');badge.type='button';badge.textContent='注';badge.setAttribute('aria-label','查看区域批注');Object.assign(badge.style,{position:'absolute',right:'-9px',top:'-9px',width:'20px',height:'20px',border:'0',borderRadius:'50%',background:'#3370ff',color:'#fff',font:'12px sans-serif',cursor:'pointer',pointerEvents:'auto'});badge.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();send('note-click',{id:item.id,rect:rect(badge.getBoundingClientRect())})});el.append(badge);document.documentElement.append(el);
      }else{try{const r=match(typeof item.anchorQuote==='string'&&item.anchorQuote?item.anchorQuote:item.quote,item.before,item.after);if(!r||!wrap(r,item.id))missing.push(item.id)}catch{missing.push(item.id)}}
    }
    updateActiveNote();paintDraft();
    const positions=[];for(const item of lastItems){const nodes=[...document.querySelectorAll('[data-om-mark],[data-om-area]')].filter(e=>e.dataset.omMark===item.id||e.dataset.omArea===item.id);const boxes=nodes.flatMap(e=>[...e.getClientRects()]).filter(r=>r.width>0&&r.height>0).map(r=>({top:r.top+scrollY,left:r.left+scrollX})).sort((a,b)=>a.top-b.top||a.left-b.left);if(boxes.length)positions.push({id:item.id,...boxes[0]})}
    send('missing',{ids:missing,partial,positions});
    const sr=searchEngine.refresh();send('search-result',{...sr,query:searchEngine.query?.()});
    observer?.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden']});
  }
  function select(){if(mode!=='text')return;const s=window.getSelection();if(!s||s.isCollapsed)return;const raw=s.toString();const quote=raw.trim();if(!quote)return;const r=s.getRangeAt(0), {full,nodes}=textMap(), context=selectionContext(document,nodes,full,r);let before=context?.before||'',after=context?.after||'';let section='';for(const h of headings())if(h.compareDocumentPosition(r.startContainer)&Node.DOCUMENT_POSITION_FOLLOWING)section=h.textContent.trim();copySelectionRaw=raw;send('selection',{selected:{kind:'text',quote,anchorQuote:context?.quote,section,before,after},raw,selectionGeneration:++copySelectionGeneration,rect:rect(r.getBoundingClientRect())})}
  function domPath(element){const path=[];for(let node=element;node&&node.nodeType===1;node=node.parentElement){const tag=node.localName;let index=0;for(let prev=node.previousElementSibling;prev;prev=prev.previousElementSibling)if(prev.localName===tag)index++;path.unshift({tag,index});}return path}
  function locatePath(path){
    if(!Array.isArray(path)||!path.length||path.length>64||path[0]?.tag!==document.documentElement.localName||path[0]?.index!==0)return null;
    let n=document.documentElement;
    for(let i=1;n&&i<path.length;i++){const step=path[i];if(!step||typeof step.tag!=='string'||!Number.isInteger(step.index)||step.index<0)return null;n=[...n.children].filter(x=>x.localName===step.tag)[step.index]}
    return n;
  }
  function changes(){return editEntries.filter(x=>x.before!==x.after).map(x=>({before:x.before,after:x.after,domPath:x.domPath}))}
  function publishEdits(inputType='',groupKey=''){send('edit-dirty',{changes:changes(),inputType,groupKey})}
  function detachEditor(){if(editing){editing.element.removeAttribute('contenteditable');editing.element.removeAttribute('data-om-editing');if(editing.before===editing.after)editEntries=editEntries.filter(x=>x!==editing);editing=null}}
  function cancelEdits(){observer?.disconnect();detachEditor();for(const entry of editEntries){const n=entry.element;if(n?.isConnected&&n.textContent===entry.after)n.textContent=entry.before}editEntries=[];editRegistry.clear();editConflict=false;observer?.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden']})}
  function prepareEditMode(){
    observer?.disconnect();
    document.querySelectorAll('[data-om-mark]').forEach(e=>e.replaceWith(...e.childNodes));
    unwrapAreaMarks();
    if(!document.querySelector('style[data-om-edit-style]')){const style=document.createElement('style');style.dataset.omEditStyle='true';style.textContent='[data-om-editing]{outline:none!important}';(document.head||document.documentElement).append(style)}
    observer?.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden']});
  }
  function restoreEdits(value,knownChanges=value){
    if(!Array.isArray(value)||value.length>1000)return false;
    if(!Array.isArray(knownChanges)||knownChanges.length>5000)return false;
    const known=new Map();
    for(const c of knownChanges){
      if(typeof c?.before!=='string'||c.before.length>100000||!Array.isArray(c.domPath))return false;
      const key=JSON.stringify(c.domPath),n=locatePath(c.domPath),previous=known.get(key);
      if(!n||n.children.length||n.textContent!==c.before||(previous&&previous.before!==c.before))return false;
      known.set(key,{element:n,before:c.before});
    }
    const entries=[];
    for(const c of value){
      if(typeof c?.before!=='string'||typeof c?.after!=='string'||c.before.length>100000||c.after.length>100000)return false;
      const n=locatePath(c.domPath),knownEntry=known.get(JSON.stringify(c.domPath));
      if(!n||!knownEntry||knownEntry.element!==n||knownEntry.before!==c.before||n.children.length||n.textContent!==c.before||entries.some(x=>x.element===n))return false;
      entries.push({element:n,before:c.before,after:c.after,domPath:c.domPath});
    }
    observer?.disconnect();detachEditor();editEntries=entries;editRegistry=known;editConflict=false;
    for(const entry of entries)entry.element.textContent=entry.after;
    observer?.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden']});
    return true;
  }
  function applyEditChanges(value){
    if(mode!=='edit'||editConflict||!Array.isArray(value)||value.length>1000)return false;
    const current=new Map(),target=new Map();
    for(const entry of editEntries){
      const key=JSON.stringify(entry.domPath),known=editRegistry.get(key);
      if(current.has(key)||!known||known.element!==entry.element||known.before!==entry.before||!entry.element.isConnected||locatePath(entry.domPath)!==entry.element||entry.element.textContent!==entry.after)return false;
      current.set(key,entry);
    }
    for(const change of value){
      if(typeof change?.before!=='string'||typeof change?.after!=='string'||change.before.length>100000||change.after.length>100000||!Array.isArray(change.domPath))return false;
      const key=JSON.stringify(change.domPath),known=editRegistry.get(key),element=locatePath(change.domPath),previous=current.get(key);
      if(target.has(key)||!known||known.before!==change.before||known.element!==element||!element?.isConnected||element.textContent!==(previous?.after??known.before))return false;
      target.set(key,{element,before:change.before,after:change.after,domPath:change.domPath});
    }
    const plans=[];
    for(const [key,entry] of current){const next=target.get(key);plans.push({element:entry.element,before:entry.element.textContent,after:next?.after??entry.before})}
    for(const [key,entry] of target)if(!current.has(key))plans.push({element:entry.element,before:entry.element.textContent,after:entry.after});
    const oldEditing=editing,oldEntries=editEntries,activeKey=editing?JSON.stringify(editing.domPath):null,selection=window.getSelection();let caret=null;
    if(editing&&selection?.rangeCount&&editing.element.contains(selection.anchorNode)&&selection.isCollapsed){const r=document.createRange();r.selectNodeContents(editing.element);r.setEnd(selection.anchorNode,selection.anchorOffset);caret=r.toString().length}
    observer?.disconnect();
    try{
      for(const plan of plans)if(plan.before!==plan.after)plan.element.textContent=plan.after;
      editEntries=[...target.values()];
      if(activeKey){editing=target.get(activeKey)||null;if(!editing){editing={...oldEditing,after:oldEditing.before};editEntries.push(editing)}}
      if(editing&&caret!==null&&document.activeElement===editing.element){const node=editing.element.firstChild;if(node?.nodeType===Node.TEXT_NODE){const r=document.createRange();r.setStart(node,Math.min(caret,node.length));r.collapse(true);selection.removeAllRanges();selection.addRange(r)}}
    }catch{for(const plan of plans)try{plan.element.textContent=plan.before}catch{}editing=oldEditing;editEntries=oldEntries;observer?.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden']});return false}
    observer?.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden']});return true;
  }
  function reconcileEdits(){
    for(const entry of editEntries){
      if(entry.before===entry.after)continue;
      if(entry.element.isConnected&&entry.element.textContent===entry.after)continue;
      const n=locatePath(entry.domPath);
      if(n&&!n.children.length&&n.textContent===entry.before){
        if(editing===entry){editing=null;n.removeAttribute('contenteditable');n.removeAttribute('data-om-editing')}
        entry.element=n;editRegistry.set(JSON.stringify(entry.domPath),{element:n,before:entry.before});n.textContent=entry.after;
      }else if(!editConflict){editConflict=true;send('edit-conflict',{changes:changes()})}
    }
  }
  document.addEventListener('mousedown',e=>{
    if(mode!=='edit'||e.button!==0)return;
    const element=e.target.closest?.('p,h1,h2,h3,h4,h5,h6,li,td,th,span,div');
    if(!element||element.children.length||element.closest('script,style,button,a,input,textarea,select,[data-om-area]'))return;
    if(element.isContentEditable&&editing?.element!==element)return;
    let entry=editEntries.find(x=>x.element===element);
    if(editing!==entry){if(editing)send('edit-group-break');detachEditor();if(!entry){entry={element,before:element.textContent,after:element.textContent,domPath:domPath(element)};editEntries.push(entry);editRegistry.set(JSON.stringify(entry.domPath),{element,before:entry.before})}editing=entry;element.setAttribute('contenteditable','plaintext-only');element.setAttribute('data-om-editing','true')}
  },true);
  document.addEventListener('input',e=>{if(mode==='edit'&&editing&&e.target===editing.element){editing.after=editing.element.textContent;publishEdits(e.inputType||'',JSON.stringify(editing.domPath))}},true);
  function paintDraft(){if(!window.CSS?.highlights)return;CSS.highlights.delete('openmargin-area-draft');if(!draftAnchor||!window.Highlight)return;const result=contentArea.resolve(draftAnchor),highlight=new Highlight();for(const range of result.ranges)highlight.add(range);if(result.ranges.length)CSS.highlights.set('openmargin-area-draft',highlight)}
  function draftClear(keepAnchor=false){document.querySelectorAll('[data-om-draft]').forEach(x=>x.remove());drag=null;if(!keepAnchor)draftAnchor=null;paintDraft()}
  document.addEventListener('keydown',e=>{if(mode!=='edit'||!editing||e.isComposing||e.keyCode===229||e.altKey||!(e.metaKey||e.ctrlKey)||!(e.target===editing.element||editing.element.contains(e.target)))return;const key=String(e.key).toLowerCase();if(key!=='z'&&key!=='y')return;e.preventDefault();e.stopPropagation();send('edit-undo-shortcut',{redo:key==='y'||e.shiftKey})},true);
  // Report the start of an outside interaction without stopping page behavior.
  let blankPointer=null;
  const interactiveTarget=t=>t?.closest?.('[data-om-mark],[data-om-area],a,button,input,textarea,select,option,label,iframe,[role=button],[role=link],[contenteditable]:not([contenteditable=false]),[tabindex]');
  document.addEventListener('pointerdown',e=>{copySelectionRaw=null;send('preview-pointerdown',{selectionGeneration:++copySelectionGeneration});blankPointer=e.button===0&&!interactiveTarget(e.target)?{x:e.clientX,y:e.clientY,id:e.pointerId}:null},true);
  document.addEventListener('pointerup',e=>{const start=blankPointer;blankPointer=null;if(!start||start.id!==e.pointerId||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5||interactiveTarget(e.target)||!window.getSelection()?.isCollapsed)return;send('preview-background-click')},true);
  document.addEventListener('pointercancel',()=>{blankPointer=null;copySelectionRaw=null;send('preview-selection-invalidated',{selectionGeneration:++copySelectionGeneration})},true);
  document.addEventListener('selectionchange',()=>{if(copySelectionRaw===null)return;const current=window.getSelection();if((!current||current.isCollapsed)?document.hasFocus():current.toString()!==copySelectionRaw){copySelectionRaw=null;send('preview-selection-invalidated',{selectionGeneration:++copySelectionGeneration})}});
  document.addEventListener('dragstart',e=>{if(mode==='area')e.preventDefault()},true);
  document.addEventListener('mousedown',e=>{if(mode!=='area'||e.button!==0)return;e.preventDefault();if(hostDirty)return;draftClear();const pt=zoom().point(e.clientX+scrollX,e.clientY+scrollY);const el=document.createElement('div');el.dataset.omDraft='true';Object.assign(el.style,{position:'absolute',left:pt.x+'px',top:pt.y+'px',width:'0px',height:'0px',border:'2px solid #3370ff',background:'rgba(51,112,255,.08)',zIndex:'2147483640',pointerEvents:'none',boxSizing:'border-box'});document.documentElement.append(el);drag={x:pt.x,y:pt.y,el}},true);
  document.addEventListener('mousemove',e=>{if(!drag)return;const current=drag;current.next=zoom().point(e.clientX+scrollX,e.clientY+scrollY);if(current.raf)return;current.raf=requestAnimationFrame(()=>{current.raf=null;if(drag!==current)return;const {x,y,el,next:pt}=current;Object.assign(el.style,{left:Math.min(x,pt.x)+'px',top:Math.min(y,pt.y)+'px',width:Math.abs(x-pt.x)+'px',height:Math.abs(y-pt.y)+'px'})})},true);
  document.addEventListener('mouseup',e=>{if(mode!=='area'){select();return}if(!drag)return;const {x,y,el}=drag,pt=zoom().point(e.clientX+scrollX,e.clientY+scrollY),scale=zoom().scale();drag=null;el.remove();if(Math.abs(x-pt.x)*scale<8||Math.abs(y-pt.y)*scale<8)return;const startX=x*scale-scrollX,startY=y*scale-scrollY,left=Math.min(startX,e.clientX),top=Math.min(startY,e.clientY),right=Math.max(startX,e.clientX),bottom=Math.max(startY,e.clientY),anchor=contentArea.capture({left,top,right,bottom});if(!anchor){send('area-empty');return}const area={x:Math.min(x,pt.x),y:Math.min(y,pt.y),width:Math.abs(x-pt.x),height:Math.abs(y-pt.y),viewportWidth:document.documentElement.clientWidth,zoom:zoom().percent()};draftAnchor=anchor;paintDraft();send('area-selected',{selected:{kind:'area',quote:anchor.quote,area,contentAnchor:anchor},rect:{x:left,y:top,width:right-left,height:bottom-top}})},true);
  let layoutAlive=true;const layoutChanged=()=>{if(layoutAlive)send('connector-layout-changed')};
  document.addEventListener('load',layoutChanged,true);document.addEventListener('error',layoutChanged,true);
  document.fonts?.addEventListener('loading',layoutChanged);document.fonts?.addEventListener('loadingdone',layoutChanged);document.fonts?.addEventListener('loadingerror',layoutChanged);document.fonts?.ready.then(layoutChanged).catch(()=>{});
  addEventListener('pagehide',()=>{layoutAlive=false;document.removeEventListener('load',layoutChanged,true);document.removeEventListener('error',layoutChanged,true);document.fonts?.removeEventListener('loading',layoutChanged);document.fonts?.removeEventListener('loadingdone',layoutChanged);document.fonts?.removeEventListener('loadingerror',layoutChanged)},{once:true});
  let ticking=false;addEventListener('scroll',()=>{if(ticking)return;ticking=true;requestAnimationFrame(()=>{ticking=false;let activeHeading=-1;headings().forEach((h,i)=>{if(h.getBoundingClientRect().top<100)activeHeading=i});send('scroll',{activeHeading,x:scrollX,y:scrollY})})},{passive:true});
  addEventListener('resize',()=>{marks(lastItems);send('viewport-resized',{width:document.documentElement.clientWidth})});
  const ownOverlay=node=>node?.nodeType===1&&(node.matches?.('[data-om-area],[data-om-draft],[data-om-mark]')||node.closest?.('[data-om-area],[data-om-draft],[data-om-mark]'));
  let timer;observer=new MutationObserver(records=>{const relevant=records.some(r=>{if(ownOverlay(r.target)||ownOverlay(r.target.parentElement))return false;if(r.type==='childList'){const added=[...r.addedNodes],removed=[...r.removedNodes],changed=[...added,...removed];if(changed.length&&changed.every(ownOverlay))return false;if(added.length&&added.length===removed.length&&added.every((n,i)=>n.nodeType===3&&removed[i].nodeType===3&&n.nodeValue===removed[i].nodeValue))return false}return true});if(!relevant)return;if(mode==='edit'){reconcileEdits();const external=records.some(r=>r.type==='attributes'||!editEntries.some(entry=>entry.element?.isConnected&&entry.element.textContent===entry.after&&(r.target===entry.element||entry.element.contains(r.target))));if(external)send('content-changed')}else send('content-changed');clearTimeout(timer);timer=setTimeout(()=>{outline();const sr=searchEngine.refresh();send('search-result',{...sr,query:searchEngine.query()})},100)});observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden']});
  addEventListener('message',e=>{if(e.source!==parent||!e.data||e.data.channel!=='openmargin:host')return;const m=e.data;switch(m.type){case'zoom':{observer?.disconnect();zoom().apply(m.percent);draftClear(true);if(mode==='edit')observer?.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden']});else marks(lastItems);send('viewport-resized',{width:document.documentElement.clientWidth,zoom:zoom().percent()});break}case'host-dirty':hostDirty=!!m.dirty;break;case'mode':{const next=m.mode==='area'?'area':m.mode==='edit'?'edit':'text';if(mode!=='edit'&&next==='edit')prepareEditMode();if(mode==='edit'&&next!=='edit'){cancelEdits();mode=next;marks(lastItems)}else mode=next;break}case'edit-restore':{const ok=restoreEdits(m.changes,m.knownChanges);send('edit-restored',{ok,request:m.request});break;}case'edit-apply-changes':{const ok=applyEditChanges(m.changes);send('edit-applied',{request:m.request,ok});break;}case'edit-save':publishEdits();break;case'edit-cancel':cancelEdits();break;case'marks':marks(m.annotations);break;case'jump':headings()[m.index]?.scrollIntoView({behavior:'smooth',block:'start'});break;case'goto-note':Array.from(document.querySelectorAll('[data-om-mark],[data-om-area]')).find(x=>x.dataset.omMark===m.id||x.dataset.omArea===m.id)?.scrollIntoView({behavior:'auto',block:'center'});break;case'measure-note':{const nodes=Array.from(document.querySelectorAll('[data-om-mark],[data-om-area]')).filter(x=>x.dataset.omMark===m.id||x.dataset.omArea===m.id),rects=nodes.flatMap(el=>Array.from(el.getClientRects())).filter(r=>r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth).map(rect);send('note-anchor',{id:m.id,token:m.token,rect:rects[0]||null,rects});break;}case'active-note':activeNote=typeof m.id==='string'?m.id:null;updateActiveNote();break;case'validate-connectors':{const candidates=Array.isArray(m.candidates)?m.candidates:[];const index=candidates.findIndex(candidate=>checkConnector(document,candidate?.bounds));send('connector-clearance',{id:m.id,token:m.token,index,clear:index>=0});break;}case'validate-connector':send('connector-clearance',{id:m.id,token:m.token,clear:checkConnector(document,m.bounds)});break;case'clear-draft':draftClear();break;case'scroll-to':scrollTo(Number(m.x)||0,Number(m.y)||0);break;case'scroll-by':if(Number.isFinite(m.x)&&Number.isFinite(m.y))scrollBy({left:m.x,top:m.y,behavior:'auto'});break;case'search':{const result=searchEngine.run(String(m.query||''),Number(m.index)||0,m.scroll!==false);send('search-result',{...result,query:String(m.query||''),request:m.request});break}}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{outline();send('ready')},{once:true});else{outline();send('ready')}
}
export function injectHtmlBridge(html,baseTag='') {
  const script=`<script>(${previewBridge.toString()})((${createSearchEngine.toString()})(document),(${createDocumentZoom.toString()}),(${connectorClearance.toString()}),(${createContentArea.toString()}),(${selectionContext.toString()}));<\/script>`;
  const injection=baseTag+script;
  return /<head(?:\s[^>]*)?>/i.test(html)?html.replace(/<head(?:\s[^>]*)?>/i,x=>x+injection):injection+html;
}
