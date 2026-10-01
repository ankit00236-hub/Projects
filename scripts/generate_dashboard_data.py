"""Build compact dashboard summaries and a reproducible audit of local sources.

No records are synthesized and unrelated source files are never joined as borrowers
or warranty claims. Missing numeric values are excluded with explicit denominators.
"""
import csv
import hashlib
import json
import math
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEXT_FIELDS = {'vehicle_type', 'brand', 'model', 'engine_type', 'region'}
SCORE_BANDS = [(None, 600, 'Below 600'), (600, 700, '600–699'),
               (700, 750, '700–749'), (750, None, '750 and above')]
OBLIGATION_BANDS = [(0, 30, 'Below 30%'), (30, 50, '30–49.99%'),
                    (50, 70, '50–69.99%'), (70, None, '70% and above')]


def read_rows(path):
    with path.open(encoding='utf-8-sig', newline='') as source:
        return list(csv.DictReader(source))


def number(value):
    """Invalid, blank and nonfinite source values are missing, never zero."""
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def values_for(rows, key, minimum=None, maximum=None):
    result = [number(row.get(key)) for row in rows]
    return [value for value in result if value is not None
            and (minimum is None or value >= minimum)
            and (maximum is None or value <= maximum)]


def mean(values, digits=2):
    return round(sum(values) / len(values), digits) if values else None


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    return round(ordered[lower] + (ordered[min(lower + 1, len(ordered) - 1)]
                                  - ordered[lower]) * (position - lower), 2)


def distribution(values, bands):
    return [{'label': label, 'minInclusive': lower, 'maxExclusive': upper,
             'records': sum((lower is None or value >= lower)
                            and (upper is None or value < upper) for value in values),
             'percentage': round(100 * sum((lower is None or value >= lower)
                                          and (upper is None or value < upper)
                                          for value in values) / len(values), 2) if values else None}
            for lower, upper, label in bands]


def credit_summary(rows):
    scores = values_for(rows, 'credit_score', minimum=0)
    eligible_emi = values_for(rows, 'average_eligible_emi', minimum=0)
    obligations = values_for(rows, 'average_obligation_to_income_ratio', minimum=0)
    bounces = values_for(rows, 'bounce_count', minimum=0)
    return {
        'summary': {'records': len(rows), 'averageScore': mean(scores, 0),
                    'averageEmi': mean(eligible_emi),
                    'stability': dict(Counter((row.get('income_stability') or '').strip()
                                              or 'UNKNOWN' for row in rows))},
        'insights': {
            'below600': sum(value < 600 for value in scores),
            'withBounces': sum(value > 0 for value in bounces),
            'averageObligationRatio': mean(obligations),
            'scoreBands': distribution(scores, SCORE_BANDS),
            'obligationBands': distribution(obligations, OBLIGATION_BANDS),
            'denominators': {'creditScore': len(scores), 'eligibleEmi': len(eligible_emi),
                             'obligationRatio': len(obligations), 'bounceCount': len(bounces)},
            'missingOrInvalid': {'creditScore': len(rows) - len(scores),
                                 'eligibleEmi': len(rows) - len(eligible_emi),
                                 'obligationRatio': len(rows) - len(obligations),
                                 'bounceCount': len(rows) - len(bounces)},
            'obligationUnit': 'percent',
            'obligationUnitBasis': 'Interpreted as percentage values from the source scale; the CSV does not declare units.',
            'bandPurpose': 'Descriptive dataset groups, not lender approval rules or default probabilities.',
            'monetarySourceCurrency': None,
        },
    }


