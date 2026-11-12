import { marked } from 'marked';
import { parseFragment } from 'parse5';

function textContent(node) {
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(textContent).join('');
}

// Marked normalizes CR and CRLF before lexing. Retain a map back to the exact
// original offsets so copying and deletion do not change the source bytes.
function normalize(source) {
  let text = '', offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\r') {
      if (source[i + 1] === '\n') i++;
      text += '\n';
    } else text += source[i];
    offsets.push(i + 1);
  }
  return { text, offsets };
}

function hasNestedHeading(token) {
  if (token.type === 'heading') return true;
  if (token.type === 'html' && /<\s*\/?\s*h[1-6](?=[\s/>])/i.test(token.raw || '')) return true;
  return (token.tokens || []).some(hasNestedHeading) || (token.items || []).some(hasNestedHeading);
}

/** Resolve one rendered outline entry to an exact original Markdown range.
 * Returns null when the rendered outline cannot be mapped with confidence.
 */
export function resolveMarkdownSection(source, outline, id) {
  if (typeof source !== 'string' || !Array.isArray(outline) || !Number.isInteger(id)) return null;
  try {
    const { text, offsets } = normalize(source);
    const tokens = marked.lexer(text);
    let offset = 0;
    const headings = [];
    for (const token of tokens) {
      const raw = token.raw || '';
      if (!raw) return null;
      // Link definitions are consumed by the lexer without producing tokens.
      // Only skip a gap when the lexer confirms it contains no block content.
      let start = text.indexOf(raw, offset);
      while (start >= 0 && start !== offset && ((start > 0 && text[start - 1] !== '\n') || marked.lexer(text.slice(offset, start)).length !== 0)) {
        start = text.indexOf(raw, start + 1);
      }
      if (start < 0) return null;
      offset = start + raw.length;
      if (token.type === 'heading') {
        const fragment = parseFragment(marked.parser([token]));
        const heading = (fragment.childNodes || []).find(node => /^h[1-6]$/.test(node.tagName || ''));
        if (!heading || Number(heading.tagName[1]) !== token.depth) return null;
        headings.push({ start, level: token.depth, text: textContent(heading).trim() });
      } else if (hasNestedHeading(token)) {
        // A heading in a container or raw HTML has no independently safe
        // top-level source range; a partial deletion could corrupt the wrapper.
        return null;
      }
    }
    if (marked.lexer(text.slice(offset)).length !== 0) return null;
    const visible = headings.filter(h => h.text);
    if (visible.length !== outline.length || visible.some((h, i) => outline[i]?.id !== i || outline[i]?.level !== h.level || outline[i]?.text !== h.text)) return null;
    const target = visible[id];
    if (!target) return null;
    const index = headings.indexOf(target);
    const next = headings.slice(index + 1).find(h => h.level <= target.level);
    const start = offsets[target.start], end = offsets[next?.start ?? text.length];
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
    return { start, end, raw: source.slice(start, end), level: target.level, text: target.text };
  } catch {
    return null;
  }
}
