/** Assign jump indices after excluding blank headings, matching document navigation. */
export function extractOutline(elements) {
  return Array.from(elements)
    .filter(el => el.textContent.trim())
    .map((el, id) => ({id, level: Number(el.tagName.slice(1)), text: el.textContent.trim()}));
}
