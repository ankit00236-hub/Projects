const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
export const rupees = (amount) => currency.format(amount)
export const title = (value) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export function openSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  window.history.replaceState(null, '', `#${id}`)
}
export function exportCsv(rows, filename) {
  if (!rows.length) throw new Error('There are no records to export.')
  const keys = Object.keys(rows[0])
  const escape = (value) => {
    const text = String(value ?? '')
    return `"${(/^[\s]*[-=+@]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`
  }
  const csv = [keys, ...rows.map((row) => keys.map((key) => row[key]))].map((row) => row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function readCases() {
  const saved = JSON.parse(localStorage.getItem('plutus-cases') || '[]')
  const statuses = ['Pending', 'Review', 'Approved', 'Rejected']
  if (!Array.isArray(saved) || !saved.every((c) => c && typeof c.id === 'string' &&
    typeof c.vehicle === 'string' && typeof c.owner === 'string' && c.owner.trim() &&
    typeof c.claim === 'string' && statuses.includes(c.status) &&
    Number.isFinite(c.amount) && c.amount > 0)) {
    throw new Error('Saved cases are invalid.')
  }
  if (new Set(saved.map((c) => c.id)).size !== saved.length) throw new Error('Saved case IDs are duplicated.')
  return saved
}

export async function downloadServiceRecords() {
  const response = await fetch(`${import.meta.env.BASE_URL}service-records-INR.csv`)
  if (!response.ok) throw new Error('Unable to download service records. Please try again.')
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = 'service-records-INR.csv'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
