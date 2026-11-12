'use strict';
// Collect explicit approval from each window before closing any of them.
function createQuitController({getWindows, requestConfirm, closeWindow, finish, setWindowEnabled = () => {}}) {
  let state=null, finishing=false;
  function next() {
    if (!state) return;
    while (state.index<state.windows.length && state.windows[state.index].isDestroyed()) state.index++;
    if (state.index<state.windows.length) { requestConfirm(state.windows[state.index]); return; }
    const windows=state.windows; state=null; finishing=true;
    for (const win of windows) if (!win.isDestroyed()) closeWindow(win);
    finish();
  }
  return {
    begin() {
      if (finishing) return false;
      if (state) return true;
      const windows=getWindows().filter(win=>!win.isDestroyed());
      if (!windows.length) {finishing=true;return false;}
      state={windows,index:0,disabled:new Set()};next();return true;
    },
    confirm(win) {if(!state||state.windows[state.index]!==win)return false;if(!win.isDestroyed()){setWindowEnabled(win,false);state.disabled.add(win);}state.index++;next();return true;},
    cancel(win) {if(!state||state.windows[state.index]!==win)return false;const disabled=state.disabled;state=null;for(const approved of disabled)if(!approved.isDestroyed())setWindowEnabled(approved,true);return true;},
    destroyed(win) {if(state&&state.windows[state.index]===win) {state.index++;next();}},
    pending() {return !!state;},
  };
}
module.exports={createQuitController};
