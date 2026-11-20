"""Adds the r/BCGrade12s admission spreadsheets to Offer Atlas.

Each run re-reads both public BC sheets and rebuilds their rows in snapshot.json,
so edits and deletions in the sheets are picked up. Rows are skipped when:
  * the applicant is a transfer student (the site covers high-school applicants),
  * one row names several schools (we can't tell which school the result is for),
  * the school isn't a recognized Canadian institution,
  * the row is an exact copy of a row already on the site: same school, program,
    decision, average, application date, response date and comments.
Rows that only share some stats are kept.

Usage:
  python tools/update_bc.py            # update snapshot.json in place
  python tools/update_bc.py --dry-run  # report only
"""
import csv, datetime as dt, hashlib, io, json, re, sys, urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_data as U  # shared helpers: norm, program_key, parse_date, study_mode, redact, Model, CANADA

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / 'snapshot.json'
CREDIT = 'r/BCGrade12s moderators'
SHEETS = [
    {"id": "BC2025", "year": 2025, "sid": "1RjkjiNevP1iMNLaJim1xxTiBoMqP4xGPqHulXpBP8Xc", "gid": 992616934,
     "title": "BC (Canadian) Grade 12 2025 Summary (Responses) · r/BCGrade12s", "sheet": "Form Responses 1", "layout": 2025},
    {"id": "BC2026", "year": 2026, "sid": "1x4YqRM344w_occH1OVuyci47V2ZY4Uz0NE4S6Ui70lQ", "gid": 1140327995,
     "title": "BC Grade 12 Post Secondary Summary 2026 (Responses) · r/BCGrade12s", "sheet": "Form Responses 1", "layout": 2026},
]
NOTE = ("Unverified applicant self-report from the r/BCGrade12s spreadsheet. The average shown is the core average "
        "when given, otherwise the Grade 12 or Grade 11 average. Rows may overlap with other spreadsheets; "
        "they are not unique applicants.")
OUTCOMES = {'accepted': 'Offer', 'offer': 'Offer', 'rejected': 'Rejected', 'waitlisted': 'Waitlisted',
            'waitlist': 'Waitlisted', 'deferred': 'Deferred'}

# Existing institutions keep the exact names already used on the site; new ones are added here.
NEW_SCHOOLS = {'SFU': 'Simon Fraser University', 'Capilano': 'Capilano University',
               'BCIT': 'British Columbia Institute of Technology', 'KPU': 'Kwantlen Polytechnic University',
               'VIU': 'Vancouver Island University', 'UFV': 'University of the Fraser Valley',
               'Saskatchewan': 'University of Saskatchewan', 'Douglas': 'Douglas College',
               'Rockies': 'College of the Rockies', 'BowValley': 'Bow Valley College', 'UNBC': 'University of Northern British Columbia',
               'TRU': 'Thompson Rivers University', 'Manitoba': 'University of Manitoba', 'Emily': 'Emily Carr University of Art + Design'}
# (pattern, institutionId) checked in order; a matched span is blanked so 'ubco' is not also read as 'ubc'.
SCHOOL_PATTERNS = [
    (r'ubc[\s-]?o\b|okanagan', 'UBCO'),
    (r'\bubc[\s-]?v?\b|\bubcv\b|university of british columbia|ubc vancouver', 'UBC'),
    (r'\bsfu\b|simon fraser', 'SFU'),
    (r'\bu ?vic\b|uvictoria|university of victoria', 'Victoria'),
    (r'u ?of ?a\b|\buoa\b|u ?alberta|university of alberta|\balberta\b', 'Alberta'),
    (r'u ?of ?c\b|\buoc\b|u ?calgary|university of calgary', 'Calgary'),
    (r'mcgill', 'McGill'), (r'mcmaster', 'McMaster'), (r"queen'?s|queensu", 'Queens'),
    (r'huron', 'Huron'), (r'\bwestern\b|\buwo\b', 'Western'), (r'waterloo', 'Waterloo'),
    (r'laurier|wilfred|wilfrid', 'Laurier'), (r'carleton', 'Carleton'), (r'u ?ottawa|university of ottawa', 'Ottawa'),
    (r'nipissing', 'Nipissing'), (r'\byork ?u?\b', 'York'), (r'u ?sask|saskatchewan', 'Saskatchewan'),
    (r'scarborough|\butsc\b|u ?of ?t sc\b', 'UTSC'), (r'mississauga|\butm\b|ut mississauga', 'UTM'),
    (r'st\.? ?-?george|\butsg\b|u ?of ?t[\s-]*sg\b', 'UTSG'), (r'u ?of ?t\b|university of toronto|\buoft\b', 'Toronto'),
    (r'capilano', 'Capilano'), (r'\bbcit\b', 'BCIT'), (r'\bkpu\b|kwantlen', 'KPU'), (r'\bviu\b', 'VIU'),
    (r'\bufv\b|fraser valley', 'UFV'), (r'douglas college', 'Douglas'), (r'college of the rockies', 'Rockies'),
    (r'bow valley', 'BowValley'), (r'langara', 'Langara'), (r'\bunbc\b|northern british columbia', 'UNBC'),
    (r'\bunb\b|new brunswick', 'UNB'), (r'thompson rivers|\btru\b', 'TRU'), (r'dalhousie', 'Dalhousie'),
    (r'concordia', 'Concordia'), (r'u ?manitoba|university of manitoba', 'Manitoba'), (r'emily carr', 'Emily'),
    (r'penn|bristol|lund|harvard|stanford|\bucla\b|oxford|cambridge|\bmit\b|\bnyu\b|university of washington', 'FOREIGN'),
]
PROVINCES = {'bc': 'British Columbia', 'b.c.': 'British Columbia', 'b.c': 'British Columbia', 'british columbia': 'British Columbia',
             'ab': 'Alberta', 'alberta': 'Alberta', 'on': 'Ontario', 'ontario': 'Ontario', 'sk': 'Saskatchewan',
             'mb': 'Manitoba', 'qc': 'Quebec', 'quebec': 'Quebec', 'ns': 'Nova Scotia', 'nb': 'New Brunswick'}


