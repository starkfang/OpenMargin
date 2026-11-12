import React from 'react';
import { CommentsIcon, HistoryIcon } from './ShellIcons';

export default function SidebarSwitch({ open, view, annotationCount, historyCount, onSelect }) {
  return <div className="sidebar-switch" role="group" aria-label="侧栏视图">
    <button type="button" aria-pressed={open && view === 'comments'} onClick={() => onSelect('comments')}><CommentsIcon/> <span>批注 {annotationCount}</span></button>
    <button type="button" aria-pressed={open && view === 'history'} onClick={() => onSelect('history')}><HistoryIcon/> <span>记录 {historyCount ?? '—'}</span></button>
  </div>;
}
