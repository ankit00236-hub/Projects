import { loanEstimate } from './finance.js'
function dateIsValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
export function validateVehicles(assets) {
  if (!Array.isArray(assets) || !assets.every((a) => a &&
    ['id', 'owner', 'registration'].every((key) => typeof a[key] === 'string' && a[key].trim()) &&
    a.service && ['brand', 'model', 'engine_type', 'region'].every((key) => typeof a.service[key] === 'string') &&
    ['make_year', 'mileage_range', 'mileage'].every((key) => Number.isFinite(a.service[key]) && a.service[key] >= 0) &&
    a.policy && dateIsValid(a.policy.start) && dateIsValid(a.policy.end) && a.policy.start <= a.policy.end &&
    Number.isFinite(a.policy.maxMileage) && a.policy.maxMileage >= 0 &&
    Number.isFinite(a.policy.claimLimit) && a.policy.claimLimit > 0 &&
    Array.isArray(a.policy.components) && a.policy.components.length && a.policy.components.every((c) => typeof c === 'string') &&
    a.loan && loanEstimate(a.loan) && Number.isFinite(a.monthlyIncome) && a.monthlyIncome > 0 &&
    Number.isFinite(a.existingEmi) && a.existingEmi >= 0 && Number.isFinite(a.overdueAmount) && a.overdueAmount >= 0)) {
    throw new Error('Shared vehicle records are invalid.')
  }
  if (new Set(assets.map((a) => a.id)).size !== assets.length || new Set(assets.map((a) => a.registration.trim().toUpperCase())).size !== assets.length) throw new Error('Shared vehicle identifiers must be unique.')
  return assets
}
