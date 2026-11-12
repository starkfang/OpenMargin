// Search is painted through the CSS Highlight API: no document nodes or annotations are changed.
export function createSearchEngine(doc) {
  const win=doc.defaultView, css=win.CSS, Highlight=win.Highlight;
  let query='', index=0, ranges=[];
  const style=doc.createElement('style');
  style.textContent='::highlight(openmargin-search){background:#ffe17a;color:#1f2329}::highlight(openmargin-search-current){background:#ff9f43;color:#171717}';
  (doc.head||doc.documentElement).appendChild(style);
  function run(value, desired=0, scroll=true) {
    query=String(value||''); ranges=[];
    if(css?.highlights){css.highlights.delete('openmargin-search');css.highlights.delete('openmargin-search-current')}
    if(query && doc.body){
      const walker=doc.createTreeWalker(doc.body,win.NodeFilter.SHOW_TEXT), groups=[];
      let node, current=null;
      while((node=walker.nextNode())) {
        const el=node.parentElement;
        if(!el||!node.nodeValue||el.closest('script,style,noscript,textarea,input,select,option,[data-om-area]:not(mark),[data-om-draft],[hidden],[aria-hidden="true"]'))continue;
        const s=win.getComputedStyle(el);
        if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||!el.getClientRects().length)continue;
        const block=el.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote,div,section,article')||doc.body;
        if(!current||current.block!==block){current={block,full:'',nodes:[]};groups.push(current)}
        current.nodes.push({node,start:current.full.length,end:current.full.length+node.length});current.full+=node.nodeValue;
      }
      // Case conversion can expand a code point (e.g. İ -> i + combining dot).
      // Keep a mapping back to UTF-16 offsets in the original text for DOM Range.
      const fold=text=>{let result='',starts=[],ends=[],offset=0;for(const char of text){const folded=char.toLowerCase();for(let i=0;i<folded.length;i++){starts.push(offset);ends.push(offset+char.length)}result+=folded;offset+=char.length}return {result,starts,ends}};
      const needle=fold(query).result;
      for(const group of groups){const folded=fold(group.full),hay=folded.result;let pos=0,hit;while((hit=hay.indexOf(needle,pos))!==-1){const start=folded.starts[hit],end=folded.ends[hit+needle.length-1];const a=group.nodes.find(n=>start>=n.start&&start<n.end),b=group.nodes.find(n=>end>n.start&&end<=n.end);if(a&&b){const r=doc.createRange();r.setStart(a.node,start-a.start);r.setEnd(b.node,end-b.start);if(r.getClientRects().length)ranges.push(r)}pos=hit+Math.max(needle.length,1)}}
    }
    index=ranges.length?((desired%ranges.length)+ranges.length)%ranges.length:0;
    if(css?.highlights&&Highlight&&ranges.length){const all=new Highlight();for(const r of ranges)all.add(r);css.highlights.set('openmargin-search',all);const selected=new Highlight(ranges[index]);selected.priority=1;css.highlights.set('openmargin-search-current',selected)}
    if(scroll&&ranges[index]){const r=ranges[index],el=r.startContainer.parentElement;el?.scrollIntoView({block:'nearest',inline:'nearest'});for(let p=el?.parentElement;p&&p!==doc.body&&p!==doc.documentElement;p=p.parentElement){const s=win.getComputedStyle(p);if(!/(auto|scroll)/.test(s.overflowY))continue;const box=r.getBoundingClientRect(),container=p.getBoundingClientRect();if(box.top<container.top||box.bottom>container.bottom)p.scrollTop+=box.top-container.top-p.clientHeight/2+box.height/2}const box=r.getBoundingClientRect();win.scrollBy({top:box.top-win.innerHeight/2+box.height/2,left:0,behavior:'auto'})}
    return {count:ranges.length,index};
  }
  return {run,refresh:()=>run(query,index,false),query:()=>query};
}
