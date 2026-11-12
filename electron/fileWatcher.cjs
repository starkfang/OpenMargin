'use strict';
const fs = require('node:fs');

function signature(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeMs, stat.ctimeMs];
}

// fs.watchFile polls the authorized file itself through libuv, without opening
// a directory event stream on the main thread. Path-based polling also sees
// atomic replacement, deletion and later recreation.
function watchFile(file, onChange, {interval = 750, debounce = 200, io = fs} = {}) {
  let closed = false, timer = null;
  const listener = (current, previous) => {
    if (closed) return;
    const before = signature(previous);
    if (current.nlink !== 0 && signature(current).every((value, i) => value === before[i])) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; if (!closed) onChange(); }, debounce);
  };
  io.watchFile(file, {interval, persistent:false}, listener);
  return {close() { if (closed) return; closed = true; clearTimeout(timer); timer = null; io.unwatchFile(file, listener); }};
}

module.exports = {watchFile};
