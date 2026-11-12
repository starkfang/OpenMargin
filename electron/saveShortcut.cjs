'use strict';

// Electron emits before-input-event for native keyboard input before it reaches
// any page frame. A synthetic DOM event or postMessage cannot invoke this.
function saveShortcut(input) {
  if (input?.type !== 'keyDown' || input.isAutoRepeat || input.isComposing || input.alt || !(input.meta || input.control) || String(input.key).toLowerCase() !== 's') return null;
  return {saveAs: !!input.shift};
}

module.exports = {saveShortcut};
