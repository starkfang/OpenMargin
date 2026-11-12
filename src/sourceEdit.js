import { parse, parseFragment } from 'parse5';
import { marked } from 'marked';

// Map only plain, visible Markdown text tokens back to exact source spans.
// A decoded entity is safe when the complete token is the edited text; for
// more complex formatting we refuse instead of guessing a source position.
function markdownCandidates(source, quote) {
  const candidates=[], offsets=[0];let normalized='';
  for(let i=0;i<source.length;){if(source[i]==='\r'){i+=source[i+1]==='\n'?2:1;normalized+='\n'}else normalized+=source[i++];offsets.push(i)}
  function textToken(raw, offset) {
    const children=parseFragment(raw).childNodes || [];
    if(children.length!==1||children[0].nodeName!=='#text')return;
    const visible=children[0].value;
    if(visible===quote){candidates.push({start:offset,end:offset+raw.length});return}
    if(visible!==raw)return;
    let at=-1;while((at=raw.indexOf(quote,at+1))>=0)candidates.push({start:offset+at,end:offset+at+quote.length});
  }
  function sequence(tokens,raw,offset) {
    let cursor=0;
    for(const token of tokens||[]){
      if(typeof token.raw!=='string'||!token.raw)continue;
      const at=raw.indexOf(token.raw,cursor);if(at<0)return;
      cursor=at+token.raw.length;visit(token,offset+at);
    }
  }
  function table(token,offset) {
    const rows=token.raw.match(/[^\n]*\n|[^\n]+$/g)||[];
    const cells=[token.header||[],...(token.rows||[])];let lineOffset=0;
    for(let i=0;i<rows.length;i++){
      const line=rows[i];if(i!==1){const group=cells[i===0?0:i-1];let cursor=0;
        for(const cell of group||[]){const text=cell.text||'',at=line.indexOf(text,cursor);if(at<0)continue;cursor=at+text.length;sequence(cell.tokens,text,offset+lineOffset+at)}
      }lineOffset+=line.length;
    }
  }
  function visit(token,offset) {
    if(token.type==='text'&&!token.tokens){textToken(token.raw,offset);return}
    if(token.type==='table'){table(token,offset);return}
    if(token.type==='list'){sequence(token.items,token.raw,offset);return}
    if(['paragraph','heading','text','list_item','blockquote'].includes(token.type))sequence(token.tokens,token.raw,offset);
  }
  try{sequence(marked.lexer(normalized),normalized,0)}catch{return []}
  return candidates.map(({start,end})=>({start:offsets[start],end:offsets[end]}));
}

/**
 * Replace literal, rendered text only when its source is unambiguous.
 * The caller owns saving, conflict detection, history and user feedback.
 */
