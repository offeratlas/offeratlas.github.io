"""Hourly duplicate check, run after the spreadsheets are read and before anything is published.

If it finds a problem the update stops (the site keeps its last good data) and the phone alert
says why. It does not share the updater's matching rules: it recounts from the sheet rows the
updater read (SHEET_ROWS, default <temp>/sheet_rows_2027.json) and the report ids that were on
the site before (BEFORE_IDS, default /tmp/before_ids.json).

Stops on:
  1. the same report id twice, or two Ontario 2027 or BC reports using one row (older rows and Reddit posts may list several)
  2. more Ontario Fall 2027 results with one submission time than rows in the sheet with that time
  3. new results that look like results already on the site under another time or name
     (same school, average, decision date, application date, province, comments): more than MAX_LOOKALIKE
  4. more than MAX_MISSING extra results no longer found in the sheet since the last update
     (the sheet was rewritten or only partly read)
  5. far more results on the site than rows in the sheet
Only noted (data/duplicate-check.json): possible double submissions by one applicant.
"""
import json, os, re, sys, tempfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAP = Path(os.environ.get('SNAPSHOT_FILE', ROOT / 'snapshot.json'))
OUT = Path(os.environ.get('DUPLICATE_OUT', ROOT / 'data' / 'duplicate-check.json'))
WHY = Path(os.environ.get('DUPLICATE_WHY', Path(tempfile.gettempdir()) / 'duplicate_problem.txt'))
DATASET = 'S2027'
MAX_LOOKALIKE = 3
MAX_MISSING = 15


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def norm(t):
    return re.sub(r'\s+', ' ', str(t or '').strip()).lower()


def when(t):
    """Submission time as numbers, so 11/6/2026 and 11/06/2026 are the same moment."""
    return tuple(int(x) for x in re.findall(r'\d+', t or '')) + (('pm',) if 'pm' in norm(t) else ())


snap = read(SNAP)
sheet = read(os.environ.get('SHEET_ROWS', Path(tempfile.gettempdir()) / 'sheet_rows_2027.json'))
try:
    before = set(read(os.environ.get('BEFORE_IDS', '/tmp/before_ids.json')))
except Exception:
    before = None
try:
    last = read(OUT)
except Exception:
    last = {}
reports, sources = snap['reports'], snap['reportSources']
problems = []

for label, counts in (('report id', Counter(r['id'] for r in reports)), ('source row', Counter(r['source'] for r in reports if r['source'].startswith('BC_') or sources.get(r['source'], {}).get('datasetId') == DATASET))):
    n = sum(c - 1 for c in counts.values() if c > 1)
    if n:
        problems.append(f'{n} results share a {label} with another result')

mine = [(r, sources[r['source']]) for r in reports if sources.get(r['source'], {}).get('datasetId') == DATASET]
rows = Counter(when(t) for t in sheet['times'])
site = Counter(when(s.get('submissionTimestamp')) for _, s in mine if when(s.get('submissionTimestamp')))
extra = {t: n - rows[t] for t, n in site.items() if rows[t] and n > rows[t]}
if extra:
    names = [f"{r['university']} {s.get('rawProgram', '').strip()}" for r, s in mine if when(s.get('submissionTimestamp')) in extra]
    problems.append(f"{sum(extra.values())} results are extra copies of a spreadsheet row (e.g. {'; '.join(names[:2])})")

missing = sum(n for t, n in site.items() if not rows[t])
was_missing = last.get('notInSheet')
if was_missing is not None and missing - was_missing > MAX_MISSING:
    problems.append(f'{missing - was_missing} results disappeared from the sheet since the last update (rewritten or only partly read?)')
if len(mine) - missing > len(sheet['times']):
    problems.append(f"{len(mine)} Fall 2027 results but only {len(sheet['times'])} spreadsheet rows")


def facts(r, s, program):
    d = s.get('applicationDetails', {})
    return (r['university'], r['averageLabel'] if r['average'] is None else str(r['average']), r['decisionDate'], r['outcome'], norm(d.get('applicationDate')),
            norm(d.get('province')), norm(d.get('citizenship')), norm(s.get('applicantComments')), program and norm(s.get('rawProgram')))


lookalikes = []
if before is not None:
    old = defaultdict(list)
    for r, s in mine:
        if r['id'] in before and not rows[when(s.get('submissionTimestamp'))]:   # its row is gone from the sheet
            old[facts(r, s, False)].append(r)
    lookalikes = [f"{r['university']} {s.get('rawProgram', '').strip()}" for r, s in mine if r['id'] not in before and old.get(facts(r, s, False))]
    if len(lookalikes) > MAX_LOOKALIKE:
        problems.append(f"{len(lookalikes)} new results match results already on the site (e.g. {'; '.join(lookalikes[:2])})")

groups = defaultdict(list)
for r, s in mine:
    groups[facts(r, s, True)].append((r, s))
repeats = [{'university': g[0][0]['university'], 'program': g[0][1].get('rawProgram', '').strip(), 'average': g[0][0]['averageLabel'],
            'decisionDate': g[0][0]['decisionDate'], 'submitted': [s.get('submissionTimestamp') for _, s in g]}
           for g in groups.values() if len(g) > 1]

if problems:
    WHY.write_text('Duplicate check stopped the update: ' + '. '.join(problems) + '. The site was not changed.', encoding='utf-8')
    print(WHY.read_text(encoding='utf-8'))
    sys.exit(1)
OUT.write_text(json.dumps({'checked': snap.get('checked'), 'results': len(mine), 'sheetRows': len(sheet['times']), 'duplicates': 0,
                           'notInSheet': missing, 'possibleRepeatSubmissions': len(repeats), 'repeats': repeats[:40]},
                          ensure_ascii=False, indent=1), encoding='utf-8')
print(f"Duplicate check passed: {len(mine)} results, {len(sheet['times'])} sheet rows, {missing} no longer in the sheet, "
      f"{len(repeats)} possible repeat submissions, {len(lookalikes)} look-alikes.")
