// Build the URL of a document's parent directory in the renderer without
// relying on the host's path separator. Encode path segments, not separators.
export function documentBaseUrl(filePath) {
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    parts.pop();
    const drive = parts.shift();
    return `file:///${drive}/${parts.map(encodeURIComponent).join('/')}${parts.length ? '/' : ''}`;
  }
  if (/^\\\\/.test(filePath)) {
    const parts = filePath.slice(2).split(/\\/);
    const host = parts.shift();
    parts.pop();
    return `file://${host}/${parts.map(encodeURIComponent).join('/')}/`;
  }
  const parts = filePath.split('/');
  parts.pop();
  return `file://${parts.map(encodeURIComponent).join('/')}/`;
}
