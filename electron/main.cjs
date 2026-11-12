'use strict';
const {app, BrowserWindow, ipcMain, dialog, shell} = require('electron');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const store = require('./storage.cjs');
const { atomicWrite } = require('./atomicWrite.cjs');
const { inlineHtmlAssets } = require('./html-assets.cjs');
const { createQuitController } = require('./quit-controller.cjs');
const { watchFile } = require('./fileWatcher.cjs');
const { saveShortcut } = require('./saveShortcut.cjs');
let windowRef;
const windowByContents = new Map();
const approvedClose = new WeakSet();
const quitting = createQuitController({
  getWindows: () => BrowserWindow.getAllWindows(),
  requestConfirm: win => { win.show(); win.focus(); win.webContents.send('window:request-close'); },
  setWindowEnabled: (win, enabled) => win.setEnabled(enabled),
  closeWindow: win => { approvedClose.add(win); win.close(); },
  finish: () => app.quit(),
});
let rendererReady = false;
const pendingOpenFiles = [];
let dispatchingOpenFiles = false;
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
function trusted(event) {
  const owner = windowByContents.get(event.sender);
  if (!owner || owner.isDestroyed() || event.senderFrame !== owner.webContents.mainFrame) throw new Error('UNTRUSTED_RENDERER');
  const url = event.senderFrame.url;
  const devURL = process.env.VITE_DEV_SERVER_URL;
  if (devURL ? new URL(url).origin !== new URL(devURL).origin : url !== require('node:url').pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href) throw new Error('UNTRUSTED_ORIGIN');
  return owner;
}
async function dispatchPending() {
  if (dispatchingOpenFiles) return;
  dispatchingOpenFiles = true;
  try {
    while (rendererReady && pendingOpenFiles.length && windowRef && !windowRef.isDestroyed()) {
      const file = pendingOpenFiles.shift();
      let target = windowRef;
      try {
        const canonical = await canonicalPath(file);
        const existing = documentOwners.get(canonical);
        if (existing && !existing.isDestroyed()) target = existing;
        const doc = await openPath(file, target);
        if (!target.isDestroyed()) { target.show(); target.focus(); target.webContents.send('document:opened', doc); }
        else { pendingOpenFiles.unshift(file); if ((!windowRef || windowRef.isDestroyed()) && !quitting.pending()) createWindow(); }
      } catch (err) {
        if (target.isDestroyed() && !quitting.pending()) {
          pendingOpenFiles.unshift(file);
          if (!windowRef || windowRef.isDestroyed()) createWindow();
        } else console.error('Could not open document:', err.message);
      }
    }
  } finally { dispatchingOpenFiles = false; }
}
function queueSystemFile(file) {
  pendingOpenFiles.push(file);
  // On macOS the app may remain running after its last window is closed.
  // An open-file event must recreate a window; activate is not guaranteed to
  // arrive for every document-open request.
  if (app.isReady() && (!windowRef || windowRef.isDestroyed())) {
    const existing = BrowserWindow.getAllWindows().find(win => !win.isDestroyed());
    if (existing) windowRef = existing;
    else createWindow();
  }
  void dispatchPending();
}
app.on('open-file', (event, file) => { event.preventDefault(); queueSystemFile(file); });
app.on('second-instance', (_event, argv, cwd) => {
  for (const arg of argv) if (typeof arg === 'string' && !arg.startsWith('-') && /\.(md|markdown|html|htm)$/i.test(arg)) queueSystemFile(path.resolve(cwd, arg));
  if (windowRef && !windowRef.isDestroyed()) { windowRef.show(); windowRef.focus(); }
});
const authorized = new Set();
const watchers = new Map();
const writeQueues = new Map();
// One live window owns a canonical document path. Transfers use a temporary token
// and do not release the source until the destination acknowledges restoration.
const documentOwners = new Map();
const transfers = new Map();
const readyWindows = new Set();
const readyWaiters = new Map();
async function canonicalPath(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || file.includes('\0')) throw new Error('INVALID_PATH');
  return fsp.realpath(file);
}
function claim(owner, file) {
  const existing = documentOwners.get(file);
  if (existing && existing !== owner && !existing.isDestroyed()) {
    existing.show(); existing.focus();
    throw new Error('文件已在其他窗口打开');
  }
  documentOwners.set(file, owner);
}
function requireOwner(owner, file) { if (documentOwners.get(file) !== owner) throw new Error('文件不属于当前窗口'); }
function onReady(owner) {
  readyWindows.add(owner);
  const callbacks = readyWaiters.get(owner);
  if (callbacks) { readyWaiters.delete(owner); for (const cb of callbacks) cb(true); }
}
function waitReady(owner, timeout = 5000) {
  if (readyWindows.has(owner)) return Promise.resolve(true);
  return new Promise(resolve => {
    let list = readyWaiters.get(owner);
    if (!list) readyWaiters.set(owner, list = new Set());
    const cb = result => { clearTimeout(timer); list.delete(cb); resolve(result); };
    const timer = setTimeout(() => cb(false), timeout);
    list.add(cb);
  });
}
function disposeTransfer(t) {
  transfers.delete(t.token);
  if (t.resolve) { const resolve = t.resolve; t.resolve = null; resolve(false); }
}

