"""Builds the phone message sent after every hourly update (the first one after 7 AM also summarises yesterday).
Prints: line 1 = title, rest = body. Reads only files the job already wrote."""
import datetime as dt, json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
def load(p, default):
    try:
        return json.loads((ROOT / p).read_text(encoding='utf-8'))
    except Exception:
        return default

status = os.environ.get('JOB_STATUS', 'success')
def send(title, body, click='https://offeratlas.github.io/'):
    """Print the message; with --send, also publish it to the ntfy topic in NTFY_TOPIC (JSON keeps emoji safe)."""
    print(title); print(body)
    topic = os.environ.get('NTFY_TOPIC', '').strip()
    if '--send' not in sys.argv or not topic:
        return
    import urllib.request
    data = json.dumps({'topic': topic, 'title': title, 'message': body, 'click': click, 'tags': ['mortar_board']}).encode()
    req = urllib.request.Request('https://ntfy.sh/', data=data, headers={'Content-Type': 'application/json'})
    print('ntfy:', urllib.request.urlopen(req, timeout=20).status)
try:
    from zoneinfo import ZoneInfo
    today = dt.datetime.now(ZoneInfo('America/Toronto')).date().isoformat()
except Exception:
    today = dt.date.today().isoformat()

if status != 'success':
    send('⚠️ Offer Atlas update failed', 'The latest hourly update did not finish. The site still shows the previous data. Open GitHub Actions to see what went wrong.',
         'https://github.com/offeratlas/offeratlas.github.io/actions')
    sys.exit(0)

hist = load('data/history.json', [])
yday = (dt.date.fromisoformat(today) - dt.timedelta(days=1)).isoformat()
y = next((h for h in hist if h.get('date') == yday), {}) or {}
names = load('data/name-quality.json', {})
dl = load('data/deadline-quality.json', {})
# Every update logs how many results it added (Ontario and BC) in data/added-log.json.
log = load('data/added-log.json', [])
now = dt.datetime.now(dt.timezone.utc)
def at(e):
    try:
        return dt.datetime.strptime(e['at'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
    except Exception:
        return None
def tor_date(t):
    try:
        from zoneinfo import ZoneInfo
        return t.astimezone(ZoneInfo('America/Toronto')).date().isoformat()
    except Exception:
        return (t - dt.timedelta(hours=5)).date().isoformat()
last24 = sum(e.get('new', 0) for e in log if at(e) and now - at(e) <= dt.timedelta(hours=24))
new = sum(e.get('new', 0) for e in log if at(e) and tor_date(at(e)) == yday)            # all of yesterday
overnight = sum(e.get('new', 0) for e in log if at(e) and tor_date(at(e)) == today)      # since midnight

# What arrived in this update: reports that were not on the site before it ran.
snap = load('snapshot.json', {})
try:
    before = set(json.loads(open(os.environ.get('BEFORE_IDS', '/tmp/before_ids.json'), encoding='utf-8').read()))
except Exception:
    before = None
fresh = [r for r in snap.get('reports', []) if before is not None and r.get('id') not in before]
progs = {p.get('id'): p.get('displayName') or p.get('name') for p in snap.get('programs', []) if isinstance(p, dict)}
srcs = snap.get('reportSources', {})
srcs = srcs if isinstance(srcs, dict) else {x.get('id'): x for x in srcs}
def prog_name(r):
    return progs.get(r.get('program')) or ((srcs.get(r.get('source')) or {}).get('rawProgram') or 'Program').strip()
def avg(r):
    a = str(r.get('averageLabel') or '').strip()
    return (a + ('' if '%' in a or not a[:1].isdigit() else '%')) if a else 'no average'
try:
    from zoneinfo import ZoneInfo
    hour = dt.datetime.now(ZoneInfo('America/Toronto')).strftime('%-I %p') if hasattr(dt, 'datetime') else ''
except Exception:
    hour = ''
n = len(fresh)
total = len(snap.get('reports', []))
lines = []
if os.environ.get('MORNING') == 'true':
    title = f"☀️ Offer Atlas morning: {new} new yesterday" + (f", {n} this hour" if n else '')
    lines.append(f"Yesterday {new} new · since midnight {overnight} new · {total:,} results in total")
    tops = [p.split('|') for p in (y.get('programs') or [])[:3]]
    if tops and new:
        lines.append('Most new offers yesterday: ' + '; '.join(f"{t[1]} ({t[0]})" if len(t) == 2 else t[0] for t in tops))
else:
    title = (f"✅ Offer Atlas: {n} new result{'s' if n != 1 else ''}" if n else '✅ Offer Atlas: no new results') + (f" ({hour})" if hour else '')
    lines.append(f"{last24} new in the last 24 hours · {total:,} results in total")
for r in fresh[:5]:
    lines.append(f"• {prog_name(r)} — {r.get('university', '')}: {r.get('outcome', '')}, {avg(r)}")
if n > 5:
    lines.append(f"…and {n - 5} more")
checks = []
if names.get('newThisWeekNeedingAttention'):
    checks.append(f"{names['newThisWeekNeedingAttention']} new program names need a rule")
if dl.get('needsAttention'):
    checks.append(f"{dl['needsAttention']} deadlines need a re-check")
lines.append('Checks: ' + ('; '.join(checks) if checks else 'all clear'))
send(title, '\n'.join(lines))
