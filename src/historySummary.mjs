// Compute bounded, readable snippets around actual changes. The original texts
// stay untouched for the expanded view. Bounded LCS avoids quadratic work on
// large files; large inputs fall back to a common-prefix/suffix change span.
function coarse(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - end - 1] === after[after.length - end - 1]) end++;
  return before === after ? [] : [{ before: before.slice(start, before.length - end), after: after.slice(start, after.length - end) }];
}
function lcsChanges(left, right, join) {
  const width = right.length + 1;
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(width));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--)
    table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const chunks = []; let i = 0, j = 0, removed = [], added = [], startI = 0, startJ = 0;
  const flush = () => { if (removed.length || added.length) chunks.push({before: join(removed), after: join(added), startI, endI:i, startJ, endJ:j}); removed = []; added = []; };
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { flush(); i++; j++; }
    else { if (!removed.length && !added.length) { startI=i; startJ=j; } if (j < right.length && (i === left.length || table[i][j + 1] > table[i + 1][j])) added.push(right[j++]); else removed.push(left[i++]); }
  }
  flush(); return chunks;
}
function changes(before, after) {
  if (!before || !after) return coarse(before, after);
  const a = before.match(/[^\n]*\n|[^\n]+$/g) || [], b = after.match(/[^\n]*\n|[^\n]+$/g) || [];
  const lineGroups = a.length * b.length <= 200000 ? lcsChanges(a, b, x => x.join('')) : coarse(before, after);
  return lineGroups.flatMap(group => {
    if (!group.before || !group.after) return coarse(group.before, group.after);
    const left = Array.from(group.before), right = Array.from(group.after);
    if (left.length * right.length > 160000) {
      let start=0,end=0;
      while(start<left.length&&start<right.length&&left[start]===right[start])start++;
      while(end<left.length-start&&end<right.length-start&&left[left.length-end-1]===right[right.length-end-1])end++;
      return [{before:left.slice(start,left.length-end).join(''),after:right.slice(start,right.length-end).join(''),beforeContext:sentenceContext(left,start,left.length-end),afterContext:sentenceContext(right,start,right.length-end)}];
    }
    const merged=[];
    for(const h of lcsChanges(left, right, x => x.join(''))){
      const previous=merged[merged.length-1];
      if(previous&&h.startI-previous.endI<=8&&h.startJ-previous.endJ<=8){
        previous.endI=h.endI;previous.endJ=h.endJ;
        previous.before=left.slice(previous.startI,previous.endI).join('');
        previous.after=right.slice(previous.startJ,previous.endJ).join('');
      }else merged.push({...h});
    }
    return merged.map(h => ({...h,
      beforeContext: sentenceContext(left,h.startI,h.endI),
      afterContext: sentenceContext(right,h.startJ,h.endJ),
    }));
  }).filter(x => x.before !== x.after);
}
function sentenceContext(chars,start,end) {
  const boundary=ch=>/[。！？；\r\n]/u.test(ch || '');
  let left=start,right=end;
  while(left>0&&!boundary(chars[left-1])&&start-left<200)left--;
  while(right<chars.length&&!boundary(chars[right])&&right-end<200)right++;
  if(right<chars.length&&/[。！？；]/u.test(chars[right]))right++;
  return {left:chars.slice(left,start).join(''),right:chars.slice(end,right).join(''),leftOmitted:left>0&&!boundary(chars[left-1]),rightOmitted:right<chars.length&&!boundary(chars[right-1])};
}
function snippet(value, absent, action, context) {
  if (!value) {
    const left=context?.left.replace(/\s+/gu,' ')||'',right=context?.right.replace(/\s+/gu,' ')||'';
    if(!(left+right).trim())return absent;
    const leftBudget=right.length<70?140-right.length:70,rightBudget=140-Math.min(left.length,leftBudget);
    return (context.leftOmitted||left.length>leftBudget?'…':'')+left.slice(-leftBudget)+right.slice(0,rightBudget)+(context.rightOmitted||right.length>rightBudget?'…':'');
  }
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    const kinds = [];
    if (/[\r\n]/u.test(value)) kinds.push('换行');
    if (/\t/u.test(value)) kinds.push('制表符');
    if (/[^\S\r\n\t]/u.test(value)) kinds.push('空格');
    return `（${action}${kinds.join('和') || '空白'}）`;
  }
  if(!context)return normalized.length > 90 ? normalized.slice(0, 90) + '…' : normalized;
  const changed=normalized.length>100?normalized.slice(0,100)+'…':normalized;
  const left=context.left.replace(/\s+/gu,' '),right=context.right.replace(/\s+/gu,' '),budget=Math.max(0,140-changed.length),leftBudget=Math.floor(budget/2),rightBudget=budget-leftBudget;
  return (context.leftOmitted||left.length>leftBudget?'…':'')+(leftBudget?left.slice(-leftBudget):'')+changed+right.slice(0,rightBudget)+(context.rightOmitted||right.length>rightBudget?'…':'');
}
export function summarizeHistory(before = '', after = '') {
  before = String(before); after = String(after);
  const hunks = changes(before, after);
  if (!hunks.length) return {before: '（无变化）', after: '（无变化）', omitted: 0};
  const unique=[];for(const h of hunks){const item={before:snippet(h.before,'（无删除内容）','删除',h.beforeContext),after:snippet(h.after,'（无新增内容）','新增',h.afterContext)};if(!unique.some(x=>x.before===item.before&&x.after===item.after))unique.push(item)}
  const selected = unique.slice(0, 3);
  return {
    before: selected.map(x => x.before).join(' ··· '),
    after: selected.map(x => x.after).join(' ··· '),
    omitted: Math.max(0, unique.length - selected.length),
  };
}
