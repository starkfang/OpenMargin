// Self-contained so the same check can run inside an opaque-origin preview.
export function connectorClearance(doc,bounds) {
  try {
    if (!doc?.body || !Array.isArray(bounds) || !bounds.length || bounds.some(b=>!['left','right','top','bottom'].every(k=>Number.isFinite(b[k])))) return false;
    if (doc.fonts?.status === 'loading' || doc.getAnimations?.().some(a=>a.playState==='running')) return false;
    const hits=r=>r.width>0&&r.height>0&&bounds.some(b=>r.right>b.left&&r.left<b.right&&r.bottom>b.top&&r.top<b.bottom);
    const ignored=e=>e?.closest?.('script,style,noscript,[data-om-area]:not(mark),[data-om-draft]');
    const w=doc.createTreeWalker(doc.body,4);let node,count=0;
    while ((node=w.nextNode())) {
      if (++count>15000) return false;
      if (!node.nodeValue?.trim() || ignored(node.parentElement)) continue;
      const range=doc.createRange();range.selectNodeContents(node);
      if ([...range.getClientRects()].some(hits)) return false;
    }
    const elements=doc.querySelectorAll('body *');if(elements.length>5000)return false;
    for (const el of elements) {
      if (ignored(el)) continue;
      const tag=el.localName;
      if (tag==='img'&&!el.complete) return false;
      const style=doc.defaultView.getComputedStyle(el);
      const visual=el.matches('img,svg,canvas,video,iframe,object,embed,input,textarea,select,button,audio,a[href],hr,[contenteditable],[role="button"],[onclick],[tabindex]')||style.backgroundImage!=='none';
      // Generated content has no independent client rect, so its parent is an obstacle.
      const before=doc.defaultView.getComputedStyle(el,'::before').content, after=doc.defaultView.getComputedStyle(el,'::after').content;
      if ((visual||!['none','normal'].includes(before)||!['none','normal'].includes(after))&&hits(el.getBoundingClientRect())) return false;
    }
    return true;
  } catch { return false; }
}
