// Map DOM boundary points to the filtered text stream used by the matcher.
export function selectionContext(doc, nodes, full, range) {
  function offset(container, offset) {
    for (const item of nodes) {
      const node = item.n;
      if (node === container) return item.start + offset;
      const nodeRange = doc.createRange();
      nodeRange.selectNodeContents(node);
      if (nodeRange.comparePoint(container, offset) <= 0) return item.start;
    }
    return full.length;
  }
  try {
    const start = offset(range.startContainer, range.startOffset), end = offset(range.endContainer, range.endOffset);
    const selected = full.slice(start, end), quote = selected.trim();
    if (!quote) return null;
    const at = start + selected.indexOf(quote);
    return {quote, before:full.slice(Math.max(0, at - 40), at), after:full.slice(at + quote.length, at + quote.length + 40)};
  } catch { return null; }
}
