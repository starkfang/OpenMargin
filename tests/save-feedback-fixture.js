const initial = '# 保存反馈\n\n原始正文。\n';
let documentValue={path:'/tmp/feedback.md',name:'feedback.md',type:'md',content:initial,hash:'original',annotations:[]};
window.saveCalls=[];
window.mockHistoryError=false;
window.openMargin={
 open:async()=>({...documentValue,...(window.mockReviewWarning?{reviewWarning:'已忽略 1 条格式无效的批注'}:{})}),
 read:async()=>documentValue,
 prepareHtml:async(_path,snapshot)=>snapshot,
 history:async()=>[], onChange:()=>()=>{}, onSaveShortcut:()=>()=>{},
 save:async value=>{window.saveCalls.push({kind:'save',...value});documentValue={...documentValue,content:value.content,annotations:value.annotations,hash:'saved-'+window.saveCalls.length};return {...documentValue,...(window.mockHistoryError?{historyError:'修改记录保存失败'}:{})}},
 saveAs:async value=>{window.saveCalls.push({kind:'saveAs',...value});return {...documentValue,path:'/tmp/copy.md',name:'copy.md',content:value.content,annotations:value.annotations,hash:'copy',...(window.mockHistoryError?{historyError:'修改记录保存失败'}:{})}},
};
import('../src/main.jsx');
