import { marked } from 'marked';
import { parse, parseFragment } from 'parse5';

function plain(node) {
  if (!node) return '';
  if (node.nodeName === '#text') return node.value || '';
  if (node.nodeName === 'script' || node.nodeName === 'style') return '';
  return (node.childNodes || []).map(plain).join('');
}
function decorate(headings, source, end) {
  const stack=[];
  return headings.map((h,i)=>{
    while(stack.length&&stack[stack.length-1].level>=h.level)stack.pop();
    stack.push(h);
    const path=stack.map(x=>x.text), key=JSON.stringify(stack.map(x=>[x.level,x.text]));
    return {...h,path,key,content:source.slice(h.start,headings[i+1]?.start??end)};
  });
}
function markdownHeadings(source) {
  let offset=0;const headings=[];
  for(const token of marked.lexer(source)){
    const start=offset;offset+=(token.raw||'').length;
    if(token.type==='heading'&&token.depth>=1&&token.depth<=6){
      const value=plain(parseFragment(marked.parseInline(token.text||''))).replace(/\s+/gu,' ').trim();
      if(value)headings.push({start,level:token.depth,text:value});
    }
  }
  return decorate(headings,source,source.length);
}
function htmlHeadings(source) {
  const document=parse(source,{sourceCodeLocationInfo:true}), headings=[];
  function find(node,name){if(node.tagName===name)return node;for(const child of node.childNodes||[]){const match=find(child,name);if(match)return match}return null}
  const body=find(document,'body');if(!body)return [];
  function walk(node){
    if(node.tagName==='script'||node.tagName==='style'||node.tagName==='template')return;
    if(/^h[1-6]$/.test(node.tagName||'')&&node.sourceCodeLocation){const value=plain(node).replace(/\s+/gu,' ').trim();if(value)headings.push({start:node.sourceCodeLocation.startOffset,level:Number(node.tagName[1]),text:value})}
    for(const child of node.childNodes||[])walk(child);
  }
  walk(body);headings.sort((a,b)=>a.start-b.start);
  const end=body.sourceCodeLocation?.endTag?.startOffset??body.sourceCodeLocation?.endOffset??source.length;
  return decorate(headings,source,end);
}

/** Return uniquely identifiable sections whose source content actually changed. */
export function deriveHistorySections(type,before='',after='') {
  if(typeof before!=='string'||typeof after!=='string'||before===after||!['md','html'].includes(type))return [];
  let oldHeadings,newHeadings;
  try{oldHeadings=type==='md'?markdownHeadings(before):htmlHeadings(before);newHeadings=type==='md'?markdownHeadings(after):htmlHeadings(after)}catch{return []}
  const group=list=>{const map=new Map();for(const entry of list){const items=map.get(entry.key)||[];items.push(entry);map.set(entry.key,items)}return map};
  const oldMap=group(oldHeadings),newMap=group(newHeadings),affected=[],seen=new Set();
  for(const entry of [...oldHeadings,...newHeadings]){
    if(seen.has(entry.key))continue;seen.add(entry.key);
    const old=oldMap.get(entry.key)||[],fresh=newMap.get(entry.key)||[];
    if(old.length>1||fresh.length>1)continue;
    if(old.length===1&&fresh.length===1&&old[0].content===fresh[0].content)continue;
    const display=(fresh[0]||old[0]).path.join(' / ');
    if(display&&!affected.includes(display))affected.push(display);
  }
  return affected;
}
