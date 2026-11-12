import React from 'react';
import { createRoot } from 'react-dom/client';
import ReviewCard from '../src/ReviewCard.jsx';
import ReviewComposer from '../src/ReviewComposer.jsx';
import { ShellConfirm } from '../src/ShellConfirm.jsx';
import { CollapseIcon, ExpandIcon } from '../src/ShellIcons.jsx';
import HistoryPanel from '../src/HistoryPanel.jsx';
import HistoryRestoreDialog from '../src/HistoryRestoreDialog.jsx';
import SidebarSwitch from '../src/SidebarSwitch.jsx';
import '../src/style.css';

const root = createRoot(document.getElementById('root'));
window.renderDeleteTest = ({ disabled = false, message = '' } = {}) => root.render(<><ReviewCard annotation={{ body: '批注', quote: '原文' }} onEdit={() => {}} onDelete={() => { window.deleteCalls = (window.deleteCalls || 0) + 1; }} deleteDisabled={disabled} deleteDisabledReason="正在保存" onClose={() => {}} /><ShellConfirm message={message} onCancel={() => {}} onConfirm={() => {}} /></>);
window.renderDeleteTest();

function LayoutFixture({ composer, variant }) {
  const [value, setValue] = React.useState('起始批注');
  return <div className={variant === 'popover' || composer ? 'annotation-popover' : ''} style={variant === 'sidebar' && !composer ? {width: 360} : undefined}>
    {composer ? <ReviewComposer selected={{quote: '被引用的原文'}} note={value} onNoteChange={setValue} onSave={() => { window.submitCalls = (window.submitCalls || 0) + 1; }} /> : <ReviewCard variant={variant} annotation={{body: '起始批注', quote: '被引用的原文', section: '章节'}} createdText="2026/10/29 10:00:00" missing editing editText={value} onEditTextChange={setValue} onSaveEdit={() => { window.submitCalls = (window.submitCalls || 0) + 1; }} onClose={variant === 'popover' ? () => {} : undefined} />}
  </div>;
}
window.renderLayoutTest = options => root.render(<LayoutFixture key={JSON.stringify(options)} {...options} />);
window.renderAreaTest = ({ quote, kind = 'area', active = false }) => {
  window.testAnnotation = { kind, quote, body: '批注正文' };
  root.render(<div style={{width: 250}}><ReviewCard annotation={window.testAnnotation} active={active} onEdit={() => {}} onDelete={() => {}} /></div>);
};
window.renderActivationTest = () => {
  window.activateCalls = 0;
  window.quoteCalls = 0;
  root.render(<div style={{width: 250}}><ReviewCard annotation={{body: '批注正文', quote: '引用正文'}} onActivate={() => window.activateCalls++} onQuote={() => window.quoteCalls++} onEdit={() => {}} onDelete={() => {}} /></div>);
};
function OutlineFixture() {
  const [collapsed, setCollapsed] = React.useState(false);
  return <div className="outline-body" style={{width: 244}}>
    <div className="outline-entry"><button className="outline-toggle" aria-label={collapsed ? '展开 一级' : '收起 一级'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <CollapseIcon /> : <ExpandIcon />}</button><button className="outline-title">一级</button></div>
    {!collapsed && <div className="outline-entry" style={{paddingLeft: 14}}><span className="outline-spacer" aria-hidden="true" /><button className="outline-title">叶节点</button></div>}
  </div>;
}
window.renderOutlineFixture = () => root.render(<OutlineFixture />);
window.renderMissingTest = ({ variant, missing, updatedAt = '2026-10-30T01:12:34.000Z' }) => root.render(<div style={{width:250}}><ReviewCard variant={variant} missing={missing} annotation={{body:'完整批注意见',quote:'一段很长的引用原文用于检查截断和提示',section:'一级章节 / 一个很长的二级章节',updatedAt}} createdText="2026/10/29 08:30:56" updatedText="2026/10/30 09:12:34" onClose={variant==='popover' ? () => {} : undefined} /></div>);
window.renderFloatingTest = ({ variant }) => root.render(<div className={variant==='popover'?'annotation-popover':''} style={variant==='sidebar'?{width:250,padding:14,overflow:'auto'}:undefined}><ReviewCard variant={variant} annotation={{body:'这是一段用于验证操作浮层不改变正文换行与卡片高度的较长批注意见，内容应该完整显示并正常换行。',quote:'原文'}} onEdit={() => {}} onDelete={() => {}} onClose={variant==='popover' ? () => {} : undefined} /></div>);
window.renderExcerptWidthTest = quote => root.render(<div id="excerpt-width-fixture" style={{width: 150}}><ReviewCard annotation={{body:'批注',quote}} onEdit={() => {}} onDelete={() => {}} /></div>);
function SidebarFixture({ entries }) {
  const [view,setView]=React.useState('comments'),[open,setOpen]=React.useState(false);
  return <><div className="toolbar"><div className="tool-left"><button>保存</button></div><div className="tool-right"><div className="zoom-controls"><button>−</button><button>100%</button><button>+</button></div><div className="search"><input aria-label="搜索正文" /></div><SidebarSwitch open={open} view={view} annotationCount={2} historyCount={entries?.length} onSelect={next=>{if(open&&view===next)setOpen(false);else{setView(next);setOpen(true)}}}/></div></div><aside className="comments" hidden={!open}><div className="sidebar-view" hidden={view!=='comments'}><div className="comments-scroll">批注正文</div></div><div className="sidebar-view" hidden={view!=='history'}><HistoryPanel entries={entries} stamp={v=>v} onPreview={entry=>window.historyPreviewEntry=entry} /></div></aside></>;
}
window.renderSidebarTest = entries => root.render(<SidebarFixture key={entries === null ? 'loading' : 'ready'} entries={entries} />);
window.renderHistoryDialogTest = preview => root.render(<HistoryRestoreDialog preview={preview} onCancel={()=>window.historyDialogClosed=true} onRestore={()=>window.historyDialogRestored=true} />);
