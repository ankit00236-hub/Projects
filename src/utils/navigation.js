const pages = new Set(['overview', 'warranty', 'financing', 'risk', 'reports', 'notes', 'portfolio'])
export function pageFromHash(hash) {
  // Older section bookmarks continue to open the corresponding page.
  const page = hash.replace(/^#\/?/, '').split('?')[0]
  return pages.has(page) ? page : 'overview'
}
