import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const data = JSON.parse(readFileSync(new URL('../src/data/trainingData.json', import.meta.url)))
const audit = JSON.parse(readFileSync(new URL('../Data/processed/risk_data_audit.json', import.meta.url)))
const python = (code) => JSON.parse(execFileSync('python3', ['-c', code], {
  cwd: root, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
}))

test('audit identifies current source files and agrees with independently recalculated raw risk', () => {
  for (const source of audit.sources) {
    const digest = createHash('sha256').update(readFileSync(new URL(`../${source.path}`, import.meta.url))).digest('hex')
    assert.equal(digest, source.sha256, `${source.path} changed without regenerating its audit`)
  }
  const raw = python(`
import csv,json
with open('Data/credit_score_data.csv',newline='') as f:
    rows=list(csv.DictReader(f))
scores=[float(r['credit_score']) for r in rows]
ratios=[float(r['average_obligation_to_income_ratio']) for r in rows]
print(json.dumps({'records':len(rows),'averageScore':round(sum(scores)/len(scores)),
 'below600':sum(s<600 for s in scores),
 'withBounces':sum(float(r['bounce_count'])>0 for r in rows),
 'averageObligationRatio':round(sum(ratios)/len(ratios),2),
 'scoreBands':[sum(s<600 for s in scores),sum(600<=s<700 for s in scores),
               sum(700<=s<750 for s in scores),sum(s>=750 for s in scores)],
 'obligationBands':[sum(s<30 for s in ratios),sum(30<=s<50 for s in ratios),
                    sum(50<=s<70 for s in ratios),sum(s>=70 for s in ratios)]}))
`)
  assert.equal(raw.records, data.credit.records)
  assert.equal(raw.averageScore, data.credit.averageScore)
  for (const key of ['below600', 'withBounces', 'averageObligationRatio']) {
    assert.equal(data.insights.credit[key], raw[key])
  }
  for (const key of ['scoreBands', 'obligationBands']) {
    assert.deepEqual(data.insights.credit[key].map((band) => band.records), raw[key])
    assert.equal(data.insights.credit[key].reduce((sum, band) => sum + band.records, 0), raw.records)
  }
  assert.equal(audit.verification.processedServiceMatchesRaw, true)
  assert.equal(audit.verification.processedCreditMatchesRaw, true)
  assert.equal(audit.verification.creditMetricsMatchRaw, true)
  assert.equal(audit.verification.syntheticRowsAdded, 0)
  assert.equal(data.lineage.crossDatasetBorrowerJoin, false)
  assert.equal(data.lineage.creditSourceCurrency, null)
})

test('risk bands use correct boundary comparisons and valid denominators for incomplete rows', () => {
  const result = python(`
import json,runpy
module=runpy.run_path('scripts/generate_dashboard_data.py')
rows=[dict(credit_score=s,average_obligation_to_income_ratio=r,bounce_count=b,
           average_eligible_emi=0,income_stability='STABLE')
      for s,r,b in [(599,29.99,0),(600,30,1),(700,50,2),(750,70,0)]]
rows += [dict(credit_score='',average_obligation_to_income_ratio='nan',bounce_count=None,
              average_eligible_emi=-1,income_stability=None),
         dict(credit_score='inf',average_obligation_to_income_ratio=-1,bounce_count=-2,
              average_eligible_emi='',income_stability='')]
print(json.dumps(module['credit_summary'](rows)))
`)
  assert.equal(result.summary.records, 6)
  assert.equal(result.summary.averageEmi, 0)
  assert.equal(result.summary.stability.UNKNOWN, 2)
  assert.deepEqual(result.insights.denominators, { creditScore: 4, eligibleEmi: 4, obligationRatio: 4, bounceCount: 4 })
  assert.deepEqual(result.insights.missingOrInvalid, { creditScore: 2, eligibleEmi: 2, obligationRatio: 2, bounceCount: 2 })
  assert.deepEqual(result.insights.scoreBands.map((band) => band.records), [1, 1, 1, 1])
  assert.deepEqual(result.insights.obligationBands.map((band) => band.records), [1, 1, 1, 1])
  assert.equal(result.insights.below600, 1)
  assert.equal(result.insights.withBounces, 2)
  assert.equal(result.insights.averageObligationRatio, 45)
})

test('safety chart excludes unrated rows and does not attach unrelated configurations to service vehicles', () => {
  const raw = python(`
import csv,json
with open('Data/Safercar_data.csv',newline='') as f:
    rows=list(csv.DictReader(f))
unique={tuple(sorted(r.items())) for r in rows}
ratings=[dict(r)['OVERALL_STARS'] for r in unique if dict(r)['OVERALL_STARS'] in ('1','2','3','4','5')]
print(json.dumps({'rawRecords':len(rows),'records':len(unique),'ratedRecords':len(ratings),
                 'stars':[ratings.count(str(s)) for s in range(1,6)]}))
`)
  assert.equal(data.safety.rawRecords, raw.rawRecords)
  assert.equal(data.safety.records, raw.records)
  assert.equal(data.safety.ratedRecords, raw.ratedRecords)
  assert.deepEqual(data.safety.starDistribution.map((point) => point.records), raw.stars)
  assert.equal(data.safety.ratedRecords + data.safety.unratedRecords, data.safety.records)
  assert.equal(data.safety.matchedServiceRecords, 0)
  assert.equal(data.safety.matchedServiceVehicles, 0)
  assert.ok(Math.abs(data.safety.starDistribution.reduce((sum, point) => sum + point.percentage, 0) - 100) < 0.03)
  assert.match(data.safety.scope, /reference only/)
})

test('service interval chart count and weighted mean reconcile with its source', () => {
  const intervals = data.insights.intervals
  assert.equal(intervals.reduce((sum, point) => sum + point.records, 0), data.summary.records)
  const weightedMean = intervals.reduce((sum, point) => sum + point.average * point.records, 0) / data.summary.records
  assert.ok(Math.abs(weightedMean - data.summary.averageCost) < 0.01)
  for (const point of intervals) {
    assert.ok(point.median <= point.p90)
    assert.ok(point.records > 0)
  }
})
