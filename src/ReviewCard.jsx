import React, { useLayoutEffect, useRef, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Pencil1Icon, TrashIcon, Cross2Icon } from '@radix-ui/react-icons';

// Tooltip triggers remain focusable so keyboard users can read truncated text.
export function ReviewExcerpt({ text, onClick, className = '' }) {
  const value = text || '页面区域';
  const ref = useRef(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const measure = () => { if (live) setTruncated(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener('resize', measure);
    const fonts = el.ownerDocument.fonts;
    fonts?.addEventListener('loadingdone', measure);
    fonts?.ready.then(measure);
    return () => { live = false; observer?.disconnect(); window.removeEventListener('resize', measure); fonts?.removeEventListener('loadingdone', measure); };
  }, [value]);
  const props = { ref, className: `review-excerpt quote ${className}`, 'aria-label': value };
  return <Tooltip.Provider delayDuration={300}>
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{onClick ? <button type="button" {...props} onClick={onClick}>{value}</button> : <span {...props} tabIndex={0}>{value}</span>}</Tooltip.Trigger>
      {truncated && <Tooltip.Portal><Tooltip.Content className="review-tooltip" sideOffset={6} collisionPadding={8}>{value}<Tooltip.Arrow className="review-tooltip-arrow" /></Tooltip.Content></Tooltip.Portal>}
    </Tooltip.Root>
  </Tooltip.Provider>;
}

function MetaValue({ text, label = text, className }) {
  return <Tooltip.Provider delayDuration={300}><Tooltip.Root><Tooltip.Trigger asChild><span className={className} aria-label={label} tabIndex={0}>{text}</span></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="review-tooltip" sideOffset={6} collisionPadding={8}>{label}<Tooltip.Arrow className="review-tooltip-arrow" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>;
}

// Grow with the content and recalculate when the available width changes.
export function ReviewTextarea({ value, onSubmit, onKeyDown, onCompositionStart, onCompositionEnd, ...props }) {
  const ref = useRef(null);
  const composing = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`; };
    resize();
    let width = el.clientWidth;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (el.clientWidth !== width) { width = el.clientWidth; resize(); }
    });
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [value]);
  return <textarea ref={ref} value={value} {...props}
    onCompositionStart={event => { composing.current = true; onCompositionStart?.(event); }}
    onCompositionEnd={event => { composing.current = false; onCompositionEnd?.(event); }}
    onKeyDown={event => {
      onKeyDown?.(event);
      if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || event.nativeEvent.keyCode === 229) return;
      event.preventDefault();
      if (!event.repeat && String(value || '').trim()) onSubmit?.();
    }} />;
}

/** All persistence and edit-state ownership stay with the parent. */
export default function ReviewCard({ annotation, missing = false, partial = false, active = false, connected = false, onActivate, createdText, updatedText, onQuote, onEdit, onDelete, deleteDisabled = false, deleteDisabledReason, editing = false, editText = '', onEditTextChange, onSaveEdit, onCancelEdit, onClose, variant = 'sidebar' }) {
  const a = annotation || {};
  const deleteHelp = deleteDisabled ? (deleteDisabledReason || '当前批注不可删除') : '删除批注';
  const areaQuote = (a.quote || '').trim();
  const excerpt = a.kind === 'area' && !a.contentAnchor && !areaQuote.startsWith('已框选区域') ? (areaQuote ? `已框选区域（中心附近：${areaQuote}）` : '已框选区域') : a.quote;
  const updatedDate = a.updatedAt == null || a.updatedAt === '' ? null : new Date(a.updatedAt);
  const validUpdated = Boolean(updatedDate && Number.isFinite(updatedDate.getTime()));
  const updatedDisplay = validUpdated ? (updatedText && updatedText !== 'Invalid Date' ? updatedText : updatedDate.toLocaleString('zh-CN', {hour12:false})) : '';
  const visibleTime = updatedDisplay || (createdText && createdText !== 'Invalid Date' ? createdText : '—');
  const timeDetails = [`创建：${createdText && createdText !== 'Invalid Date' ? createdText : '—'}`, ...(validUpdated ? [`修改：${updatedDisplay}`] : [])].join('\n');
  const canActivate = variant === 'sidebar' && Boolean(onActivate) && !editing;
  const activateCard = event => {
    if (!canActivate) return;
    const interactive = event.target instanceof Element && event.target.closest('button,a,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"],[tabindex]');
    if (interactive && interactive !== event.currentTarget) return;
    onActivate();
  };
  return <article className={`review-card comment-card review-card-${variant}${active ? ' review-card-active' : ''}`} aria-current={active ? 'true' : undefined} id={variant === 'sidebar' && a.id ? `note-${a.id}` : undefined} tabIndex={canActivate ? 0 : undefined} onClick={activateCard} onKeyDown={event => { if (canActivate && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onActivate(); } }}>
    <div className={`review-card-head${editing ? ' is-editing' : ''}`}>
      {!editing && <div className="review-body">{a.body}</div>}
      {!editing && <div className="review-tools"><button type="button" title="编辑批注" aria-label="编辑批注" onClick={onEdit}><Pencil1Icon aria-hidden="true" /></button><Tooltip.Provider delayDuration={300}><Tooltip.Root><Tooltip.Trigger asChild><button type="button" className="review-delete" title={deleteHelp} aria-label="删除批注" aria-disabled={deleteDisabled || undefined} onClick={deleteDisabled ? event => event.preventDefault() : onDelete}><TrashIcon aria-hidden="true" /></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="review-tooltip" sideOffset={6} collisionPadding={8}>{deleteHelp}<Tooltip.Arrow className="review-tooltip-arrow" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider></div>}
      {onClose && <button type="button" className="review-close" title="关闭批注" aria-label="关闭批注" onClick={onClose}><Cross2Icon aria-hidden="true" /></button>}
    </div>
    {editing && <div className="review-edit"><ReviewTextarea aria-label="编辑批注内容" value={editText} onChange={e => onEditTextChange?.(e.target.value)} onSubmit={onSaveEdit} /></div>}
    <ReviewExcerpt text={excerpt} onClick={onQuote} />
    <div className="review-meta-row"><div className="review-meta"><MetaValue className="review-time" text={visibleTime} label={timeDetails} />{a.section && <><span className="review-meta-separator" aria-hidden="true"/><MetaValue className="review-section" text={a.section}/></>}</div>{missing && <span className="review-missing">{partial ? '部分内容已变更' : '无法定位'}</span>}</div>
    {editing && <div className="review-actions"><button type="button" onClick={onCancelEdit}>取消</button><button type="button" className="review-primary" disabled={!editText.trim()} onClick={onSaveEdit}>暂存修改</button></div>}
  </article>;
}
