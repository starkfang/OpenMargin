'use strict';
async function openSource(w) {
  const button=w.getByRole('button',{name:'源码编辑',exact:true});
  if (!(await button.isVisible())) {
    await w.getByRole('button',{name:'选择编辑方式'}).click();
    await w.getByRole('menuitemradio',{name:'源码编辑'}).click();
  }
  await button.click();
}
module.exports={openSource};