def safety_summary(raw_rows, records):
    # Remove only complete repeated source rows, retaining distinct configurations.
    seen = set()
    rows = []
    for row in raw_rows:
        key = tuple(row.items())
        if key not in seen:
            rows.append(row)
            seen.add(key)
    stars = [number(row.get('OVERALL_STARS')) for row in rows]
    ratings = [int(value) for value in stars if value is not None
               and value.is_integer() and 1 <= value <= 5]
    missing = sum(not (row.get('OVERALL_STARS') or '').strip() for row in rows)
    safety_keys = {(row['MAKE'].strip().casefold(), row['MODEL'].strip().casefold(),
                    number(row['MODEL_YR'])) for row in rows}
    service_keys = {(row['brand'].strip().casefold(), row['model'].strip().casefold(),
                     row['make_year']) for row in records}
    matched = service_keys & safety_keys
    years = values_for(rows, 'MODEL_YR')
    return {
        'source': 'Data/Safercar_data.csv', 'rawRecords': len(raw_rows), 'records': len(rows),
        'duplicatesRemoved': len(raw_rows) - len(rows), 'ratedRecords': len(ratings),
        'unratedRecords': len(rows) - len(ratings), 'missingOverallRatings': missing,
        'invalidOverallRatings': len(rows) - len(ratings) - missing,
        'averageOverallStars': mean(ratings),
        'starDistribution': [{'stars': value, 'records': ratings.count(value),
                              'percentage': round(100 * ratings.count(value) / len(ratings), 2)
                              if ratings else None} for value in range(1, 6)],
        'makes': len({row['MAKE'].strip().casefold() for row in rows}),
        'models': len({(row['MAKE'].strip().casefold(), row['MODEL'].strip().casefold())
                       for row in rows}),
        'yearRange': {'min': int(min(years)) if years else None,
                      'max': int(max(years)) if years else None},
        'matchedServiceVehicles': len(matched),
        'matchedServiceRecords': sum((row['brand'].strip().casefold(),
                                      row['model'].strip().casefold(), row['make_year'])
                                     in matched for row in records),
        'matchFields': ['brand', 'model', 'make_year'],
        'scope': 'Source configuration rows; aggregate safety reference only.',
        'limitations': [
            'Ratings are not warranty claim outcomes, credit scores, or default probabilities.',
            'Unrated configurations are excluded from star percentages and averages.',
            'Body styles and drivetrains are separate observations, not unique vehicles.',
            'No safety rating is attached to a service vehicle without a matching make, model, and year.',
        ],
    }


