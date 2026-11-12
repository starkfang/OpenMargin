// Conservative impact assessment based on the exact rendered preview used for
// navigation. Unknown and partially located annotations must never silently
// reattach to matching text elsewhere after a section disappears.
export function classifySectionAnnotations(doc, headingIndex, annotations, missingIds = [], partialIds = []) {
  const all = new Set(annotations.map(a => a.id));
  if (!doc?.body || !Number.isInteger(headingIndex) || headingIndex < 0) return all;
  const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const heading = headings.filter(h => h.textContent.trim())[headingIndex];
  if (!heading) return all;
  const level = Number(heading.tagName.slice(1));
  const end = headings.slice(headings.indexOf(heading) + 1).find(h => Number(h.tagName.slice(1)) <= level);
  const uncertain = new Set([...missingIds, ...partialIds]);
  try {
    const section = doc.createRange();
    section.setStartBefore(heading);
    if (end) section.setEndBefore(end); else section.setEndAfter(doc.body.lastChild);
    if (section.collapsed) return all;
    const nodes = [...doc.querySelectorAll('[data-om-mark],[data-om-area]')];
    const affected = new Set();
    for (const a of annotations) {
      // Legacy geometry is not a reliable content location after text changes.
      if (uncertain.has(a.id) || (a.kind === 'area' && !a.contentAnchor)) { affected.add(a.id); continue; }
      const marks = nodes.filter(el => (el.dataset.omMark || el.dataset.omArea) === a.id);
      if (!marks.length || marks.some(el => section.intersectsNode(el))) affected.add(a.id);
    }
    return affected;
  } catch {
    return all;
  }
}
