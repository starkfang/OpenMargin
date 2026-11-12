'use strict';
// Prepare an isolated preview without altering the original HTML. Only explicit,
// supported files within the document directory may be read.
const fs = require('node:fs/promises');
const path = require('node:path');
const MIME = {'.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav'};
const LIMIT = 8 * 1024 * 1024, TOTAL = 32 * 1024 * 1024;
async function inlineHtmlAssets(content, docPath) {
  if (typeof content !== 'string' || !path.isAbsolute(docPath)) throw new Error('INVALID_DOCUMENT');
  const { parse } = await import('parse5');
  const root = await fs.realpath(path.dirname(docPath));
  let total = 0;
  const cache = new Map();
  async function readAsset(ref, dir, depth = 0) {
    if (depth > 4 || typeof ref !== 'string' || !ref || /^(?:[a-z][\w+.-]*:|\/\/|\/|#)/i.test(ref)) return ref;
    let name;
    try { name = decodeURIComponent(ref.split(/[?#]/, 1)[0]); } catch { return ref; }
    if (!name || name.includes('\0') || name.includes('\\')) return ref;
    const absolute = path.resolve(dir, name), rel = path.relative(root, absolute);
    if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) return ref;
    const ext = path.extname(absolute).toLowerCase(), mime = MIME[ext];
    if (!mime) return ref;
    try {
      const actual = await fs.realpath(absolute), actualRel = path.relative(root, actual);
      if (actualRel.startsWith('..' + path.sep) || actualRel === '..' || path.isAbsolute(actualRel)) return ref;
      const st = await fs.stat(actual);
      if (!st.isFile() || st.size > LIMIT || total + st.size > TOTAL) return ref;
      const key = actual + '#' + depth;
      if (cache.has(key)) return cache.get(key);
      total += st.size;
      let bytes = await fs.readFile(actual);
      if (ext === '.css') bytes = Buffer.from(await replaceCss(bytes.toString('utf8'), path.dirname(actual), depth + 1));
      const data = `data:${mime};base64,${bytes.toString('base64')}`;
      cache.set(key, data);
      return data;
    } catch { return ref; }
  }
  async function replaceAsync(input, re, handler) {
    let out = '', last = 0, match;
    while ((match = re.exec(input))) { out += input.slice(last, match.index) + await handler(match); last = re.lastIndex; }
    return out + input.slice(last);
  }
  async function replaceCss(css, dir, depth = 0) {
    // Quoted imports have no url() wrapper; unquoted @import url(...) is handled below.
    css = await replaceAsync(css, /@import\s+(["'])([^"']+)\1/gi, async m => `@import ${m[1]}${await readAsset(m[2], dir, depth)}${m[1]}`);
    return replaceAsync(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async m => {
      const val = await readAsset(m[2].trim(), dir, depth);
      return `url("${val.replace(/"/g, '%22')}")`;
    });
  }
  async function replaceSrcset(value) {
    // A data URL can itself contain commas. Preserve mixed data srcsets until a
    // complete srcset parser is available, rather than damaging a valid value.
    if (/(?:^|,)\s*data:/i.test(value)) return value;
    const candidates = value.split(',');
    for (let i = 0; i < candidates.length; i++) {
      const match = candidates[i].match(/^(\s*)(\S+)([\s\S]*)$/);
      if (match) candidates[i] = match[1] + await readAsset(match[2], root) + match[3];
    }
    return candidates.join(',');
  }
  const patches = [];
  const escapeAttr = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  async function walk(node) {
    const tag = node.tagName?.toLowerCase();
    if (tag === 'style' && node.sourceCodeLocation?.startTag && node.sourceCodeLocation?.endTag) {
      const start = node.sourceCodeLocation.startTag.endOffset, end = node.sourceCodeLocation.endTag.startOffset;
      const css = content.slice(start, end), replacement = await replaceCss(css, root);
      if (replacement !== css) patches.push({ start, end, replacement });
    }
    const attrs = node.sourceCodeLocation?.attrs || {};
    for (const attr of node.attrs || []) {
      const loc = attrs[attr.name];
      if (!loc) continue;
      let result = attr.value;
      if (attr.name === 'style') result = await replaceCss(result, root);
      else if (attr.name === 'srcset' && ['img', 'source'].includes(tag)) result = await replaceSrcset(result);
      else if (['script','link','img','source','video','audio'].includes(tag) && ['src','href','poster'].includes(attr.name)) result = await readAsset(result, root);
      if (result !== attr.value) patches.push({start:loc.startOffset, end:loc.endOffset, replacement:`${attr.name}="${escapeAttr(result)}"`});
    }
    for (const child of node.childNodes || []) await walk(child);
    // Template contents are inert until the page activates them. Still embed their
    // explicit resources to preserve the same functionality after activation.
    if (node.content) await walk(node.content);
  }
  await walk(parse(content, {sourceCodeLocationInfo:true}));
  patches.sort((a,b) => b.start - a.start);
  let output = content;
  for (const patch of patches) output = output.slice(0,patch.start) + patch.replacement + output.slice(patch.end);
  return output;
}
module.exports = { inlineHtmlAssets };
