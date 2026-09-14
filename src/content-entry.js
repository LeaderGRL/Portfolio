export function toContentEntry(document) {
  return {
    id: document.id,
    label: document.title,
    sub: document.sub || '',
    meta: document.status || document.year || '',
    status: document.status || '',
    listMeta: document.listMeta || '',
    year: document.year || '',
    stack: document.stack || [],
    link: document.link || '',
    theme: document.theme || 'default',
    order: Number.isFinite(Number(document.order)) ? Number(document.order) : null,
    narration: typeof document.narration === 'string' ? document.narration : '',
    blocks: document.blocks || [],
  }
}
