import React, { useRef } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

// The caller owns the pending confirmation and restores the original focus.
export function ShellConfirm({ message, onCancel, onConfirm, onSave, onDiscard, destructive = message === '删除这条批注？' }) {
  const inlineExit = message?.kind === 'inline-exit';
  const text = inlineExit ? message.message : message;
  const cancelRef = useRef(null);
  return (
    <AlertDialog.Root open={Boolean(message)} onOpenChange={open => { if (!open) onCancel(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="confirm-overlay">
          <AlertDialog.Content
            className="confirm-dialog"
            onOpenAutoFocus={event => { event.preventDefault(); cancelRef.current?.focus(); }}
            onCloseAutoFocus={event => event.preventDefault()}
          >
            <AlertDialog.Title>确认操作</AlertDialog.Title>
            <AlertDialog.Description>{text}</AlertDialog.Description>
            <div className="confirm-actions">
              <AlertDialog.Cancel asChild><button ref={cancelRef} type="button">{inlineExit ? '继续编辑' : '取消'}</button></AlertDialog.Cancel>
              {inlineExit ? <><button type="button" onClick={onDiscard}>不保存</button><button type="button" className="primary" onClick={onSave}>保存并退出</button></> : <AlertDialog.Action asChild><button className={destructive ? 'primary confirm-destructive' : 'primary'} type="button" onClick={event => { event.preventDefault(); onConfirm(); }}>确认</button></AlertDialog.Action>}
            </div>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
