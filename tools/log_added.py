"""Records how many results each update added (Ontario and BC), for the phone messages.

Run by the workflow after the spreadsheets are read. Compares snapshot.json with the list of
report ids saved before the update (BEFORE_IDS, default /tmp/before_ids.json) and appends
{"at": <UTC time>, "new": <count>} to data/added-log.json (last 60 days kept).
"""
import datetime as dt, json, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / 'data' / 'added-log.json'

try:
    before = set(json.loads(Path(os.environ.get('BEFORE_IDS', '/tmp/before_ids.json')).read_text(encoding='utf-8')))
except Exception:
    raise SystemExit('No list of earlier reports; nothing logged.')
snap = json.loads((ROOT / 'snapshot.json').read_text(encoding='utf-8'))
new = sum(1 for r in snap.get('reports', []) if r.get('id') not in before)
now = dt.datetime.now(dt.timezone.utc)
try:
    log = json.loads(LOG.read_text(encoding='utf-8'))
except Exception:
    log = []
cutoff = (now - dt.timedelta(days=60)).strftime('%Y-%m-%dT%H:%M:%SZ')
log = [e for e in log if e.get('at', '') >= cutoff]
log.append({'at': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'new': new})
LOG.write_text(json.dumps(log, separators=(',', ':')), encoding='utf-8')
print(f'logged {new} new results')
