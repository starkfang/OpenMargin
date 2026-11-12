export function feedbackKind(message = '') {
  if (/无法|失败|错误|冲突|不能|不一致|不支持|不可|丢失|不存在|过大|无效|已在外部更改/.test(message)) return 'error';
  if (/^(已保存|正文已保存|已另存为|文字已修改|已复制)$/.test(message)) return 'success';
  return 'info';
}
export function feedbackDuration(message) {
  const kind = feedbackKind(message);
  return kind === 'success' ? 2000 : kind === 'error' ? 5000 : 3000;
}
