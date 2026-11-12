// Per-document, in-memory editing history. The caller owns rendering and disk I/O.
const clone=value=>typeof value==='string'?value:(Array.isArray(value)?value.map(c=>({...c,domPath:c.domPath?.map(p=>({...p}))})):value);
const canonical=value=>Array.isArray(value)?[...value].sort((a,b)=>JSON.stringify(a.domPath).localeCompare(JSON.stringify(b.domPath))):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function startEditTimeline(kind,value) { return {kind,past:[],present:clone(canonical(value)),future:[],group:null}; }
export function recordEdit(timeline,value,{inputType='',groupKey='',at=Date.now()}={}) {
  const next=clone(canonical(value));if(same(timeline.present,next))return timeline;
  const groupable=['insertText','insertCompositionText','deleteContentBackward','deleteContentForward'].includes(inputType);
  const previous=timeline.group,coalesce=groupable&&previous&&previous.inputType===inputType&&previous.groupKey===groupKey&&at>=previous.at&&at-previous.at<=750;
  const past=coalesce?timeline.past:[...timeline.past,clone(timeline.present)].slice(-200);
  return {...timeline,past,present:next,future:[],group:groupable?{inputType,groupKey,at}:null};
}
export function breakEditGroup(timeline){return timeline.group?{...timeline,group:null}:timeline}
export function stepEdit(timeline,redo=false){
  const from=redo?timeline.future:timeline.past;if(!from.length)return null;
  const target=clone(from[from.length-1]);
  return redo?{...timeline,past:[...timeline.past,clone(timeline.present)],present:target,future:timeline.future.slice(0,-1),group:null}:{...timeline,past:timeline.past.slice(0,-1),present:target,future:[...timeline.future,clone(timeline.present)],group:null};
}
export function timelineKnownChanges(timeline){
  if(timeline?.kind!=='inline')return [];
  const unique=new Map();for(const snapshot of [...timeline.past,timeline.present,...timeline.future])for(const c of snapshot||[]){const key=JSON.stringify(c.domPath);if(!unique.has(key))unique.set(key,clone([c])[0]);}
  return [...unique.values()];
}