function queueWrite(file, task) {
  const previous = writeQueues.get(file) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  writeQueues.set(file, current);
  current.finally(() => { if (writeQueues.get(file) === current) writeQueues.delete(file); }).catch(() => {});
  return current;
}
function watch(file) {
  if (watchers.has(file)) return;
  try {
    const watcher = watchFile(file, () => { for (const win of windowByContents.values()) if (!win.isDestroyed()) win.webContents.send('document:changed', {path:file}); });
    watchers.set(file, watcher);
  } catch { /* filesystems may not support watching; explicit reload remains available */ }
}
const allowed = file => {
  if (typeof file !== 'string' || !authorized.has(file)) throw new Error('FILE_NOT_OPEN');
  return file;
};
async function openPath(file, owner = windowRef) {
  file = await canonicalPath(file);
  if (!(await fsp.stat(file)).isFile()) throw new Error('NOT_A_FILE');
  // Validate format before claiming, so an invalid open cannot reserve a path.
  const doc = await store.readDocument(file);
  if (owner) { if (owner.isDestroyed()) throw new Error('WINDOW_CLOSED'); claim(owner, file); }
  authorized.add(file);
  watch(file);
  return doc;
}
function historyFile(file) {
  return path.join(app.getPath('userData'), 'history', crypto.createHash('sha256').update(file).digest('hex') + '.json');
}
async function readHistory(file) {
  try { const data = JSON.parse(await fsp.readFile(historyFile(file), 'utf8')); return Array.isArray(data) ? data : []; }
  catch (err) { if (err.code === 'ENOENT') return []; throw err; }
}
async function addHistory(file, entry) {
  const location = historyFile(file);
  await fsp.mkdir(path.dirname(location), {recursive:true});
  const items = await readHistory(file);
  items.push({...entry, recordedAt:entry.recordedAt || new Date().toISOString()});
  await atomicWrite(location, JSON.stringify(items, null, 2));
}
function setupIPC() {
  ipcMain.handle('document:open', async (event) => {
    const owner = trusted(event);
    const result = await dialog.showOpenDialog(owner, {properties:['openFile'], filters:[{name:'文档', extensions:['md','markdown','html','htm']}]});
    if (result.canceled || !result.filePaths.length) return null;
    return openPath(result.filePaths[0], owner);
  });
  ipcMain.handle('document:open-path', (event, file) => openPath(file, trusted(event)));
  ipcMain.on('document:ready', event => { try { windowRef = trusted(event); onReady(windowRef); rendererReady = true; void dispatchPending(); } catch (err) { console.error(err.message); } });
  ipcMain.handle('document:read', (event, file) => { const owner = trusted(event); allowed(file); claim(owner, file); return store.readDocument(file); });
  ipcMain.handle('document:prepare-html', async (event, file, content) => { trusted(event); const doc = await store.readDocument(allowed(file)); if (doc.type !== 'html') throw new Error('UNSUPPORTED_FILE'); return inlineHtmlAssets(typeof content === 'string' ? content : doc.content, file); });
  ipcMain.handle('document:save', async (event, payload) => {
    const owner = trusted(event);
    allowed(payload.path);
    requireOwner(owner, payload.path);
    return queueWrite(payload.path, async () => {
      requireOwner(owner, payload.path);
      const before = await store.readDocument(payload.path);
      const result = await store.writeDocument(payload);
      if (before.content !== result.content) {
        try { await addHistory(payload.path, {before:before.content, after:result.content, ...(payload.historyEntry || {})}); }
        catch (err) { console.error('History write failed:', err.message); result.historyError = '修改记录保存失败'; }
      }
      return result;
    });
  });
  ipcMain.handle('document:save-as', async (event, payload) => {
    const owner = trusted(event);
    if (!payload || typeof payload.path !== 'string' || typeof payload.content !== 'string' || !Array.isArray(payload.annotations) || typeof payload.expectedHash !== 'string') throw new Error('INVALID_DOCUMENT');
    const source = allowed(payload.path);
    requireOwner(owner, source);
    const before = await store.readDocument(source);
    if (before.hash !== payload.expectedHash) throw new Error('FILE_CONFLICT');
    const result = await dialog.showSaveDialog(owner, {
      title: '另存为', defaultPath: source,
      filters: [{name: before.type === 'md' ? 'Markdown 文档' : 'HTML 文档', extensions: before.type === 'md' ? ['md','markdown'] : ['html','htm']}],
    });
    if (result.canceled || !result.filePath) return null;
    if (!path.isAbsolute(result.filePath) || result.filePath.includes('\0')) throw new Error('INVALID_PATH');
    if (store.typeFor(result.filePath) !== before.type) throw new Error('文件格式必须与原文件一致');
    let destination;
    try { destination = await fsp.realpath(result.filePath); }
    catch (err) { if (err.code !== 'ENOENT') throw err; destination = path.join(await fsp.realpath(path.dirname(result.filePath)), path.basename(result.filePath)); }
    if (destination === source) throw new Error('请为另存为选择不同的文件');
    if (documentOwners.has(destination)) throw new Error('目标文件已在 OpenMargin 中打开，请选择其他文件');
    return queueWrite(destination, async () => {
      if (documentOwners.has(destination)) throw new Error('目标文件已在 OpenMargin 中打开，请选择其他文件');
      requireOwner(owner, source);
      // Replacing an existing file cannot be made conditional on its hash
      // with a portable filesystem operation. Never overwrite it, even after
      // an OS save dialog has offered an overwrite confirmation.
      try { await fsp.lstat(destination); throw new Error('目标文件已存在，请选择其他文件名'); }
      catch (err) { if (err.code !== 'ENOENT') throw err; }
      requireOwner(owner, source);
      if ((await store.readDocument(source)).hash !== payload.expectedHash) throw new Error('FILE_CONFLICT');
      if (documentOwners.has(destination)) throw new Error('目标文件已在 OpenMargin 中打开，请选择其他文件');
      claim(owner, destination);
      let committed = false;
      const temp = path.join(path.dirname(destination), `.${path.basename(destination)}.openmargin-${crypto.randomUUID()}.tmp`);
      try {
        const raw = store.encode(payload.content, [...payload.annotations, ...(before.invalidAnnotations || [])], before.type);
        const mode = (await fsp.stat(source)).mode;
        await fsp.writeFile(temp, raw, {flag:'wx', mode});
        if ((await store.readDocument(source)).hash !== payload.expectedHash) throw new Error('FILE_CONFLICT');
        // link is atomic and fails if another process created the destination.
        try { await fsp.link(temp, destination); }
        catch (err) { if (err.code === 'EEXIST') throw new Error('目标文件已存在，请选择其他文件名'); throw err; }
        committed = true;
        authorized.add(destination); watch(destination);
        const doc = await store.readDocument(destination);
        if (before.content !== doc.content) {
          try { await addHistory(destination, {before:before.content, after:doc.content, ...(payload.historyEntry || {})}); }
          catch (err) { console.error('History write failed:', err.message); doc.historyError='修改记录保存失败'; }
        }
        return doc;
      } finally {
        await fsp.unlink(temp).catch(() => {});
        if (!committed && documentOwners.get(destination) === owner) documentOwners.delete(destination);
      }
    });
  });
  ipcMain.handle('document:history', (event, file) => { trusted(event); return readHistory(allowed(file)); });
  ipcMain.handle('document:show', (event, file) => { trusted(event); return shell.showItemInFolder(allowed(file)); });
  ipcMain.handle('tab:claim', async (event, file) => { const owner = trusted(event); const resolved = await canonicalPath(file); allowed(resolved); claim(owner, resolved); return resolved; });
  ipcMain.handle('tab:release', async (event, file) => { const owner = trusted(event); const resolved = await canonicalPath(file).catch(() => file); if (documentOwners.get(resolved) === owner) documentOwners.delete(resolved); });
  ipcMain.handle('tab:begin-transfer', async (event, file, snapshot) => {
    const source = trusted(event), resolved = await canonicalPath(file);
    allowed(resolved);
    if (documentOwners.get(resolved) !== source) throw new Error('文件不属于当前窗口');
    if (!snapshot || typeof snapshot !== 'object' || snapshot.file?.path !== resolved) throw new Error('无效的标签状态');
    for (const t of transfers.values()) if (t.source === source && t.path === resolved) disposeTransfer(t);
    const token = crypto.randomUUID();
    transfers.set(token, {token, path:resolved, source, snapshot, target:null, resolve:null});
    return token;
  });
  ipcMain.handle('tab:cancel-transfer', (event, token) => { const source=trusted(event), t=transfers.get(token); if (t && t.source===source && !t.target) disposeTransfer(t); });
  ipcMain.handle('tab:complete-transfer', async (event, token, x, y) => {
    const source = trusted(event), t = transfers.get(token);
    if (!t || t.source !== source || t.target || !Number.isFinite(x) || !Number.isFinite(y)) return {ok:false,reason:'无效的拖动'};
    if (documentOwners.get(t.path) !== source || quitting.pending()) { disposeTransfer(t); return {ok:false,reason:'文件状态已变化'}; }
    const windows = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && w.isVisible?.() !== false);
    const targetAtPoint = [...windows].reverse().find(w => { const b=w.getBounds(); return x>=b.x && x<b.x+b.width && y>=b.y && y<b.y+b.height; });
    if (targetAtPoint) {
      const b=targetAtPoint.getBounds();
      if (targetAtPoint === source || y >= b.y + 40) { disposeTransfer(t); return {ok:false,reason:'拖动已取消'}; }
    }
    let target=targetAtPoint, created=false;
    try {
      if (!target) { target=createWindow(); created=true; target.setPosition?.(Math.round(x-180),Math.round(y-20)); }
      t.target=target;
      if (!await waitReady(target) || target.isDestroyed() || source.isDestroyed()) throw new Error('窗口未能准备就绪');
      const accepted = new Promise(resolve => {
        const timer=setTimeout(() => { if (t.resolve) { t.resolve=null; resolve(false); } }, 15000);
        t.resolve=value => { clearTimeout(timer); resolve(value); };
      });
      target.webContents.send('tab:incoming-transfer',{token,path:t.path,snapshot:t.snapshot,screenX:x,screenY:y});
      if (!await accepted || target.isDestroyed() || documentOwners.get(t.path)!==source) throw new Error('目标窗口未接收标签');
      documentOwners.set(t.path,target);
      target.webContents.send('tab:commit-transfer',{token,path:t.path});
      transfers.delete(token);
      target.show(); target.focus();
      return {ok:true};
    } catch (err) {
      if (documentOwners.get(t.path) === target && !source.isDestroyed()) documentOwners.set(t.path, source);
      if (target && !target.isDestroyed()) {
        target.webContents.send('tab:rollback-transfer',{token,path:t.path});
        if (created) { approvedClose.add(target); target.close(); }
      }
      disposeTransfer(t);
      return {ok:false,reason:err.message || '标签转移失败'};
    }
  });
  ipcMain.on('tab:transfer-ack', (event, token, accepted) => {
    try { const owner=trusted(event), t=transfers.get(token); if (t && t.target===owner && t.resolve) { const resolve=t.resolve; t.resolve=null; resolve(accepted===true); } } catch {}
  });
  ipcMain.handle('window:new', event => { trusted(event); if (!quitting.pending()) createWindow(); });
  ipcMain.handle('window:close', event => { const owner = trusted(event); if (quitting.pending()) { quitting.confirm(owner); return; } approvedClose.add(owner); owner.close(); });
  ipcMain.handle('window:cancel-close', event => { const owner = trusted(event); quitting.cancel(owner); });
}
function createWindow() {
  rendererReady = false;
  const owner = new BrowserWindow({width:1440,height:900,minWidth:850,minHeight:600, show:false, title:'OpenMargin', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', autoHideMenuBar: process.platform !== 'darwin', trafficLightPosition: process.platform === 'darwin' ? {x:14,y:15} : undefined, backgroundColor:'#f6f7f9', webPreferences:{preload:path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true}});
  // Display the first painted tab strip with native controls already aligned.
  // Native button frames are 16px tall; both they and the tab glyphs center at y=23.
  owner.once('ready-to-show', () => {
    if (owner.isDestroyed()) return;
    if (process.platform === 'darwin') owner.setWindowButtonPosition({x:14,y:15});
    owner.show();
  });
  windowRef = owner;
  owner.on('focus', () => { if (!owner.isDestroyed()) windowRef = owner; });
  windowByContents.set(owner.webContents, owner);
  owner.webContents.on('before-input-event', (event, input) => {
    const shortcut = saveShortcut(input);
    if (!shortcut) return;
    event.preventDefault();
    if (!owner.isDestroyed()) owner.webContents.send('document:save-shortcut', shortcut);
  });
  owner.webContents.on('destroyed', () => { readyWindows.delete(owner); const waits=readyWaiters.get(owner); if (waits) { readyWaiters.delete(owner); for (const cb of waits) cb(false); } for (const [file,win] of documentOwners) if (win===owner) documentOwners.delete(file); for (const t of transfers.values()) if (t.source===owner || t.target===owner) disposeTransfer(t); quitting.destroyed(owner); windowByContents.delete(owner.webContents); if (windowRef === owner) windowRef = [...windowByContents.values()].find(win => !win.isDestroyed()) || null; });
  owner.webContents.on('will-navigate', event => event.preventDefault());
  // Ask the renderer to show its own confirmation without destroying a draft.
  owner.on?.('close', event => {
    if (approvedClose.has(owner)) return;
    event.preventDefault();
    if (!quitting.pending()) owner.webContents.send('window:request-close');
  });
  owner.webContents.on('will-prevent-unload', event => {
    if (approvedClose.has(owner)) event.preventDefault();
  });
  owner.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  if (process.env.VITE_DEV_SERVER_URL) owner.loadURL(process.env.VITE_DEV_SERVER_URL);
  else owner.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return owner;
}

const cliFiles = process.argv.slice(app.isPackaged ? 1 : 2).filter(arg => !arg.startsWith('-') && /\.(md|markdown|html|htm)$/i.test(arg));
for (const file of cliFiles) pendingOpenFiles.push(path.resolve(file));
if (ownsInstance) app.whenReady().then(() => { setupIPC(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', event => { if (quitting.begin()) event.preventDefault(); });
app.on('will-quit', () => { for (const watcher of watchers.values()) watcher.close(); });