def source_info(relative, rows):
    path = ROOT / relative
    return {'path': relative, 'rows': len(rows), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def normalized_rows(rows):
    return Counter(tuple((key, value.strip()) for key, value in sorted(row.items())) for row in rows)


def main():
    service_path = 'Data/processed/service_records_clean.csv'
    credit_path = 'Data/processed/credit_score_clean.csv'
    raw_service_path = 'Data/Vehicle Maintenance- Service Records.csv'
    raw_credit_path = 'Data/credit_score_data.csv'
    safety_path = 'Data/Safercar_data.csv'
    rows = read_rows(ROOT / service_path)
    credit = read_rows(ROOT / credit_path)
    raw_service = read_rows(ROOT / raw_service_path)
    raw_credit = read_rows(ROOT / raw_credit_path)
    raw_safety = read_rows(ROOT / safety_path)
    if not rows:
        raise ValueError('Service source is empty; dashboard cannot be generated.')
    records = [{key: value.strip() if key in TEXT_FIELDS else int(value)
                for key, value in row.items()} for row in rows]
    flags = [key for key in rows[0] if key not in TEXT_FIELDS
             and key not in {'slno', 'make_year', 'mileage_range', 'mileage', 'cost', 'oil_filter', 'engine_oil'}]
    vehicles = sorted({(row['brand'], row['model'], row['engine_type'], row['make_year'], row['region'])
                       for row in records})
    credit_data = credit_summary(credit)
    costs = [row['cost'] for row in records]
    data = {
        'summary': {'records': len(records), 'averageCost': mean(costs)},
        'initialForm': {key: value for key, value in records[0].items()
                        if key not in {'slno', 'vehicle_type', 'oil_filter', 'engine_oil', 'cost'}},
        'vehicles': [dict(zip(('brand', 'model', 'engine_type', 'make_year', 'region'), value))
                     for value in vehicles],
        'flags': flags, 'mileageRanges': sorted({row['mileage_range'] for row in records}),
        'components': [{'name': flag.replace('_', ' '), 'key': flag,
                        'value': round(100 * sum(row[flag] for row in records) / len(records), 1)}
                       for flag in flags],
        'portfolio': [{'model': model, 'units': sum(row['model'] == model for row in records),
                       'average': mean([row['cost'] for row in records if row['model'] == model])}
                      for model in sorted({row['model'] for row in records})],
        'credit': credit_data['summary'],
        'insights': {
            'costs': {'min': min(costs), 'median': percentile(costs, 0.5),
                      'p90': percentile(costs, 0.9), 'max': max(costs)},
            'regions': [{'region': region, 'records': sum(row['region'] == region for row in records),
                         'average': mean([row['cost'] for row in records if row['region'] == region])}
                        for region in sorted({row['region'] for row in records})],
            'intervals': [{'interval': interval,
                           'records': sum(row['mileage_range'] == interval for row in records),
                           'average': mean([row['cost'] for row in records if row['mileage_range'] == interval]),
                           'median': percentile([row['cost'] for row in records if row['mileage_range'] == interval], 0.5),
                           'p90': percentile([row['cost'] for row in records if row['mileage_range'] == interval], 0.9)}
                          for interval in sorted({row['mileage_range'] for row in records})],
            'credit': credit_data['insights'],
        },
        'safety': safety_summary(raw_safety, records),
        'lineage': {
            'serviceSource': raw_service_path, 'creditSource': raw_credit_path,
            'safetySource': safety_path, 'auditPath': 'Data/processed/risk_data_audit.json',
            'syntheticRecordsAdded': 0, 'serviceDisplayCurrency': 'INR',
            'serviceSourceCurrency': None, 'creditSourceCurrency': None,
            'currencyNote': 'Local CSVs do not declare currency. INR is the project display convention, not a verified conversion.',
            'crossDatasetBorrowerJoin': False,
            'crossDatasetJoinNote': 'Service and credit sources have no shared borrower or policy identifiers; aggregate references stay separate.',
        },
    }
    raw_credit_data = credit_summary(raw_credit)
    audit = {
        'schemaVersion': 1,
        'sources': [source_info(path, source) for path, source in [
            (raw_service_path, raw_service), (service_path, rows), (raw_credit_path, raw_credit),
            (credit_path, credit), (safety_path, raw_safety)]],
        'verification': {
            'processedServiceMatchesRaw': normalized_rows(rows) == normalized_rows(raw_service),
            'processedCreditMatchesRaw': normalized_rows(credit) == normalized_rows(raw_credit),
            'creditMetricsMatchRaw': credit_data == raw_credit_data,
            'serviceRows': len(records), 'creditRows': len(credit), 'syntheticRowsAdded': 0,
        },
        'credit': credit_data,
        'metricDefinitions': {
            'below600': 'Count of finite nonnegative credit_score values strictly below 600; denominator creditScore.',
            'withBounces': 'Count of finite nonnegative bounce_count values greater than zero; denominator bounceCount.',
            'averageObligationRatio': 'Arithmetic mean of finite nonnegative source average_obligation_to_income_ratio values; values retained on the 0–100 percentage scale.',
            'scoreBands': 'Local descriptive intervals [minimum inclusive, maximum exclusive], not a validated default or lender approval model.',
            'obligationBands': 'Local descriptive percentage intervals [minimum inclusive, maximum exclusive], not approval thresholds.',
            'serviceCosts': 'Observed service costs summarized by mileage_range; p90 and median use linear interpolation at (n − 1) × percentile.',
            'missingValues': 'Blank, malformed, nonfinite or negative risk values excluded; per-metric denominator and missingOrInvalid count reported.',
        },
        'safety': data['safety'], 'lineage': data['lineage'],
        'excludedSources': [
            {'path': 'Data/car_prices.csv', 'reason': 'Different vehicle market; no declared monetary currency or borrower/policy linkage. Selling prices not treated as INR loan training targets.'},
            {'path': 'Data/train.csv', 'reason': 'AC/TV appliance warranty fraud labels cannot validate automotive warranty decisions.'},
            {'path': 'Data/test_1.csv', 'reason': 'AC/TV appliance records are not automotive claims and have no fraud labels.'},
            {'path': 'Data/sample_submission.csv', 'reason': 'Competition prediction template, not observed automotive outcomes.'},
        ],
    }
    if not all(audit['verification'][key] for key in ['processedServiceMatchesRaw', 'processedCreditMatchesRaw', 'creditMetricsMatchRaw']):
        raise ValueError('Processed data no longer matches the raw source; review cleaning and risk denominators before regenerating.')
    with (ROOT / 'public/service-records-INR.csv').open('w', newline='', encoding='utf-8-sig') as output:
        writer = csv.DictWriter(output, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    (ROOT / 'src/data/trainingData.json').write_text(json.dumps(data, separators=(',', ':')) + '\n', encoding='utf-8')
    (ROOT / 'Data/processed/risk_data_audit.json').write_text(json.dumps(audit, indent=2) + '\n', encoding='utf-8')
    print(f'Generated verified summaries: {len(records)} service, {len(credit)} credit, '
          f'{data["safety"]["records"]} safety configuration references; no synthesized rows.')


if __name__ == '__main__':
    main()
