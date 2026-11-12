import React from 'react';
import { historyCompare } from './historyCompare.mjs';
import './HistoryCompare.css';

export default function HistoryCompare({before,after,leftLabel,rightLabel,leftTime,rightTime}) {
  const [full,setFull]=React.useState(false);
  const comparison=React.useMemo(()=>historyCompare(before,after),[before,after]);
  return <div className="history-compare-shell">
    <div className="history-compare-toolbar"><div className="history-compare-toggle" role="group" aria-label="对比范围"><button type="button" aria-pressed={!full} onClick={()=>setFull(false)}>只看变更</button><button type="button" aria-pressed={full} onClick={()=>setFull(true)}>完整正文</button></div><span>{comparison.changes} 处变化</span></div>
    {comparison.coarse&&<p className="history-compare-notice">正文较长，中间变化按范围展示，可能包含未变内容；完整正文可查看全部内容。</p>}
    <div className="history-compare-grid" aria-label="正文版本对比">
      <div className="history-compare-head"><strong>{leftLabel}</strong><span>{leftTime}</span></div><div className="history-compare-head history-compare-right"><strong>{rightLabel}</strong><span>{rightTime}</span></div>
      {comparison.groups.map((group,index)=>{
        if(group.kind==='same'){
          if(!full)return <React.Fragment key={index}><div className="history-compare-gap">… {group.lines.length} 行未变 …</div><div className="history-compare-gap history-compare-right">… {group.lines.length} 行未变 …</div></React.Fragment>;
          return group.lines.map((line,n)=><React.Fragment key={index+':'+n}><div className="history-compare-cell"><span aria-hidden="true"> </span><p>{line||' '}</p></div><div className="history-compare-cell history-compare-right"><span aria-hidden="true"> </span><p>{line||' '}</p></div></React.Fragment>);
        }
        return Array.from({length:Math.max(group.removed.length,group.added.length)},(_,n)=><React.Fragment key={index+':'+n}><div className={'history-compare-cell'+(n<group.removed.length?' is-removed':'')}><span aria-hidden="true">{n<group.removed.length?'−':''}</span><p>{n<group.removed.length?(group.removed[n]||'（空行）'):''}</p></div><div className={'history-compare-cell history-compare-right'+(n<group.added.length?' is-added':'')}><span aria-hidden="true">{n<group.added.length?'+':''}</span><p>{n<group.added.length?(group.added[n]||'（空行）'):''}</p></div></React.Fragment>);
      })}
      {!comparison.groups.length&&<><div className="history-compare-gap">（空正文）</div><div className="history-compare-gap history-compare-right">（空正文）</div></>}
    </div>
  </div>;
}