def schools_in(raw):
    t = ' ' + U.norm(raw).replace('’', "'") + ' '
    found = []
    for pat, inst in SCHOOL_PATTERNS:
        m = re.search(pat, t)
        if m:
            found.append(inst)
            t = t[:m.start()] + ' ' * (m.end() - m.start()) + t[m.end():]
    # 'UofT St. George' is one school (a campus), and Huron is an affiliated college of Western.
    if 'Toronto' in found and {'UTSG', 'UTSC', 'UTM'} & set(found):
        found.remove('Toronto')
    if 'Huron' in found and 'Western' in found:
        found.remove('Western')
    return found


def parse_avg(*raws):
    """First usable percentage among core, Grade 12 and Grade 11 averages."""
    for raw in raws:
        m = re.match(r'\s*(\d{2,3}(?:\.\d+)?)\s*%?', raw or '')
        if m and 50 <= float(m.group(1)) <= 100:
            v = float(m.group(1))
            return (int(v) if v.is_integer() and '.' not in m.group(1) else round(v, 2)), m.group(1)
    first = next((r.strip() for r in raws if (r or '').strip()), '')
    return None, first


def fields(layout, r):
    r = r + [''] * 40
    if layout == 2025:
        return dict(ts=r[0], school=r[1], program=r[2], status=r[3], g11=r[5], g12=r[6], core=r[7], ecs=r[8],
                    special=r[9], applied=r[10], responded=r[11], citizenship=r[12], residence=r[13], province=r[14],
                    grades=r[15], comments=r[17], scholarship=r[18], transfer=False)
    return dict(ts=r[0], school=r[2], program=r[3], status=r[4], g11=r[6], g12=r[7], core=r[8], ecs=r[9],
                special=r[10], applied=r[11], responded=r[12], scholarship=r[13], grades=r[14], comments=r[15],
                citizenship=r[30], residence=r[31], province=r[32], transfer=not r[1].strip().lower().startswith('first'))


