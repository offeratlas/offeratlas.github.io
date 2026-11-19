"""Builds the short phone message sent after the daily update (see the workflow's ntfy step).
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
    send('⚠️ Offer Atlas update failed', 'The 8 AM update did not finish. The site still shows yesterday’s data. Open GitHub Actions to see what went wrong.',
         'https://github.com/offeratlas/offeratlas.github.io/actions')
    sys.exit(0)

hist = load('data/history.json', [])
entry = next((h for h in hist if h.get('date') == today), None)
new = entry.get('new', 0) if entry else 0
edited = entry.get('edited', 0) if entry else 0
total = (entry or (hist[-1] if hist else {})).get('total', 0)
names = load('data/name-quality.json', {})
dl = load('data/deadline-quality.json', {})

title = f"✅ Offer Atlas: {new} new result{'s' if new != 1 else ''}" if new else '✅ Offer Atlas: no new results today'
lines = []
if new or edited:
    lines.append(f"{new} new, {edited} edited · {total:,} results in total")
tops = [p.split('|')[::-1] for p in (entry or {}).get('programs', [])[:3]]
if tops and new:
    lines.append('Most new offers: ' + '; '.join(f"{prog} ({uni})" for uni, prog in [(t[1], t[0]) if len(t) == 2 else ('', t[0]) for t in tops]))
checks = []
if names.get('newThisWeekNeedingAttention'):
    checks.append(f"{names['newThisWeekNeedingAttention']} new program names need a rule")
if dl.get('needsAttention'):
    checks.append(f"{dl['needsAttention']} deadlines need a re-check")
lines.append('Checks: ' + ('; '.join(checks) if checks else 'all clear'))
print(title)
print('\n'.join(lines))
