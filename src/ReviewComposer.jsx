import React from 'react';
import { ReviewExcerpt, ReviewTextarea } from './ReviewCard';

/** Draft values and actions are controlled by the caller. */
export default function ReviewComposer({ selected, note, onNoteChange, onCancel, onSave }) {
  return <div className="review-composer">
    <ReviewExcerpt text={selected?.kind === 'area' && !selected?.contentAnchor ? '已框选页面区域' : selected?.quote} />
    <ReviewTextarea autoFocus aria-label="批注意见" placeholder="写下你的想法或修改建议…" value={note} onChange={e => onNoteChange?.(e.target.value)} onSubmit={onSave} />
    <div className="review-actions"><button type="button" onClick={onCancel}>取消</button><button type="button" className="review-primary" disabled={!note?.trim()} onClick={onSave}>添加批注</button></div>
  </div>;
}
