// Put the vertical segment near the sidebar, in the document's right gutter.
export function annotationConnectorGeometry({x,y,endX,endY}) {
  const dx=endX-x, dy=endY-y;
  if (!dx || !dy) return {x,y,endX,endY,mid:x,r:0};
  const mid=endX-Math.sign(dx)*Math.min(20,Math.abs(dx)/2);
  const r=Math.min(6,Math.abs(mid-x)/2,Math.abs(endX-mid)/2,Math.abs(dy)/2);
  return {x,y,endX,endY,mid,r};
}
export function annotationConnectorPath(points) {
  if(Array.isArray(points?.points))return roundedPath(points.points);
  const {x,y,endX,endY,mid,r}=annotationConnectorGeometry(points);
  if (!r) return `M ${x} ${y} L ${endX} ${endY}`;
  const sx=Math.sign(endX-x), sy=Math.sign(endY-y);
  return `M ${x} ${y} H ${mid-sx*r} Q ${mid} ${y} ${mid} ${y+sy*r} V ${endY-sy*r} Q ${mid} ${endY} ${mid+sx*r} ${endY} H ${endX}`;
}
// Bounding boxes conservatively cover the strokes and both rounded corners.
export function annotationConnectorBounds(points,originX=0,originY=0) {
  if(Array.isArray(points?.points))return roundedBounds(points.points,originX,originY);
  const {x,y,endX,endY,mid,r}=annotationConnectorGeometry(points), pad=1.5;
  const rect=(x1,y1,x2,y2)=>({left:Math.min(x1,x2)-originX-pad,top:Math.min(y1,y2)-originY-pad,right:Math.max(x1,x2)-originX+pad,bottom:Math.max(y1,y2)-originY+pad});
  if (!r) {const length=Math.hypot(endX-x,endY-y);if(length<=3)return [rect(x,y,endX,endY)];return [rect(x+(endX-x)*2/length,y+(endY-y)*2/length,endX,endY)];}
  const sx=Math.sign(endX-x);
  return [rect(x+sx*2,y,mid,y),rect(mid-r,y-r,mid+r,y+r),rect(mid,y,mid,endY),rect(mid-r,endY-r,mid+r,endY+r),rect(mid,endY,endX,endY)];
}

// The preview and sidebar share root-window coordinates. Clip each fragment to
// the actual visible preview before selecting any boundary as an anchor.
export function connectorCandidates(rects, bounds, endX, endY) {
  if (!Array.isArray(rects)||!bounds||![bounds.left,bounds.top,bounds.right,bounds.bottom,endX,endY].every(Number.isFinite)||bounds.right<=bounds.left||bounds.bottom<=bounds.top) return [];
  const result=[];
  const add=(points,rectIndex,side)=>{
    const clean=orthogonalPoints(points);if(!clean||clean.length<2)return;
    const first=clean[0],last=clean[clean.length-1];
    result.push({x:first.x,y:first.y,endX:last.x,endY:last.y,points:clean,rectIndex,side});
  };
  for(let i=0;i<Math.min(rects.length,128);i++){
    const r=rects[i];if(!r)continue;
    const l=Number.isFinite(r.left)?r.left:r.x, t=Number.isFinite(r.top)?r.top:r.y;
    const rr=Number.isFinite(r.right)?r.right:(Number.isFinite(l)&&Number.isFinite(r.width)?l+r.width:NaN);
    const bb=Number.isFinite(r.bottom)?r.bottom:(Number.isFinite(t)&&Number.isFinite(r.height)?t+r.height:NaN);
    if(![l,t,rr,bb].every(Number.isFinite))continue;
    const left=Math.max(l,bounds.left), right=Math.min(rr,bounds.right), top=Math.max(t,bounds.top), bottom=Math.min(bb,bounds.bottom);
    if(right<=left||bottom<=top)continue;
    const rightX=right, midY=(top+bottom)/2;
    const gutter=Math.max(rightX,Math.min(bounds.right-2,endX-20));
    add([{x:rightX,y:midY},{x:gutter,y:midY},{x:gutter,y:endY},{x:endX,y:endY}],i,'right');
    // Start at the text edge, travel vertically to a possible line gap, then
    // use the right gutter. Clearance testing decides whether that gap is safe.
    const x=Math.max(left, right-Math.min(6,(right-left)/2));
    for(const gap of [6,10,16]) {
      if(bottom+gap<=bounds.bottom){const y=bottom+gap;add([{x,y:bottom},{x,y},{x:gutter,y},{x:gutter,y:endY},{x:endX,y:endY}],i,'bottom')}
      if(top-gap>=bounds.top){const y=top-gap;add([{x,y:top},{x,y},{x:gutter,y},{x:gutter,y:endY},{x:endX,y:endY}],i,'top')}
    }
  }
  return result;
}

