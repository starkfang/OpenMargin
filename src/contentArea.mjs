// An area gesture selects visible characters, not page coordinates. All helpers
// live inside this factory so the same implementation can be injected into an
// opaque-origin HTML preview.
export function createContentArea(doc) {
  const win=doc.defaultView;
  const blocks='p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote,div,section,article';
  const ignored='script,style,noscript,textarea,input,select,option,[data-om-draft],[data-om-area-badge],[hidden],[aria-hidden="true"]';
  function allowed(n){return !!n.parentElement&&!n.parentElement.closest(ignored)}
  function textNodes(root){const w=doc.createTreeWalker(root,win.NodeFilter.SHOW_TEXT);const out=[];let n;while((n=w.nextNode()))if(allowed(n))out.push(n);return out}
  function text(root){return textNodes(root).map(n=>n.nodeValue).join('')}
  function path(el){const out=[];for(let n=el;n&&n.nodeType===1;n=n.parentElement){let index=0;for(let p=n.previousElementSibling;p;p=p.previousElementSibling)if(p.localName===n.localName&&!p.matches('[data-om-draft],[data-om-area-badge]'))index++;out.unshift({tag:n.localName,index})}return out}
  function locate(parts){if(!Array.isArray(parts)||!parts.length||parts[0]?.tag!==doc.documentElement.localName||parts[0]?.index!==0)return null;let el=doc.documentElement;for(let i=1;el&&i<parts.length;i++){const p=parts[i];if(typeof p?.tag!=='string'||!Number.isInteger(p.index)||p.index<0)return null;el=[...el.children].filter(x=>x.localName===p.tag&&!x.matches('[data-om-draft],[data-om-area-badge]'))[p.index]}return el}
  function rectOverlap(a,b){return a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom}
  function visible(el){for(let n=el;n&&n.nodeType===1;n=n.parentElement){const s=win.getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0)return false}return true}
  function sibling(el,direction){let n=direction==='before'?el.previousElementSibling:el.nextElementSibling;while(n&&n.matches('[data-om-draft],[data-om-area-badge]'))n=direction==='before'?n.previousElementSibling:n.nextElementSibling;return n?{tag:n.localName,text:text(n)}:null}
  function matchingBlocks(el,snapshot){return [...doc.getElementsByTagName(el.localName)].filter(x=>text(x)===snapshot).length}
  function sameSibling(a,b){return a===null&&b===null||!!a&&!!b&&a.tag===b.tag&&a.text===b.text}
  function normalizedRect(r){const left=Math.min(r.left,r.right),right=Math.max(r.left,r.right),top=Math.min(r.top,r.bottom),bottom=Math.max(r.top,r.bottom);return {left,right,top,bottom}}
  function hitCharacter(node,start,end,selection){
    const range=doc.createRange();range.setStart(node,start);range.setEnd(node,end);
    for(const box of range.getClientRects()){
      if(!rectOverlap(box,selection))continue;
      const l=Math.max(box.left,selection.left,0),r=Math.min(box.right,selection.right,win.innerWidth);
      const t=Math.max(box.top,selection.top,0),b=Math.min(box.bottom,selection.bottom,win.innerHeight);
      if(r<=l||b<=t)continue;
      const top=doc.elementFromPoint((l+r)/2,(t+b)/2),parent=node.parentElement;
      if(top&&(top===parent||parent.contains(top)))return true;
    }
    return false;
  }
  function capture(input){
    if(!doc.body||!input)return null;
    const selection=normalizedRect(input);
    if(![selection.left,selection.top,selection.right,selection.bottom].every(Number.isFinite)||selection.right<=selection.left||selection.bottom<=selection.top)return null;
    const fragments=[],cache=new Map();
    for(const node of textNodes(doc.body)){
      const parent=node.parentElement;
      if(!visible(parent)||![...parent.getClientRects()].some(box=>rectOverlap(box,selection)))continue;
      const block=parent.closest(blocks)||doc.body;
      let info=cache.get(block);
      if(!info){const nodes=textNodes(block),offsets=new Map();let full='';for(const n of nodes){offsets.set(n,full.length);full+=n.nodeValue}info={full,offsets,path:path(block),beforeSibling:sibling(block,'before'),afterSibling:sibling(block,'after'),originalMatches:matchingBlocks(block,full)};cache.set(block,info)}
      const base=info.offsets.get(node);if(base===undefined)continue;
      let run=-1;
      const emit=end=>{if(run<0||end<=run)return;const start=base+run,finish=base+end,quote=info.full.slice(start,finish);if(quote)fragments.push({quote,before:info.full.slice(Math.max(0,start-40),start),after:info.full.slice(finish,finish+40),blockPath:info.path,blockText:info.full,start,end:finish,beforeSibling:info.beforeSibling,afterSibling:info.afterSibling,originalMatches:info.originalMatches});run=-1};
      for(let i=0;i<node.length;){const code=node.nodeValue.codePointAt(i),end=i+(code>0xffff?2:1),hit=hitCharacter(node,i,end,selection);if(hit&&run<0)run=i;if(!hit&&run>=0)emit(i);i=end}
      emit(node.length);
    }
    if(!fragments.length)return null;
    let quote='';for(let i=0;i<fragments.length;i++){const f=fragments[i],prev=fragments[i-1];if(prev&&(JSON.stringify(prev.blockPath)!==JSON.stringify(f.blockPath)||prev.end!==f.start))quote+='\n';quote+=f.quote}
    return {version:1,fragments,quote,documentSnapshot:text(doc.body)};
  }
  function toRange(block,start,end){
    const nodes=textNodes(block);let offset=0,a=null,b=null;
    for(const n of nodes){const next=offset+n.length;if(!a&&start>=offset&&start<next)a={node:n,offset:start-offset};if(!b&&end>offset&&end<=next)b={node:n,offset:end-offset};offset=next}
    if(!a||!b)return null;const r=doc.createRange();r.setStart(a.node,a.offset);r.setEnd(b.node,b.offset);return r;
  }
  function resolve(anchor){
    if(!anchor||anchor.version!==1||!Array.isArray(anchor.fragments)||!anchor.fragments.length)return {status:'missing',ranges:[],matched:0,total:0};
    const sameDocument=typeof anchor.documentSnapshot==='string'&&anchor.documentSnapshot===text(doc.body),ranges=[];
    for(const f of anchor.fragments){
      if(typeof f?.quote!=='string'||!Number.isInteger(f.start)||!Number.isInteger(f.end)||f.start<0||f.end<=f.start)continue;
      const block=locate(f.blockPath);if(!block||typeof f.blockText!=='string'||text(block)!==f.blockText||f.blockText.slice(f.start,f.end)!==f.quote||f.blockText.slice(Math.max(0,f.start-40),f.start)!==f.before||f.blockText.slice(f.end,f.end+40)!==f.after)continue;
      if(!sameDocument&&(f.originalMatches!==1||matchingBlocks(block,f.blockText)!==1||(!sameSibling(f.beforeSibling,sibling(block,'before'))&&!sameSibling(f.afterSibling,sibling(block,'after')))))continue;
      const r=toRange(block,f.start,f.end);if(r&&r.toString()===f.quote)ranges.push(r);
    }
    return {status:ranges.length===anchor.fragments.length?'matched':ranges.length?'partial':'missing',ranges,matched:ranges.length,total:anchor.fragments.length};
  }
  return {capture,resolve};
}
