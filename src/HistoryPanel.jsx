import React from 'react';
import { summarizeHistory } from './historySummary.mjs';
import { deriveHistorySections } from './historySections.mjs';
import './HistoryPanel.css';

function HistoryEntry({ item, stamp, onPreview, type }) {
  const before = item.before ?? item.oldContent ?? '', after = item.after ?? item.newContent ?? '';
  const summary = React.useMemo(() => summarizeHistory(before, after), [before, after]);
  const section = React.useMemo(() => typeof item.section === 'string' && item.section.trim() ? item.section.trim() : deriveHistorySections(type, before, after).join('、'), [item.section, type, before, after]);
  const sectionLabel = section.split('、').map(value => value.split(' / ').at(-1)).join('、');
  const recorded = stamp(item.recordedAt || item.time || item.timestamp || item.createdAt);
  return <article className="history-entry">
    <div className="history-entry-head"><div className="history-heading-meta"><time className="history-time" title={recorded}>{recorded}</time>{section && <><span aria-hidden="true">｜</span><span className="history-heading-section" title={section}>{sectionLabel}</span></>}</div><span className="history-kind">正文修改</span></div>
    <div className="history-change history-before"><span className="history-sign" aria-hidden="true">−</span><span className="history-change-label">修改前：</span><p>{summary.before || '—'}</p></div>
    <div className="history-change history-after"><span className="history-sign" aria-hidden="true">+</span><span className="history-change-label">修改后：</span><p>{summary.after || '—'}</p></div>
    {summary.omitted > 0 && <div className="history-more">另有 {summary.omitted} 处变化</div>}
    <div className="history-entry-actions"><button type="button" className="history-expand" disabled={!onPreview || typeof (item.before ?? item.oldContent) !== 'string' || typeof (item.after ?? item.newContent) !== 'string'} onClick={() => onPreview?.(item)}>查看详情 <span aria-hidden="true">→</span></button></div>
  </article>;
}
export default function HistoryPanel({ entries, error, stamp, onScroll, onPreview, type }) {
  return <div className="history-body" onScroll={onScroll}>{entries === null ? <div className="blank">{error ? '修改记录读取失败' : '正在加载修改记录…'}</div> : !entries.length ? <div className="blank">暂无修改记录</div> : [...entries].reverse().map((entry, i) => <HistoryEntry key={(entry.recordedAt || entry.time || '') + ':' + (entries.length - 1 - i)} item={entry} stamp={stamp} onPreview={onPreview} type={type}/>)}</div>;
}
