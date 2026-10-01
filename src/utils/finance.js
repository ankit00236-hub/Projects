export function loanEstimate({ price, down, rate, months }) {
  if (![price, down, rate, months].every(Number.isFinite) || price <= 0 || down < 0 || down >= price || rate < 0 || rate > 100 || !Number.isInteger(months) || months < 1 || months > 360) return null
  const principal = price - down
  const monthly = rate / 1200
  const emi = monthly === 0 ? principal / months : principal * monthly / -Math.expm1(-months * Math.log1p(monthly))
  const total = emi * months
  return { principal, emi, total, interest: Math.max(0, total - principal) }
}
