'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {checkedReplace} = require('./checkedReplace.cjs');
const MD_START = '\n\n<!-- OPENMARGIN:REVIEW:START -->\n';
const MD_END = '\n<!-- OPENMARGIN:REVIEW:END -->';
const HTML_START = '\n\n<!-- OPENMARGIN:REVIEW:START\n';
const HTML_END = '\nOPENMARGIN:REVIEW:END -->';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonSafe = value => JSON.stringify(value, null, 2).replace(/--/g, '\\u002d\\u002d');
const validAnnotation = a => a && typeof a === 'object' && !Array.isArray(a) && ['body','quote','section'].every(key => a[key] == null || typeof a[key] === 'string') && ['createdAt','updatedAt'].every(key => a[key] == null || typeof a[key] === 'string' || typeof a[key] === 'number');
function typeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (['.md', '.markdown'].includes(ext)) return 'md';
  if (['.html', '.htm'].includes(ext)) return 'html';
  throw new Error('UNSUPPORTED_FILE');
}
function stringifyField(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return stringifyField(value);
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function humanText(annotations) {
  return annotations.map((a, i) => {
    const quote = stringifyField(a.quote || a.selectedText || a.text || a.anchor?.quote || '区域批注');
    const comment = stringifyField(a.comment ?? a.body ?? a.message ?? a.content ?? '');
    const date = localDateTime(a.createdAt ?? a.timestamp ?? a.created ?? '');
    const updated = localDateTime(a.updatedAt);
    const section = stringifyField(a.section ?? a.heading ?? a.anchor?.section ?? '');
    return `### 批注 ${i + 1}${date ? '｜' + date : ''}\n${updated ? '- 修改时间：' + updated + '\n' : ''}- 所在章节：${section}\n- 引用内容：${quote.replace(/\n/g, '\n  ')}\n- 批注意见：${comment.replace(/\n/g, '\n  ')}`;
  }).join('\n\n');
}
function encode(content, annotations, type) {
  if (!Array.isArray(annotations) || !annotations.length) return content;
  const payload = jsonSafe(annotations);
  if (type === 'html') return `${content}${HTML_START}${payload}${HTML_END}`;
  return `${content}${MD_START}\n## 审阅批注\n\n${humanText(annotations.filter(validAnnotation))}\n\n<!-- OPENMARGIN:DATA\n${payload}\nOPENMARGIN:DATA:END -->${MD_END}`;
}
function decode(raw, type) {
  const start = type === 'html' ? HTML_START : MD_START;
  const end = type === 'html' ? HTML_END : MD_END;
  // Only claim a well-formed terminal block created by OpenMargin; otherwise never drop source.
  const trimmed = raw.endsWith('\n') ? raw.replace(/\n+$/, '') : raw;
  if (!trimmed.endsWith(end)) return {content: raw, annotations: []};
  const idx = trimmed.lastIndexOf(start);
  if (idx < 0) return {content: raw, annotations: []};
  const block = trimmed.slice(idx + start.length, -end.length);
  try {
    let payload = block;
    if (type === 'md') {
      const match = block.match(/<!-- OPENMARGIN:DATA\n([\s\S]*?)\nOPENMARGIN:DATA:END -->\s*$/);
      if (!match) return {content: raw, annotations: []};
      payload = match[1];
    }
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) throw new Error('Invalid annotations');
    const annotations = parsed.filter(validAnnotation), invalidAnnotations = parsed.filter(a => !validAnnotation(a));
    const invalidCount = invalidAnnotations.length;
    return {content: trimmed.slice(0, idx), annotations, ...(invalidCount ? {invalidAnnotations, reviewWarning: `${invalidCount} 条格式无效的批注无法显示，原数据将保留`} : {})};
  } catch { return {content: raw, annotations: []}; }
}
async function readDocument(file) {
  const type = typeFor(file);
  const [raw, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
  return {path:file, name:path.basename(file), type, ...decode(raw, type), hash:hash(raw), mtime:stat.mtimeMs};
}
async function writeDocument({path:file, content, annotations, expectedHash}) {
  if (typeof content !== 'string' || !Array.isArray(annotations) || typeof expectedHash !== 'string') throw new Error('INVALID_DOCUMENT');
  const current = await fs.readFile(file, 'utf8');
  if (hash(current) !== expectedHash) throw new Error('FILE_CONFLICT');
  const type = typeFor(file);
  const retained = decode(current, type).invalidAnnotations || [];
  const next = encode(content, [...annotations, ...retained], type);
  if (next !== current) {
    // Check again immediately before writing. Atomic rename protects against incomplete writes.
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.openmargin-${crypto.randomUUID()}.tmp`);
    const stat = await fs.stat(file);
    try {
      await fs.writeFile(temp, next, {flag:'wx', mode:stat.mode});
      await checkedReplace(temp, file, expectedHash);
    } finally { await fs.unlink(temp).catch(() => {}); }
  }
  return readDocument(file);
}
module.exports = {encode, decode, hash, typeFor, readDocument, writeDocument};
