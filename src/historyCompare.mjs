// Compare line sequences without changing either version. Rows share a grid
// track, so unequal wrapped text stays vertically aligned without fixed heights.
export function historyCompare(before='',after='') {
  before=String(before);after=String(after);
  const a=before===''?[]:before.split('\n'),b=after===''?[]:after.split('\n');
  const operations=[];
  if(!a.length||!b.length){
    for(const value of a)operations.push({kind:'remove',value});
    for(const value of b)operations.push({kind:'add',value});
  }else if(a.length*b.length<=2000000){
    const table=Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));
    for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)
      table[i][j]=a[i]===b[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
    let i=0,j=0;
    while(i<a.length||j<b.length){
      if(i<a.length&&j<b.length&&a[i]===b[j]){operations.push({kind:'same',value:a[i]});i++;j++}
      else if(j<b.length&&(i===a.length||table[i][j+1]>table[i+1][j]))operations.push({kind:'add',value:b[j++]});
      else operations.push({kind:'remove',value:a[i++]});
    }
  }else{
    let start=0,end=0;
    while(start<a.length&&start<b.length&&a[start]===b[start])start++;
    while(end<a.length-start&&end<b.length-start&&a[a.length-end-1]===b[b.length-end-1])end++;
    for(let i=0;i<start;i++)operations.push({kind:'same',value:a[i]});
    for(let i=start;i<a.length-end;i++)operations.push({kind:'remove',value:a[i]});
    for(let i=start;i<b.length-end;i++)operations.push({kind:'add',value:b[i]});
    for(let i=a.length-end;i<a.length;i++)operations.push({kind:'same',value:a[i]});
  }
  const groups=[];let i=0;
  while(i<operations.length){
    if(operations[i].kind==='same'){
      const lines=[];while(i<operations.length&&operations[i].kind==='same')lines.push(operations[i++].value);
      groups.push({kind:'same',lines});
    }else{
      const removed=[],added=[];
      while(i<operations.length&&operations[i].kind!=='same'){const op=operations[i++];(op.kind==='remove'?removed:added).push(op.value)}
      groups.push({kind:'change',removed,added});
    }
  }
  return {groups,changes:groups.filter(g=>g.kind==='change').length,coarse:a.length*b.length>2000000};
}