def fp(sid, ts, school, program):
    return hashlib.sha256(json.dumps([sid, ts, school, program], separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()[:32]


def load(sheet):
    from sheet_fetch import fetch_rows   # CSV export, or a checked fallback when downloads are off
    rows = fetch_rows(sheet['sid'], sheet['gid'])
    head = ' '.join(rows[0]).lower() if rows else ''
    if not rows or rows[0][0].strip() != 'Timestamp' or 'school' not in head or 'average' not in head:
        raise SystemExit(f"{sheet['id']}: spreadsheet layout changed (unexpected header); not updating.")
    return rows


def main():
    args = sys.argv[1:]
    today = dt.date.today().isoformat()
    U.TODAY = today
    snap = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
    ids = {s['id'] for s in SHEETS}
    sources = snap['reportSources']
    old_bc = {r['id']: r for r in snap['reports'] if sources.get(r['source'], {}).get('datasetId') in ids}
    # start from the snapshot without BC rows, then rebuild them
    snap['reports'] = [r for r in snap['reports'] if r['id'] not in old_bc]
    for k in [k for k, v in sources.items() if v.get('datasetId') in ids]:
        del sources[k]
    model = U.Model(snap)
    univ_of = {}
    for r in snap['reports']:
        univ_of.setdefault(r['institutionId'], r['university'])
    univ_of.update({k: v for k, v in NEW_SCHOOLS.items() if k not in univ_of})

    # Index of rows already on the site, for the exact-duplicate check.
    def dkey(inst, year, outcome, avg):
        return (inst, year, outcome, str(avg))
    index = {}
    for r in snap['reports']:
        if r['year'] in (2025, 2026):
            index.setdefault(dkey(r['institutionId'], r['year'], r['outcome'], r['average']), []).append(r)

    def same_text(a, b):
        return U.norm(a) == U.norm(b)

    def as_date(text):
        text = (text or '').strip()
        d = U.parse_date(text)
        if d:
            return d
        for f in ('%d %b %Y', '%Y-%m-%d', '%B %d, %Y', '%b %d, %Y'):
            try:
                return dt.datetime.strptime(text, f).date()
            except ValueError:
                pass
        return None

    def is_copy(inst, year, outcome, avg, raw_prog, dec, app, comments):
        for o in index.get(dkey(inst, year, outcome, avg), []):
            s = sources.get(o['source'], {})
            if U.program_key(s.get('rawProgram', '')) != U.program_key(raw_prog):
                continue
            if (o.get('decisionDate') or None) != (dec.isoformat() if dec else None):
                continue
            if as_date(s.get('applicationDetails', {}).get('applicationDate')) != app:
                continue
            if not same_text(s.get('applicantComments', ''), U.redact(comments)):
                continue
            return o
        return None

    added, excluded, dupes = [], Counter(), []
    for sheet in SHEETS:
        rows = load(sheet)
        year, sid = sheet['year'], sheet['sid']
        start, end = dt.date(year - 1, 9, 1), dt.date(year, 8, 31)
        seen, scanned, included, flagged = set(), 0, 0, 0
        for n, raw in enumerate(rows[1:], start=2):
            if not any(c.strip() for c in raw):
                continue
            scanned += 1
            f = fields(sheet['layout'], raw)
            if f['transfer']:
                excluded['Transfer applicant (not a high-school application)'] += 1
                continue
            found = schools_in(f['school'])
            if len(found) != 1 or found[0] == 'FOREIGN':
                excluded['Several schools in one row' if len(found) > 1 else 'School not recognized or outside Canada'] += 1
                continue
            inst = found[0]
            univ = univ_of[inst]
            prog = re.sub(r'\s+', ' ', f['program'].strip())
            if not prog:
                excluded['Missing program'] += 1
                continue
            outcome = OUTCOMES.get(U.norm(f['status']))
            if not outcome:
                excluded['Missing or unrecognized decision'] += 1
                continue
            avg, label = parse_avg(f['core'], f['g12'], f['g11'])
            dec, app = as_date(f['responded']), as_date(f['applied'])
            # identical repeat submissions inside the same sheet
            sig = (inst, U.program_key(prog), outcome, str(avg), dec, app, U.norm(f['comments']), U.norm(f['ecs']))
            if sig in seen:
                excluded['Repeated submission in the same sheet'] += 1
                continue
            seen.add(sig)
            copy = is_copy(inst, year, outcome, avg, prog, dec, app, f['comments'])
            if copy:
                dupes.append((sheet['id'], n, univ, prog, outcome, label, copy['id']))
                excluded['Exact copy of a row already on the site'] += 1
                continue
            pid = model.program(inst, univ, prog)
            flags = []
            if dec and not (start <= dec <= end):
                flags.append(U.FLAG_CYCLE)
            if dec and app and app > dec:
                flags.append(U.FLAG_APPDATE)
            if avg is None and '/' in label:
                flags.append(U.FLAG_NONPCT)
            verified, program_flag = model.judged.get((inst, U.norm(prog)), (None, None))
            if verified is None:
                verified = model.verified(pid)
                program_flag = not verified
            if program_flag:
                flags.append(U.FLAG_PROGRAM)
            key = fp(sid, f['ts'], f['school'], prog)
            src_id = 'BC_' + key
            prov = PROVINCES.get(U.norm(f['province']).strip(), f['province'].strip())
            report = {"id": 'R_' + key, "applicant": src_id, "source": src_id, "program": pid, "university": univ,
                      "institutionId": inst, "year": year, "average": avg, "averageLabel": label, "outcome": outcome,
                      "month": U.MONTHS[dec.month - 1] if dec else 'Unknown', "decisionDate": dec.isoformat() if dec else '',
                      "curriculum": U.curriculum(prov), "homeInstitution": inst if inst in U.HOME_INSTITUTIONS else 'Unstated',
                      "sourceType": "Spreadsheet", "needsReview": bool(flags), "reviewFlags": flags,
                      "programVerified": verified, "studyMode": U.study_mode(prog)}
            details = {"applicationDate": f['applied'].strip(), "citizenship": f['citizenship'].strip(),
                       "residenceCountry": f['residence'].strip(), "province": prov,
                       "grade11Average": f['g11'].strip(), "grade12Average": f['g12'].strip(), "coreAverage": f['core'].strip(),
                       "scholarship": f['scholarship'].strip()}
            context = '\n'.join(x for x in [
                ('Activities / essays: ' + U.redact(f['ecs'])) if f['ecs'].strip() else '',
                ('Special circumstances: ' + U.redact(f['special'])) if f['special'].strip() else '',
                ('Course grades: ' + U.redact(f['grades'])) if f['grades'].strip() else ''] if x)
            ts = f['ts'].strip()
            try:
                report_date = dt.datetime.strptime(ts, '%m/%d/%Y %H:%M:%S').strftime('%Y-%m-%d')
            except ValueError:
                report_date = ''
            src = {"title": f"{year} entry · r/BCGrade12s · row {n}",
                   "url": f"https://docs.google.com/spreadsheets/d/{sid}/edit#gid={sheet['gid']}&range=A{n}",
                   "reportDate": report_date, "access": "Public Google Sheet (r/BCGrade12s); full scan",
                   "evidence": f"Row {n} lists {f['school'].strip()}; {prog}; status {f['status'].strip()}; "
                               f"averages G11 {f['g11'].strip() or '—'} / G12 {f['g12'].strip() or '—'} / core {f['core'].strip() or '—'}; "
                               f"response date {f['responded'].strip() or 'unstated'}.",
                   "note": NOTE, "datasetId": sheet['id'], "kind": "Spreadsheet", "row": n, "sheetName": sheet['sheet'],
                   "spreadsheetId": sid, "submissionTimestamp": ts, "rawSchool": f['school'].strip(), "rawProgram": prog,
                   "rawOutcome": f['status'].strip(), "rawAverage": label, "rawDecisionDate": f['responded'].strip(),
                   "checked": today, "fingerprint": key, "applicantComments": U.redact(f['comments']),
                   "supplementalContext": context, "contextChecked": today,
                   "contextSource": "Public spreadsheet applicant-supplied comments; contact details redacted.",
                   "applicationDetails": {k: v for k, v in details.items() if v}}
            if src_id in sources:
                excluded['Repeated submission in the same sheet'] += 1
                continue
            snap['reports'].append(report)
            sources[src_id] = src
            added.append(report)
            included += 1
            flagged += bool(flags)
        ds = next((d for d in snap['datasets'] if d['id'] == sheet['id']), None)
        if ds is None:
            ds = {"id": sheet['id']}
            snap['datasets'].append(ds)
        ds.update(title=sheet['title'], year=year, url=f"https://docs.google.com/spreadsheets/d/{sid}/edit#gid={sheet['gid']}",
                  spreadsheetId=sid, sheetName=sheet['sheet'], sheetId=sheet['gid'], scannedRows=scanned,
                  includedRows=included, includedOutcomes=included, flaggedOutcomes=flagged, checked=today,
                  credit=CREDIT, identityStrategy="SHA-256 of JSON [spreadsheet ID, raw timestamp, raw school, raw program]. "
                  "Rebuilt from the sheet on every run; transfer applicants and exact copies of rows already on the site are skipped.")

    snap['programs'].extend(p for p in model.new_programs if p['id'] not in {q['id'] for q in snap['programs']})
    new_ids = {r['id'] for r in added}
    print(f"BC rows on site: {len(added)} (was {len(old_bc)}); new programs {len(model.new_programs)}")
    for k, v in excluded.most_common():
        print(f"  skipped {v}: {k}")
    for d in dupes:
        print('  duplicate', d)
    print('  institutions', Counter(r['university'] for r in added).most_common(12))
    if '--dry-run' in args:
        return
    unchanged = new_ids == set(old_bc) and all(
        json.dumps(old_bc[r['id']], sort_keys=True) == json.dumps(r, sort_keys=True) for r in added)
    if unchanged:
        print('BC sheets unchanged; snapshot.json left as is.')
        return
    snap['importAudit']['programs'] = len(snap['programs'])
    SNAPSHOT.write_text(json.dumps(snap, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


if __name__ == '__main__':
    main()
