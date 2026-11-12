import React, { useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';

/**
 * The selection lives in a sandboxed iframe, so its position is supplied by
 * the host. The anchor is the selection rectangle in host viewport coordinates.
 * The parent owns dismissal: an outside click or Escape must never discard a
 * draft without going through the existing explicit cancel/close controls.
 */
export default function ShellPopover({ open, position, children, onDismiss, compact = false }) {
  const composing = useRef(false);
  const x = Number.isFinite(position?.x) ? position.x : 0;
  const y = Number.isFinite(position?.y) ? position.y : 0;
  const width = Math.max(0, Number(position?.width) || 0), height = Math.max(0, Number(position?.height) || 0);
  return (
    <Popover.Root open={Boolean(open)} modal={false}>
      <Popover.Anchor asChild>
        <span aria-hidden="true" style={{ position: 'fixed', left: x, top: y, width, height, pointerEvents: 'none' }} />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className={compact ? "annotation-popover annotation-popover-compact" : "annotation-popover"}
          aria-label="批注浮窗"
          side={compact ? "top" : "bottom"}
          align={compact ? "center" : "start"}
          sideOffset={8}
          collisionPadding={12}
          style={{ position: 'relative', left: 'auto', top: 'auto' }}
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          onCompositionStartCapture={() => { composing.current = true; }}
          onCompositionEndCapture={() => { composing.current = false; }}
          onPointerDownOutside={event => {
            event.preventDefault();
            const target = event.detail?.originalEvent?.target;
            if (target instanceof Element && target.closest('[data-radix-popper-content-wrapper], [aria-haspopup=menu], [role=menu], [role=tooltip], [role=listbox], [data-workspace-divider], .zoom-controls')) return;
            onDismiss?.();
          }}
          onInteractOutside={event => event.preventDefault()}
          onEscapeKeyDown={event => {
            event.preventDefault();
            if (composing.current || event.isComposing || event.keyCode === 229) return;
            onDismiss?.();
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
