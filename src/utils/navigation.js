export const pages = ['overview', 'warranty', 'financing', 'risk', 'reports', 'notes', 'portfolio', 'screening', 'claims', 'evaluation']
export function pageFromHash(hash) {
  const page = hash.replace(/^#\/?/, '').split('?')[0]
  return pages.includes(page) ? page : 'overview'
}
