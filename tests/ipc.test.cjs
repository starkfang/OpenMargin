'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const Module = require('node:module');
const {pathToFileURL} = require('node:url');
test('IPC restricts senders and opens system-requested supported local documents', async () => {
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve();
  app.isReady = () => true;
  app.requestSingleInstanceLock = () => true;
  app.isPackaged = false;
  app.getPath = () => os.tmpdir();
  app.quit = () => {};
  const handlers = new Map();
  const ipcMain = new EventEmitter();
  ipcMain.handle = (name, handler) => handlers.set(name, handler);
  let win;
  class BrowserWindow extends EventEmitter {
    constructor() {
      super(); win = this; this.destroyed = false; this.webContents = new EventEmitter();
      this.webContents.mainFrame = {url:pathToFileURL(path.join(__dirname,'..','dist','index.html')).href};
      this.webContents.setWindowOpenHandler = () => {};
      this.events = [];
      this.webContents.send = (name, doc) => this.events.push({name,doc});
    }
    loadFile() {} loadURL() {} show() {} focus() {} isDestroyed() { return this.destroyed; }
    close() { const e = { prevented:false, preventDefault(){this.prevented=true;} }; this.emit('close',e); this.destroyed = !e.prevented; }
    static getAllWindows() { return win && !win.destroyed ? [win] : []; }
  }
  const originalLoad = Module._load;
  Module._load = function(request, ...args) { return request === 'electron' ? {app,BrowserWindow,ipcMain,dialog:{},shell:{}} : originalLoad.call(this,request,...args); };
  try { require('../electron/main.cjs'); } finally { Module._load = originalLoad; }
  await new Promise(resolve => setImmediate(resolve));
  const closeRequest = { prevented:false, preventDefault(){this.prevented=true;} };
  win.emit('close', closeRequest);
  assert.equal(closeRequest.prevented, true, 'window close waits for renderer confirmation');
  assert.ok(win.events.some(e => e.name === 'window:request-close'));
  win.events.length = 0;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'openmargin-ipc-'));
  const file = path.join(directory,'测试.md');
  const unsupported = path.join(directory,'no.txt');
  try {
    await fs.writeFile(file,'# 测试'); await fs.writeFile(unsupported,'no');
    const event = {sender:win.webContents, senderFrame:win.webContents.mainFrame};
    await assert.rejects(async () => handlers.get('document:open-path')({sender:{},senderFrame:{}},file), /UNTRUSTED_RENDERER/);
    await assert.rejects(async () => handlers.get('document:open-path')(event,unsupported), /UNSUPPORTED_FILE/);
    const doc = await handlers.get('document:open-path')(event,file);
    assert.equal(doc.content,'# 测试');
    app.emit('open-file',{preventDefault(){}},file);
    assert.equal(win.events.length,0);
    ipcMain.emit('document:ready',event);
    await new Promise(resolve => setTimeout(resolve,30));
    assert.equal(win.events.filter(e => e.name === 'document:opened').length,1,'already-open document is activated in its existing window');
    // macOS can keep the process alive after its last window closes. Opening
    // multiple documents must create a new window and deliver each in order.
    const previous = win;
    previous.destroyed = true;
    previous.webContents.emit('destroyed');
    const second = path.join(directory, '第二.md');
    await fs.writeFile(second, '# 第二');
    app.emit('open-file',{preventDefault(){}},file);
    app.emit('open-file',{preventDefault(){}},second);
    assert.notEqual(win, previous, 'opening a document recreates the closed window');
    const firstNewWindow = win;
    const ready = {sender:win.webContents, senderFrame:win.webContents.mainFrame};
    ipcMain.emit('document:ready',ready);
    await new Promise(resolve => setTimeout(resolve,30));
    assert.equal(firstNewWindow.events.find(e => e.name === 'document:opened').doc.path, await fs.realpath(file));
    assert.equal(win, firstNewWindow, 'multiple documents share the same window');
    assert.deepEqual(win.events.filter(e => e.name === 'document:opened').map(e => e.doc.path), [await fs.realpath(file), await fs.realpath(second)]);
    const raceFile = path.join(directory, 'race.md');
    await fs.writeFile(raceFile, '# race');
    const storage = require('../electron/storage.cjs');
    const originalRead = storage.readDocument;
    let release, started;
    const readStarted = new Promise(resolve => { started = resolve; });
    storage.readDocument = async (...args) => {
      if (args[0] === await fs.realpath(raceFile) && !release) {
        await new Promise(resolve => { release = resolve; started(); });
      }
      return originalRead(...args);
    };
    try {
      app.emit('open-file', {preventDefault(){}}, raceFile);
      await readStarted;
      const closing = win; closing.destroyed = true; closing.webContents.emit('destroyed');
      release();
      await new Promise(resolve => setTimeout(resolve,30));
      assert.notEqual(win, closing, 'a new window receives a request interrupted by closing');
      ipcMain.emit('document:ready',{sender:win.webContents,senderFrame:win.webContents.mainFrame});
      await new Promise(resolve => setTimeout(resolve,30));
      assert.equal(win.events.find(e => e.name === 'document:opened').doc.path, await fs.realpath(raceFile));
    } finally { storage.readDocument = originalRead; }
  } finally { app.emit('will-quit'); await fs.rm(directory,{recursive:true,force:true}); }
});
test('preload obtains a dropped file path through Electron webUtils', async () => {
  const fakeFile = {}; const calls = []; let exposed;
  const ipcRenderer = new EventEmitter();
  ipcRenderer.invoke = (channel, arg) => { calls.push({channel,arg}); return Promise.resolve(arg); };
  ipcRenderer.send = (...args) => calls.push(args);
  const fake = {contextBridge:{exposeInMainWorld:(_name, api) => {exposed=api;}}, ipcRenderer, webUtils:{getPathForFile:file => file === fakeFile ? '/tmp/test.md' : ''}};
  const originalLoad = Module._load;
  Module._load = function(request, ...args) { return request === 'electron' ? fake : originalLoad.call(this,request,...args); };
  try { require('../electron/preload.cjs'); } finally { Module._load = originalLoad; }
  assert.equal(await exposed.openDropped(fakeFile),'/tmp/test.md');
  assert.deepEqual(calls[0],{channel:'document:open-path',arg:'/tmp/test.md'});
  assert.throws(() => exposed.openDropped({}),/无法获取/);
  let received;
  const off = exposed.onOpen(doc => {received=doc;});
  ipcRenderer.emit('document:opened',{},'ok'); assert.equal(received,'ok'); off();
});