function orthogonalPoints(points) {
  if(!Array.isArray(points)||points.length<2||points.length>64)return null;
  const clean=[];
  for(const p of points){
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
    const q={x:p.x,y:p.y},prev=clean.at(-1);
    if(prev&&prev.x===q.x&&prev.y===q.y)continue;
    if(prev&&prev.x!==q.x&&prev.y!==q.y)return null;
    while(clean.length>=2){const a=clean[clean.length-2],b=clean[clean.length-1];if(a.x===b.x&&b.x===q.x){if((b.y-a.y)*(q.y-b.y)<0)return null;clean.pop()}else if(a.y===b.y&&b.y===q.y){if((b.x-a.x)*(q.x-b.x)<0)return null;clean.pop()}else break}
    clean.push(q);
  }
  return clean;
}

function roundedPath(points) {
  const pts=orthogonalPoints(points);if(!pts||pts.length<2)return '';
  let result=`M ${pts[0].x} ${pts[0].y}`;
  const line=(from,to)=>from.x===to.x?` V ${to.y}`:` H ${to.x}`;
  let cursor=pts[0];
  for(let i=1;i<pts.length-1;i++){
    const a=pts[i-1],b=pts[i],c=pts[i+1],d1=Math.abs(b.x-a.x)+Math.abs(b.y-a.y),d2=Math.abs(c.x-b.x)+Math.abs(c.y-b.y),r=Math.min(6,d1/2,d2/2);
    if(!r)continue;
    const inX=Math.sign(b.x-a.x),inY=Math.sign(b.y-a.y),outX=Math.sign(c.x-b.x),outY=Math.sign(c.y-b.y);
    const pre={x:b.x-inX*r,y:b.y-inY*r},post={x:b.x+outX*r,y:b.y+outY*r};
    result+=line(cursor,pre)+` Q ${b.x} ${b.y} ${post.x} ${post.y}`;cursor=post;
  }
  return result+line(cursor,pts.at(-1));
}

function roundedBounds(points,originX,originY) {
  const pts=orthogonalPoints(points);if(!pts||pts.length<2)return [];
  const pad=1.5,rect=(a,b)=>({left:Math.min(a.x,b.x)-originX-pad,top:Math.min(a.y,b.y)-originY-pad,right:Math.max(a.x,b.x)-originX+pad,bottom:Math.max(a.y,b.y)-originY+pad}),out=[];
  for(let i=0;i<pts.length-1;i++){
    let a=pts[i],b=pts[i+1];
    if(i===0){const length=Math.abs(b.x-a.x)+Math.abs(b.y-a.y),skip=Math.min(2,length);a={x:a.x+Math.sign(b.x-a.x)*skip,y:a.y+Math.sign(b.y-a.y)*skip}}
    out.push(rect(a,b));
  }
  for(let i=1;i<pts.length-1;i++){
    const a=pts[i-1],b=pts[i],c=pts[i+1],r=Math.min(6,(Math.abs(b.x-a.x)+Math.abs(b.y-a.y))/2,(Math.abs(c.x-b.x)+Math.abs(c.y-b.y))/2);
    out.push(rect({x:b.x-r,y:b.y-r},{x:b.x+r,y:b.y+r}));
  }
  return out;
}
