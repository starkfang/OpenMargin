/** Only events for the active document participate in the debounce. */
export function createActiveDocumentDebouncer({ getActivePath, onChange, delay = 450, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null;
  return {
    notify(path) {
      if (path !== getActivePath()) return;
      if (timer !== null) cancel(timer);
      timer = schedule(() => {
        timer = null;
        if (path === getActivePath()) onChange(path);
      }, delay);
    },
    dispose() { if (timer !== null) cancel(timer); timer = null; },
  };
}
