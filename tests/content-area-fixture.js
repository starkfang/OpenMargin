import { createContentArea } from '../src/contentArea.mjs';
document.body.innerHTML = '<main><p>甲乙丙丁戊己</p><p>天地方圆宇宙</p><p>重复内容</p><p>重复内容</p><p style="display:none">不可见文字</p></main>';
document.body.insertAdjacentHTML('beforeend','<style>body{font:20px/1.6 sans-serif}p{margin:8px 0}</style>');
window.area = createContentArea(document);
window.charRect = (selector, start, end) => {const n=document.querySelector(selector).firstChild,r=document.createRange();r.setStart(n,start);r.setEnd(n,end);const b=r.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom};};
