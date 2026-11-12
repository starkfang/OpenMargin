const content = '<!doctype html><html><head></head><body><p>原始内容</p></body></html>';
let doc = {path:'/tmp/security-test.html',name:'security-test.html',type:'html',content,hash:'original',annotations:[]};
window.saveCalls = [];
window.preparedSnapshots = [];
window.openMargin = {
  open: async () => doc,
  read: async () => doc,
  prepareHtml: async (_path, snapshot) => { window.preparedSnapshots.push(snapshot); return snapshot; },
  history: async () => [],
  onChange: () => () => {},
  onSaveShortcut: callback => { window.nativeSaveShortcut = callback; return () => {}; },
  save: async value => { window.saveCalls.push(value); doc = {...doc,content:value.content,annotations:value.annotations,hash:'saved'}; return doc; },
  saveAs: async value => { window.saveCalls.push({...value,saveAs:true}); return null; },
};
import('../src/main.jsx');
