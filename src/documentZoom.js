// Keep zoom local to the preview document. No source file is modified.
// This factory is also serialized into sandboxed HTML previews, so it must
// remain self-contained.
export function createDocumentZoom(doc, mode = 'html') {
  const root = doc.documentElement;
  // Markdown keeps its page geometry fixed: only text changes size. Its
  // renderer uses 16/30/24/19px base sizes for body and h1/h2/h3.
  // The HTML bridge calls this factory without a mode and retains page zoom.
  if (mode === 'markdown') {
    const style = doc.createElement('style');
    style.textContent = `
      body { font-size: calc(16px * var(--openmargin-text-scale, 1)) !important; }
      h1 { font-size: calc(30px * var(--openmargin-text-scale, 1)) !important; }
      h2 { font-size: calc(24px * var(--openmargin-text-scale, 1)) !important; }
      h3 { font-size: calc(19px * var(--openmargin-text-scale, 1)) !important; }
      table, pre, code { font-size: inherit; }
    `;
    (doc.head || root).appendChild(style);
    let current = 100;
    const normalize = value => { const n = Number(value); return Math.min(200, Math.max(50, Math.round((Number.isFinite(n) ? n : 100) / 10) * 10)); };
    return {
      apply(value) {
        current = normalize(value);
        root.style.setProperty('--openmargin-text-scale', String(current / 100));
        return current;
      },
      percent: () => current,
      scale: () => 1,
      point: (x, y) => ({ x, y }),
    };
  }
  const originalValue = root.style.getPropertyValue('zoom');
  const originalPriority = root.style.getPropertyPriority('zoom');
  const initialZoom = Number.parseFloat(doc.defaultView.getComputedStyle(root).zoom);
  const base = Number.isFinite(initialZoom) && initialZoom > 0 ? initialZoom : 1;
  let current = 100;
  const normalize = value => { const n = Number(value); return Math.min(200, Math.max(50, Math.round((Number.isFinite(n) ? n : 100) / 10) * 10)); };
  return {
    apply(value) {
      current = normalize(value);
      if (current === 100) {
        if (originalValue) root.style.setProperty('zoom', originalValue, originalPriority);
        else root.style.removeProperty('zoom');
      } else root.style.setProperty('zoom', String(base * current / 100), 'important');
      return current;
    },
    percent: () => current,
    scale: () => base * current / 100,
    point: (x, y) => ({ x: x / (base * current / 100), y: y / (base * current / 100) }),
  };
}
