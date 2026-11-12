// Give the selected card room to follow its quote even in a short list. Only
// the ends of the list move; spacing between cards stays unchanged.
export function alignAnnotationCard(scroll, card, anchorY) {
  const list = scroll.querySelector('.comments-list');
  const excerpt = card.querySelector('.review-excerpt');
  if (!list || !excerpt) return;
  const viewport = scroll.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const quote = excerpt.getBoundingClientRect();
  const listBox = list.getBoundingClientRect();
  const padding = Number.parseFloat(getComputedStyle(scroll).getPropertyValue('--review-list-padding')) || 14;
  const quoteOffset = Math.min(quote.height / 2, 22);
  const inset = Math.max(0, Math.min(quote.top - cardBox.top + quoteOffset, viewport.height / 2));
  const desired = Math.max(inset, Math.min(viewport.height - 20, anchorY - viewport.top));
  const naturalY = padding + quote.top + quoteOffset - listBox.top;
  const naturalHeight = padding * 2 + listBox.height;
  const before = Math.max(0, desired - naturalY);
  const after = Math.max(0, viewport.height - desired - (naturalHeight - naturalY));
  scroll.style.setProperty('--annotation-follow-before', `${before}px`);
  scroll.style.setProperty('--annotation-follow-after', `${after}px`);
  const target = naturalY + before - desired;
  if (Math.abs(scroll.scrollTop - target) > 0.5) scroll.scrollTop = target;
}

export function resetAnnotationAlignment(scroll) {
  scroll?.style.removeProperty('--annotation-follow-before');
  scroll?.style.removeProperty('--annotation-follow-after');
}
