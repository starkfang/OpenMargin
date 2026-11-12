import React from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Cross2Icon } from '@radix-ui/react-icons';
import HistoryCompare from './HistoryCompare.jsx';
import './HistoryRestoreDialog.css';

export default function HistoryRestoreDialog({preview,onCancel,onRestore}) {
  const [mode,setMode]=React.useState('details');
  React.useEffect(()=>{if(preview)setMode('details')},[preview]);
  const restoring=mode==='restore', before=preview?.before??preview?.target??'', after=preview?.after??'', current=preview?.current??'';
  return <AlertDialog.Root open={Boolean(preview)} onOpenChange={open=>{if(!open)onCancel()}}>
    <AlertDialog.Portal><AlertDialog.Overlay className="confirm-overlay"><AlertDialog.Content className="history-restore-dialog">
      <div className="history-dialog-head"><div><AlertDialog.Title>{restoring?'确认恢复正文':'修改详情'}</AlertDialog.Title><div className="history-dialog-meta">{preview?.recordedAt}{preview?.section?' · '+preview.section:''}</div></div><button type="button" className="history-dialog-close" aria-label="关闭详情" onClick={onCancel}><Cross2Icon aria-hidden="true"/></button></div>
      <AlertDialog.Description className="history-dialog-description">{restoring?'确认恢复目标并暂存为正文草稿。':'查看该次修改前后的正文。'}</AlertDialog.Description>
      {restoring&&<p className="history-dialog-warning">将整份正文恢复到这次修改前，此后的修改{preview?.dirty?'及当前未保存内容':''}也会被替换。批注保留，点击顶部保存后才写入文件。</p>}
      {restoring&&preview?.unmapped?<p className="history-dialog-warning">当前原位草稿无法完整映射，无法准确对比。请先保存或取消原位草稿，再恢复历史正文。</p>:<HistoryCompare key={mode} before={restoring?current:before} after={restoring?before:after} leftLabel={restoring?(preview?.dirty?'当前正文 · 含未保存修改':'当前正文'):'修改前'} rightLabel={restoring?'恢复后':'修改后'} leftTime={restoring?'现在':'该次修改之前'} rightTime={restoring?'该次修改之前':'该次修改之后'}/>}
      <div className="history-dialog-footer"><span>{restoring?'批注保留 · 保存后才写入文件':'正在查看这次修改'}</span><div className="history-dialog-actions">{restoring?<button type="button" onClick={()=>setMode('details')}>返回详情</button>:<button type="button" onClick={onCancel}>关闭</button>}{restoring?<button type="button" className="primary" disabled={!!preview?.unmapped} onClick={onRestore}>恢复到草稿</button>:<button type="button" className="primary" onClick={()=>setMode('restore')}>恢复到修改前…</button>}</div></div>
    </AlertDialog.Content></AlertDialog.Overlay></AlertDialog.Portal>
  </AlertDialog.Root>;
}
