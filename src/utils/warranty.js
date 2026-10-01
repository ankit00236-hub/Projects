import { loanEstimate } from './finance.js'

export const componentLabel = (key) => key.replace('whell', 'wheel').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
export const vehicleLabel = (asset) => `${asset.registration} · ${componentLabel(asset.service.brand)} ${componentLabel(asset.service.model)}`
export function financeSummary(asset) {
  const loan = loanEstimate(asset.loan)
  if (!loan) return { issue: 'Invalid financing terms', emi: null, monthlyObligationRatio: null }
  return { ...loan, monthlyObligationRatio: asset.monthlyIncome > 0 ? (loan.emi + asset.existingEmi) / asset.monthlyIncome * 100 : null }
}
export function screenWarranty(item, assets, cases = []) {
  const asset = assets.find((a) => a.id === item.assetId)
  if (!asset) return { state: 'Incomplete', checks: [{ name: 'Vehicle link', ok: false, detail: 'Link this case to a vehicle and its entered policy terms.' }], asset: null }
  const claimDate = item.claimDate || item.created?.slice(0, 10)
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(claimDate || '')
  const duplicate = cases.some((other) => other.id !== item.id && other.assetId === item.assetId && other.claimKey === item.claimKey && other.claimDate === item.claimDate && other.amount === item.amount)
  const checks = [
    { name: 'Owner match', ok: item.owner.trim().toLowerCase() === asset.owner.trim().toLowerCase(), detail: item.owner.trim().toLowerCase() === asset.owner.trim().toLowerCase() ? 'Case owner matches the shared vehicle record.' : 'Case owner differs from the vehicle owner. Verify the linked record.' },
    { name: 'Policy dates', ok: validDate && claimDate >= asset.policy.start && claimDate <= asset.policy.end, detail: `Claim ${claimDate || 'date missing'}; entered coverage ${asset.policy.start} to ${asset.policy.end}.` },
    { name: 'Mileage limit', ok: Number.isFinite(item.mileage) && item.mileage >= 0 && item.mileage <= asset.policy.maxMileage, detail: `Claim mileage ${item.mileage ?? 'missing'} km; limit ${asset.policy.maxMileage} km.` },
    { name: 'Component coverage', ok: asset.policy.components.includes(item.claimKey), detail: `${componentLabel(item.claimKey || item.claim)} ${asset.policy.components.includes(item.claimKey) ? 'is listed' : 'is not listed'} in the entered policy.` },
    { name: 'Per-claim limit', ok: item.amount <= asset.policy.claimLimit, detail: `Requested ₹${item.amount}; entered limit ₹${asset.policy.claimLimit}.` },
    { name: 'Duplicate submission', ok: !duplicate, detail: duplicate ? 'Another case matches vehicle, component, date, and amount. Verify invoices.' : 'No matching submission in this browser.' },
  ]
  return { state: checks.every((c) => c.ok) ? 'Ready for review' : 'Needs attention', checks, asset }
}
export function assessmentService(item, asset, flags) {
  return { ...asset.service, mileage: item.mileage, ...Object.fromEntries(flags.map((flag) => [flag, Number(flag === item.claimKey)])) }
}
export function currentDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