function resolveRenderedEdit({ type, source, quote, replacement, domPath }) {
  if (typeof source !== 'string' || typeof quote !== 'string' || !quote || typeof replacement !== 'string') return { error: '无法确定要修改的文字。' };
  if (replacement.includes('\n') || replacement.includes('\r')) return { error: '原位修改暂不支持跨行，请使用源码编辑或批注。' };
  if (type === 'md') {
    const candidates=markdownCandidates(source,quote);
    if (candidates.length!==1 || quote.includes('\n')) return { error: '无法在 Markdown 源文件中唯一定位这段文字，请使用源码编辑或批注。' };
    const {start:at,end}=candidates[0];
    // Treat the replacement as plain text, not Markdown syntax. Escape characters
    // that can change inline formatting or the structure of a table cell.
    const value = replacement.replace(/&/g,'&amp;').replace(/\\/g, '\\\\').replace(/([`*_\[\]<>|])/g, '\\$1');
    const prefix = source.slice(0, at).split('\n').pop();
    const protectedValue = /^\s*$/.test(prefix) ? value.replace(/^(\s*)([#>+-])(?=\s)/, '$1\\$2').replace(/^(\s*\d+)(\.)(?=\s)/, '$1\\$2') : value;
    return { start: at, end, value: protectedValue };
  }
  if (type !== 'html') return { error: '暂不支持这种文件格式。' };
  const doc = parse(source, { sourceCodeLocationInfo: true });
  // For an editable preview element, verify its full structural path and entire
  // original text against the source. This can distinguish duplicate text while
  // refusing generated, reformatted, cross-element or entity-encoded content.
  if (domPath !== undefined) {
    if (!Array.isArray(domPath) || domPath.length < 2 || domPath.length > 64 ||
        domPath.some(part => !part || typeof part.tag !== 'string' || !/^[a-z][a-z0-9-]*$/.test(part.tag) ||
          !Number.isSafeInteger(part.index) || part.index < 0 || part.index > 10000)) {
      return { error: '无法确认正文位置，请使用批注或源码编辑。' };
    }
    let node = doc;
    for (const part of domPath) {
      const candidates = (node.childNodes || []).filter(child => child.tagName === part.tag);
      node = candidates[part.index];
      if (!node) return { error: '页面内容与源文件结构不一致，请使用批注或源码编辑。' };
    }
    const allowed = ['p','h1','h2','h3','h4','h5','h6','li','td','th','span','div'];
    const children = node.childNodes || [];
    if (!allowed.includes(node.tagName) || children.length !== 1 || children[0].nodeName !== '#text' ||
        children[0].value !== quote || !children[0].sourceCodeLocation) {
      return { error: '此处内容与源文件不一致或含复杂格式，请使用批注或源码编辑。' };
    }
    const {startOffset, endOffset} = children[0].sourceCodeLocation;
    if (source.slice(startOffset, endOffset) !== quote) return { error: '此处包含实体或特殊格式，请使用批注或源码编辑。' };
    const value = replacement.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return {start: startOffset, end: endOffset, value};
  }
  let hasScript = false;
  const candidates = [];
  function visit(node, blocked = false) {
    const tag = node.tagName?.toLowerCase();
    if (tag === 'script') hasScript = true;
    const skip = blocked || ['script','style','template','noscript','textarea','title'].includes(tag);
    if (node.nodeName === '#text' && !skip && node.sourceCodeLocation) {
      const { startOffset, endOffset } = node.sourceCodeLocation;
      const raw = source.slice(startOffset, endOffset);
      // Only literal text can be mapped precisely; entity spellings and markup are
      // deliberately left to source editing instead of guessing their offsets.
      if (raw === node.value) {
        let pos = -1;
        while ((pos = raw.indexOf(quote, pos + 1)) >= 0) candidates.push(startOffset + pos);
      }
    }
    for (const child of node.childNodes || []) visit(child, skip);
    if (node.content) visit(node.content, true);
  }
  visit(doc);
  if (hasScript) return { error: '此 HTML 含脚本，无法保证选中文字对应静态源内容，请使用批注或源码编辑。' };
  if (candidates.length !== 1) return { error: '无法在 HTML 源文件中唯一定位这段静态文字，请使用批注或源码编辑。' };
  const value = replacement.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const at = candidates[0];
  return { start: at, end: at + quote.length, value };
}

// Resolve every change against the same original source before applying any patch.
// Newly inserted text must never change how a later edit is located.
export function applyRenderedEdits({ type, source, changes }) {
  if (typeof source !== 'string' || !Array.isArray(changes) || changes.length > 5000) {
    return { error: '无法确认原位编辑草稿，修改尚未保存。' };
  }
  const patches = [];
  for (const change of changes) {
    if (!change || typeof change.before !== 'string' || typeof change.after !== 'string') {
      return { error: '原位编辑草稿不完整，修改尚未保存。' };
    }
    if (change.before === change.after) continue;
    const patch = resolveRenderedEdit({type, source, quote: change.before, replacement: change.after, domPath: change.domPath});
    if (patch.error) return patch;
    patches.push(patch);
  }
  patches.sort((a,b) => a.start - b.start);
  for (let i = 1; i < patches.length; i++) {
    if (patches[i].start < patches[i-1].end) return {error: '多处修改的位置重叠，修改尚未保存，请检查正文。'};
  }
  let content = source;
  for (const {start,end,value} of patches.reverse()) content = content.slice(0,start) + value + content.slice(end);
  return {content};
}

export function applyRenderedText({type, source, quote, replacement, domPath}) {
  const patch = resolveRenderedEdit({type, source, quote, replacement, domPath});
  return patch.error ? patch : {content: source.slice(0,patch.start) + patch.value + source.slice(patch.end)};
}
