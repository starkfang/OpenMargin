export const LAYOUT = Object.freeze({ outlineMin:160, sidebarMin:240, contentMin:200, rail:32, divider:6, snapDistance:40, outlineDefault:244, sidebarDefault:320, contentDefault:950 });
export function defaultWorkspaceSizes() {
  return { reading:{outline:LAYOUT.outlineDefault,content:LAYOUT.contentDefault,outlineCollapsed:false}, review:{outline:LAYOUT.outlineDefault,content:LAYOUT.contentDefault,sidebar:LAYOUT.sidebarDefault,outlineCollapsed:false,sidebarCollapsed:false}, reviewInitialized:false };
}
const number=(value,fallback,min,max=10000)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function normalizeWorkspaceSizes(value) {
  const d=defaultWorkspaceSizes();
  for(const mode of ['reading','review']) {
    const input=value?.[mode]||{}, out=d[mode];
    out.outline=number(input.outline,out.outline,LAYOUT.outlineMin);
    out.content=number(input.content,out.content,LAYOUT.contentMin);
    out.outlineCollapsed=input.outlineCollapsed===true;
    if(mode==='review'){out.sidebar=number(input.sidebar,out.sidebar,LAYOUT.sidebarMin);out.sidebarCollapsed=input.sidebarCollapsed===true}
  }
  d.reviewInitialized=value?.reviewInitialized===true;
  return d;
}
export function workspaceGeometry(width,sizes,{outlineOpen=true,sidebarOpen=false}={}) {
  const outlineVisible=outlineOpen&&!sizes.outlineCollapsed;
  const sidebarVisible=sidebarOpen&&!sizes.sidebarCollapsed;
  const total=Math.max(0,Number(width)||0), count=(outlineVisible?1:0)+(sidebarVisible?1:0);
  let outline=outlineVisible?Math.max(LAYOUT.outlineMin,sizes.outline):0;
  let sidebar=sidebarVisible?Math.max(LAYOUT.sidebarMin,sizes.sidebar):0;
  const room=Math.max(0,total-count*LAYOUT.divider-LAYOUT.contentMin);
  // Clamp only the rendered widths on window resize; stored preferences remain intact.
  if(outline+sidebar>room){let excess=outline+sidebar-room;const sideFloor=sidebarVisible?LAYOUT.sidebarMin:0,sideCut=Math.min(excess,Math.max(0,sidebar-sideFloor));sidebar-=sideCut;excess-=sideCut;const outlineFloor=outlineVisible?LAYOUT.outlineMin:0;outline-=Math.min(excess,Math.max(0,outline-outlineFloor))}
  const center=Math.max(0,total-outline-sidebar-count*LAYOUT.divider);
  return {outline,sidebar,center,content:Math.min(Math.max(LAYOUT.contentMin,sizes.content),center)};
}
export function resizeWorkspacePane({sizes,mode,pane,delta,width,outlineOpen=true,sidebarOpen=false}) {
  const base={...sizes}, g=workspaceGeometry(width,base,{outlineOpen,sidebarOpen});
  if(pane==='outline'&&outlineOpen&&!base.outlineCollapsed){
    const raw=g.outline+delta;
    if(raw<=LAYOUT.outlineMin-LAYOUT.snapDistance)return {...base,outlineCollapsed:true};
    // Preserve the preferred content width. Geometry consumes gutter first and
    // temporarily narrows the rendered content if the window has no spare room.
    const max=Math.max(LAYOUT.outlineMin,width-g.sidebar-(outlineOpen&&!base.outlineCollapsed?LAYOUT.divider:0)-(sidebarOpen&&!base.sidebarCollapsed?LAYOUT.divider:0)-LAYOUT.contentMin);
    return {...base,outline:Math.max(LAYOUT.outlineMin,Math.min(max,raw)),outlineCollapsed:false};
  }
  if(pane==='sidebar'&&sidebarOpen&&!base.sidebarCollapsed){
    const raw=g.sidebar-delta;
    if(raw<=LAYOUT.sidebarMin-LAYOUT.snapDistance)return {...base,sidebarCollapsed:true};
    const max=Math.max(LAYOUT.sidebarMin,width-g.outline-(outlineOpen&&!base.outlineCollapsed?LAYOUT.divider:0)-LAYOUT.divider-LAYOUT.contentMin);
    return {...base,sidebar:Math.max(LAYOUT.sidebarMin,Math.min(max,raw)),sidebarCollapsed:false};
  }
  if(pane==='content')return {...base,content:Math.max(LAYOUT.contentMin,Math.min(g.center,g.content+delta))};
  return base;
}
