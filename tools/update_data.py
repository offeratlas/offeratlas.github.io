"""Daily updater for Offer Atlas.

Reads the public 2026-2027 applications spreadsheet, adds new rows to
snapshot.json in the same format the site already uses, refreshes row links
for existing rows (the sheet is re-sorted by school), and updates the audit
counters. A row that was renamed in the sheet (same submission time) updates the
result already on the site. A result is only removed when it is a second copy of a
row that is still in the sheet; rows deleted from the sheet stay on the site.

Usage:
  python tools/update_data.py              # update snapshot.json in place
  python tools/update_data.py --dry-run    # report what would change
  python tools/update_data.py --selftest   # rebuild existing rows and compare
  --allow-cleanup   # let one run remove more than MAX_CLEANUP second copies
"""
import csv, datetime as dt, difflib, hashlib, io, json, re, sys, urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "snapshot.json"
SID = "1NG89zu-cTnWU03dfmI0XSeQ--36ZHAHTpZQ9Lrrz7fM"
GID = 1105020004
SHEET = "Form Responses 1"
DATASET = "S2027"
YEAR = 2027
MAX_CLEANUP = 15   # more second copies than this in one run looks wrong: stop instead of removing
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SID}/export?format=csv&gid={GID}"

ACCESS = "Live Google Sheets connector; full bounded source scan"
NOTE = ("Unverified applicant self-report. Official catalog matching verifies the existence of a program, "
        "not this acceptance or reported average. Source rows may overlap across spreadsheets and Reddit; "
        "they are not unique applicants.")
CONTEXT_SOURCE = "Public spreadsheet applicant-supplied comments; contact details redacted."
FLAG_PROGRAM = "Exact program name not matched to official catalog"
FLAG_FUTURE = "Decision date is in the future"
FLAG_CYCLE = "Decision date outside expected admission cycle; raw value retained"
FLAG_APPDATE = "Source application date follows decision date"
FLAG_NONPCT = "Non-percentage curriculum result preserved"
FLAG_NOTS = "Missing submission timestamp; row identity requires review"
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
          'September', 'October', 'November', 'December']
OUTCOMES = {'offer': 'Offer', 'rejected': 'Rejected', 'rejection': 'Rejected', 'deferred': 'Deferred',
            'deferral': 'Deferred', 'waitlisted': 'Waitlisted', 'waitlist': 'Waitlisted',
            'alternate offer': 'Alternate', 'alternate': 'Alternate'}
CANADA = {'ontario', 'quebec', 'québec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan',
          'nova scotia', 'new brunswick', 'newfoundland and labrador', 'newfoundland',
          'prince edward island', 'yukon', 'northwest territories', 'nunavut'}
HOME_INSTITUTIONS = {'Laurier', 'Waterloo'}
CYCLE_START, CYCLE_END = dt.date(YEAR - 1, 9, 1), dt.date(YEAR, 8, 31)


def fingerprint(ts, school, program):
    text = json.dumps([SID, ts, school, program], separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(text.encode()).hexdigest()[:32]


def norm(text):
    return re.sub(r'\s+', ' ', (text or '').strip()).lower()


def program_key(text):
    """Loose program name used to match spelling variants within one school."""
    t = norm(text).replace('’', "'").replace('–', '-').replace('—', '-')
    t = re.sub(r'\b(co-?op(erative education)?|honou?rs|hons|with|w/|w /|program|degree)\b', ' ', t)
    t = re.sub(r'[()\[\],:;/&+.-]', ' ', t).replace(' and ', ' ')
    return re.sub(r'\s+', ' ', t).strip()


def parse_date(text):
    try:
        return dt.datetime.strptime(text.strip(), '%m/%d/%Y').date()
    except (ValueError, AttributeError):
        return None


def parse_average(raw):
    label = (raw or '').strip()
    m = re.fullmatch(r'(\d{2,3}(?:\.\d+)?)\s*%?', label)
    if m and 0 <= float(m.group(1)) <= 100:
        v = float(m.group(1))
        return (int(v) if v.is_integer() and '.' not in m.group(1) else v), label, None
    return None, label, (FLAG_NONPCT if '/' in label else None)


def study_mode(program):
    p = norm(program)
    if re.search(r'\b(non[- ]?co-?op|no co-?op|without co-?op|regular)\b', p):
        return 'Non-co-op'
    if re.search(r'co-?op(erative)?\s*(available|option)|available with co-?op|select majors', p):
        return 'Unstated'
    if re.search(r'\bco-?op\b|co-?operative education', p):
        return 'Co-op'
    return 'Unstated'


def curriculum(province):
    p = norm(province)
    if p == 'ontario':
        return 'Ontario'
    return 'Other Canadian' if p in CANADA else 'Unstated'


def redact(text):
    t = (text or '').strip()
    t = re.sub(r'[\w.+-]+@[\w-]+\.[\w.]+', '[contact redacted]', t)
    t = re.sub(r'(?<!\d)(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)', '[contact redacted]', t)
    t = re.sub(r'(?i)\b(discord|insta(gram)?|snap(chat)?|ig|dm me)\b\s*[:@]?\s*@?[\w.]{3,}', '[contact redacted]', t)
    return t


class Model:
    """Everything learned from the existing snapshot."""

    def __init__(self, snap):
        self.snap = snap
        self.sources = snap['reportSources']
        self.programs = {p['id']: p for p in snap['programs']}
        self.schools = {}          # normalized raw school -> (university, institutionId)
        self.exact = {}            # (institutionId, normalized raw program) -> program id
        self.loose = {}            # (institutionId, program_key) -> program id
        self.inst_meta = {}        # institutionId -> (url, color) for new programs
        self.judged = {}           # (institutionId, normalized raw program) -> (programVerified, program flag)
        for r in snap['reports']:
            src = self.sources.get(r['source'], {})
            if src.get('rawSchool'):
                self.schools.setdefault(norm(src['rawSchool']), (r['university'], r['institutionId']))
            self.schools.setdefault(norm(r['university']), (r['university'], r['institutionId']))
            if src.get('rawProgram'):
                key = (r['institutionId'], norm(src['rawProgram']))
                self.exact.setdefault(key, r['program'])
                # remember how this exact spelling was judged before (report-level, stricter than program-level)
                self.judged.setdefault(key, (r.get('programVerified', True),
                                             FLAG_PROGRAM in r.get('reviewFlags', [])))
        for p in snap['programs']:
            if p.get('institutionId'):
                key = (p['institutionId'], program_key(p['name']))
                if p.get('verification') == 'Official catalog match' or key not in self.loose:
                    self.loose[key] = p['id']
                self.inst_meta.setdefault(p['institutionId'], (p.get('url', ''), p.get('color', '#326a51')))
        self.new_programs = []

    def school(self, raw):
        return self.schools.get(norm(raw))

    def program(self, inst, univ, raw):
        pid = self.exact.get((inst, norm(raw))) or self.loose.get((inst, program_key(raw)))
        if pid:
            return pid
        name = re.sub(r'\s+', ' ', raw.strip())
        # co-op and non-co-op options share one program; the report keeps studyMode
        no_coop = re.sub(r'(?i)\s*[-–,(]?\s*(with\s+|w/\s*)?co-?op(erative education)?(\s+(available|option))?\s*\)?', '', name).strip(' -–,')
        name = no_coop or name
        pid ='P_' + hashlib.sha256(json.dumps([inst, name], ensure_ascii=False).encode()).hexdigest()[:32]
        if pid not in self.programs:
            url, color = self.inst_meta.get(inst, ('', '#326a51'))
            prog = {"id": pid, "name": name, "short": name, "university": univ, "institutionId": inst,
                    "range": "Not established", "degree": "As submitted", "mode": "As submitted",
                    "focus": "Self-reported application program; consult the official catalog for its current admission route.",
                    "route": "Source label; entry route may differ from a later major.",
                    "url": url, "color": color, "verification": "Needs program review",
                    "verificationNote": "Canadian institution recognized. Exact program label has not been matched to an official catalog; original wording retained.",
                    "checked": TODAY, "displayName": name, "canonicalProgram": pid}
            self.programs[pid] = prog
            self.new_programs.append(prog)
        self.exact[(inst, norm(raw))] = pid
        return pid

    def verified(self, pid):
        return self.programs[pid].get('verification', 'Official catalog match') == 'Official catalog match'


def build(model, row_no, r):
    """Turn one spreadsheet row into (report, source) or (None, reason)."""
    ts, raw_school, ouac, raw_prog, decision, avg, app_date, dec_date = (r + [''] * 14)[:8]
    group, citizen, province, supp, supp_info, comments = (r + [''] * 14)[8:14]
    if not raw_prog.strip() and ouac.strip() and not re.fullmatch(r'[A-Z]{2,4}', ouac.strip()):
        raw_prog = ouac      # some rows put the program name in the OUAC column
        ouac = ''
    school = model.school(raw_school)
    if not school:
        return None, 'Non-Canadian or unverified institution'
    if not raw_prog.strip():
        return None, 'Missing program'
    outcome = OUTCOMES.get(norm(decision))
    if not outcome:
        return None, 'Missing or unrecognized decision'
    univ, inst = school
    pid = model.program(inst, univ, raw_prog)
    flags = []
    if not ts.strip():
        flags.append(FLAG_NOTS)
    d, a = parse_date(dec_date), parse_date(app_date)
    if d and not (CYCLE_START <= d <= CYCLE_END):
        flags.append(FLAG_CYCLE)
    elif d and d > dt.date.fromisoformat(TODAY):
        flags.append(FLAG_FUTURE)
    if d and a and a > d:
        flags.append(FLAG_APPDATE)
    average, label, avg_flag = parse_average(avg)
    if avg_flag:
        flags.append(avg_flag)
    verified, program_flag = model.judged.get((inst, norm(raw_prog)), (None, None))
    if verified is None:
        verified = model.verified(pid)
        program_flag = not verified
    if program_flag:
        flags.append(FLAG_PROGRAM)
    fp = fingerprint(ts, raw_school, raw_prog)
    sid = 'SRC_' + fp
    report_date = dt.datetime.strptime(ts.strip(), '%m/%d/%Y %H:%M:%S').strftime('%Y-%m-%d') if ts.strip() else ''
    report = {"id": 'R_' + fp, "applicant": sid, "source": sid, "program": pid, "university": univ,
              "institutionId": inst, "year": YEAR, "average": average, "averageLabel": label,
              "outcome": outcome, "month": MONTHS[d.month - 1] if d else 'Unknown',
              "decisionDate": d.isoformat() if d else '', "curriculum": curriculum(province),
              "homeInstitution": inst if inst in HOME_INSTITUTIONS else 'Unstated',
              "sourceType": "Spreadsheet", "needsReview": bool(flags), "reviewFlags": flags,
              "programVerified": verified, "studyMode": study_mode(raw_prog)}
    details = {"applicationDate": app_date.strip(), "applicantGroup": group.strip(), "citizenship": citizen.strip(),
               "province": province.strip(), "ouacCode": ouac.strip(), "supplementalApplication": supp.strip()}
    source = {"title": f"{YEAR} entry · {SHEET} · row {row_no}", "url": row_url(row_no), "reportDate": report_date,
              "access": ACCESS,
              "evidence": f"Source lists {univ}; submitted program {raw_prog}; decision {outcome}; "
                          f"reported average {avg or 'unstated'}; decision date {dec_date.strip() or 'unstated'}.",
              "note": NOTE, "datasetId": DATASET, "kind": "Spreadsheet", "row": row_no, "sheetName": SHEET,
              "spreadsheetId": SID, "submissionTimestamp": ts, "rawSchool": raw_school, "rawProgram": raw_prog,
              "rawOutcome": decision, "rawAverage": avg, "rawDecisionDate": dec_date, "checked": TODAY,
              "fingerprint": fp, "applicantComments": redact(comments),
              "supplementalContext": ("Supplemental application: " + redact(supp_info)) if supp_info.strip() else '',
              "contextChecked": TODAY, "contextSource": CONTEXT_SOURCE,
              "applicationDetails": {k: v for k, v in details.items() if v}}
    return (report, source), None


def row_url(n):
    return f"https://docs.google.com/spreadsheets/d/{SID}/edit#gid={GID}&range=A{n}:N{n}"


def row_key(ts, school, prog):
    return (ts.strip(), norm(school), norm(prog))


def row_keys(r):
    """The ways a sheet row may be recorded on the site (program in either column)."""
    keys = [row_key(r[0], r[1], r[3] if r[3].strip() else r[2]), row_key(r[0], r[1], r[3])]
    return keys


def same_entry(src, r):
    """Same submission second; also ask for the same school, or the same average and decision date."""
    return norm(src['rawSchool']) == norm(r[1]) or \
        (norm(src['rawAverage']), norm(src['rawDecisionDate'])) == (norm(r[5]), norm(r[7]))


def find(existing, r):
    return next((existing[k] for k in row_keys(r) + [fingerprint(r[0], r[1], r[3])] if k in existing), None)


def match_renamed(model, rows, existing):
    """{row number: result} for rows whose school or program text was changed in the sheet.

    The submission time is the identity, but one person can submit twice in a second, so rows and
    results that still match exactly are set aside first, and the rest are paired by likeness.
    """
    claimed, left = set(), {}
    for n, r in enumerate(rows[1:], start=2):
        ts = r[0].strip()
        if not ts:
            continue
        rep = find(existing, r)
        if rep:
            claimed.add(rep['id'])
        else:
            left.setdefault(ts, []).append((n, r))
    free = {}
    for rep in {id(x): x for x in existing.values()}.values():
        ts = model.sources[rep['source']]['submissionTimestamp'].strip()
        if rep['id'] not in claimed and ts in left:
            free.setdefault(ts, []).append(rep)
    out = {}
    for ts, reps in free.items():
        pairs = []
        for n, r in left[ts]:
            for rep in reps:
                src = model.sources[rep['source']]
                if same_entry(src, r):
                    like = difflib.SequenceMatcher(None, norm(src['rawProgram']), norm(r[3] or r[2])).ratio()
                    pairs.append((norm(src['rawSchool']) == norm(r[1]), like, n, rep))
        used = set()
        for _, _, n, rep in sorted(pairs, key=lambda x: x[:3], reverse=True):
            if n not in out and rep['id'] not in used:
                out[n] = rep
                used.add(rep['id'])
    return out


def second_copies(model, rows):
    """Results left over from before a rename: every sheet row with that time is already on the site."""
    by_ts, reps_by_ts = {}, {}
    for r in rows[1:]:
        if r[0].strip():
            by_ts.setdefault(r[0].strip(), []).append(r)
    for rep in model.snap['reports']:
        src = model.sources.get(rep['source'])
        if src and src.get('datasetId') == DATASET:
            reps_by_ts.setdefault(src['submissionTimestamp'].strip(), []).append((rep, src))
    out = []
    for ts, reps in reps_by_ts.items():
        sheet = by_ts.get(ts)
        if not ts or not sheet or len(reps) < 2:
            continue
        live = {k for r in sheet for k in row_keys(r)}
        current = {row_key(ts, v['rawSchool'], v['rawProgram']): x for x, v in reps
                   if row_key(ts, v['rawSchool'], v['rawProgram']) in live}
        if not all(any(k in current for k in row_keys(r)) for r in sheet):
            continue
        out += [x for x, v in reps if row_key(ts, v['rawSchool'], v['rawProgram']) not in live
                and any(same_entry(v, r) or x['averageLabel'] == c['averageLabel'] or x['decisionDate'] == c['decisionDate']
                        for r in sheet for c in current.values())]
    return out


def load_rows(path=None):
    if path:
        rows = list(csv.reader(io.StringIO(Path(path).read_text(encoding='utf-8'))))
    else:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from sheet_fetch import fetch_rows   # CSV export, or a checked fallback when downloads are off
        rows = fetch_rows(SID, GID)
    if not rows or not rows[0] or rows[0][0].strip() != 'Timestamp' or 'University' not in rows[0][1]:
        raise SystemExit('Spreadsheet layout changed (unexpected header); not updating.')
    return rows


def main():
    global TODAY
    args = sys.argv[1:]
    try:
        from zoneinfo import ZoneInfo
        TODAY = dt.datetime.now(ZoneInfo('America/Toronto')).date().isoformat()
    except Exception:   # no time-zone data installed: fall back to Eastern standard time
        TODAY = dt.datetime.now(dt.timezone(dt.timedelta(hours=-5))).date().isoformat()
    global SNAPSHOT
    csv_path = next((a.split('=', 1)[1] for a in args if a.startswith('--csv=')), None)
    SNAPSHOT = Path(next((a.split('=', 1)[1] for a in args if a.startswith('--snapshot=')), SNAPSHOT))
    rows = load_rows(csv_path)
    snap = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
    model = Model(snap)
    existing = {}
    for rep in snap['reports']:
        src = model.sources.get(rep['source'])
        if src and src.get('datasetId') == DATASET:
            existing[row_key(src['submissionTimestamp'], src['rawSchool'], src['rawProgram'])] = rep
            existing.setdefault(src['fingerprint'], rep)

    if '--selftest' in args:
        return selftest(model, rows, existing)

    added, changed, relinked, excluded, scanned = [], 0, 0, [], 0
    renamed = match_renamed(model, rows, existing)
    had_results = {x['program'] for x in snap['reports']}
    for n, r in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in r) or not r[0].strip() and not r[1].strip():
            continue
        if not r[0].strip() and 'DO NOT REQUEST' in ''.join(r).upper():
            continue
        scanned += 1
        prog_col = r[3] if r[3].strip() else r[2]
        rep = existing.get(row_key(r[0], r[1], prog_col)) or existing.get(row_key(r[0], r[1], r[3])) \
            or existing.get(fingerprint(r[0], r[1], r[3])) or renamed.get(n)
        if rep:
            src = model.sources[rep['source']]
            if src['row'] != n:
                src['row'], src['url'], src['title'] = n, row_url(n), f"{YEAR} entry · {SHEET} · row {n}"
                relinked += 1
            if (norm(src['rawOutcome']), norm(src['rawAverage']), norm(src['rawDecisionDate'])) != \
                    (norm(r[4]), norm(r[5]), norm(r[7])) or n in renamed:
                built, _ = build(model, n, r)
                if built:   # entry edited or renamed in the sheet: refresh it, keep its identity
                    new_rep, new_src = built
                    new_rep.update(id=rep['id'], applicant=rep['applicant'], source=rep['source'])
                    new_src['fingerprint'] = src['fingerprint']
                    rep.clear(); rep.update(new_rep)
                    model.sources[rep['source']] = new_src
                    changed += 1
            continue
        built, reason = build(model, n, r)
        if not built:
            excluded.append({"dataset": DATASET, "row": n, "reason": reason, "rawSchool": r[1].strip()})
            continue
        rep, src = built
        if rep['source'] in model.sources:      # exact duplicate submission
            continue
        snap['reports'].append(rep)
        model.sources[rep['source']] = src
        existing[row_key(r[0], r[1], prog_col)] = rep
        added.append(rep)

    snap['programs'].extend(model.new_programs)
    copies = second_copies(model, rows)
    if len(copies) > MAX_CLEANUP and '--allow-cleanup' not in args:
        raise SystemExit(f'{len(copies)} results look like second copies, more than {MAX_CLEANUP}; not updating.')
    if copies:
        for rep in copies:
            src = model.sources.pop(rep['source'])
            print(f"  - second copy: {rep['university']} | {src['rawProgram'].strip()} | {rep['averageLabel']}")
        gone = {rep['id'] for rep in copies}
        snap['reports'] = [x for x in snap['reports'] if x['id'] not in gone]
    # unofficial program names that no result uses any more (their last result was renamed)
    used = {x['program'] for x in snap['reports']} | {p.get('canonicalProgram') for p in snap['programs'] if p.get('canonicalProgram') != p['id']}
    empty = {pid for pid in had_results if pid not in used and model.programs.get(pid, {}).get('verification') == 'Needs program review'}
    snap['programs'] = [p for p in snap['programs'] if p['id'] not in empty]
    included = sum(1 for x in snap['reports'] if model.sources.get(x['source'], {}).get('datasetId') == DATASET)
    flagged = sum(1 for x in snap['reports'] if x['year'] == YEAR and x['needsReview']
                  and model.sources.get(x['source'], {}).get('datasetId') == DATASET)
    ds = next(d for d in snap['datasets'] if d['id'] == DATASET)
    ds.update(scannedRows=scanned, sourceRowsAvailable=scanned, includedRows=included, includedOutcomes=included,
              flaggedOutcomes=flagged, checked=TODAY, scannedRange=f"A1:N{len(rows)}", gridRowCount=len(rows))
    audit = snap['importAudit']
    audit['checked'] = TODAY
    audit['sourceRowsScanned'] = audit.get('sourceRowsScanned', 0) + len(added)
    audit['includedSourceRows'] = audit.get('includedSourceRows', 0) + len(added)
    audit['programs'] = len(snap['programs'])
    old_ex = [e for e in audit.get('excludedRows', []) if e['dataset'] != DATASET]
    audit['excludedRows'] = old_ex + [{k: v for k, v in e.items() if k != 'rawSchool'} for e in excluded]
    audit['excluded'] = dict(Counter(e['reason'] for e in audit['excludedRows']))
    held = sorted({e['rawSchool'] for e in excluded if e['reason'] == 'Non-Canadian or unverified institution'})
    audit['unrecognizedSchools2027'] = held
    ra = snap['refreshAudit']
    ra.update(reviewDate=TODAY, newOutcomes=len(added), changedOutcomes=changed)
    ra['currentSheet'].update(scannedRange=f"A1:N{len(rows)}", nonHeaderRowsReturned=scanned)
    snap['checked'] = TODAY
    total = len(snap['reports'])
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    if added or changed:
        snap['runtimeStatus'] = {"lastUpdated": stamp, "message":
            f"{dt.date.fromisoformat(TODAY):%B} {dt.date.fromisoformat(TODAY).day}: daily spreadsheet refresh added "
            f"{len(added)} new and updated {changed} edited Fall {YEAR} outcomes; {total:,} outcomes in total. "
            f"New program names not yet matched to an official catalog are labelled for review."}

    print(f"rows scanned {scanned}; new {len(added)}; edited {changed}; renamed {len(renamed)}; second copies removed {len(copies)}; links refreshed {relinked}; "
          f"new programs {len(model.new_programs)}; excluded {len(excluded)} {held}")
    for rep in added[:50]:
        src = model.sources[rep['source']]
        print(f"  + row {src['row']}: {rep['university']} | {src['rawProgram'].strip()} | {rep['outcome']} | {rep['averageLabel']}")
    if '--dry-run' in args:
        return
    if not (added or changed or relinked or copies):
        print('No new or edited entries; snapshot.json left unchanged.')
        return
    SNAPSHOT.write_text(json.dumps(snap, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    # Daily history for the public changelog (one entry per day with changes).
    hist_path = ROOT / 'data' / 'history.json'
    try:
        hist = json.loads(hist_path.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        hist = []
    entry = next((h for h in hist if h.get('date') == TODAY), None)
    if entry is None:
        entry = {'date': TODAY, 'new': 0, 'edited': 0, 'total': 0, 'programs': []}
        hist.append(entry)
    entry['new'] += len(added)
    entry['edited'] += changed
    entry['total'] = len(snap['reports'])
    tops = Counter(entry.get('offerCounts') or {})   # adds up across the day's hourly runs
    tops.update(f"{r['university']}|{model.programs.get(r['program'], {}).get('name', '')}" for r in added if r['outcome'] == 'Offer')
    entry['offerCounts'] = dict(tops.most_common(40))
    entry['programs'] = [k for k, _ in tops.most_common(5)] or entry.get('programs', [])
    hist_path.parent.mkdir(exist_ok=True)
    hist_path.write_text(json.dumps(sorted(hist, key=lambda h: h['date'])[-400:], ensure_ascii=False, indent=0), encoding='utf-8')


def selftest(model, rows, existing):
    """Rebuild every existing 2027 row from the sheet and compare with the stored record."""
    global TODAY
    diffs, total = Counter(), 0
    examples = {}
    for n, r in enumerate(rows[1:], start=2):
        prog_col = r[3] if r[3].strip() else r[2]
        rep = existing.get(row_key(r[0], r[1], prog_col)) or existing.get(row_key(r[0], r[1], r[3]))
        if not rep:
            continue
        src = model.sources[rep['source']]
        TODAY = src['checked']
        built, reason = build(model, n, r)
        total += 1
        if not built:
            diffs['NOT BUILT: ' + reason] += 1
            continue
        b, bs = built
        for k in rep:
            if k in ('id', 'applicant', 'source'):
                continue
            if rep[k] != b.get(k):
                diffs[k] += 1
                examples.setdefault(k, []).append((src['rawProgram'], rep[k], b.get(k)))
        for k in ('applicantComments', 'supplementalContext', 'evidence', 'applicationDetails', 'reportDate'):
            if src.get(k) != bs.get(k):
                diffs['src.' + k] += 1
                examples.setdefault('src.' + k, []).append((src.get(k), bs.get(k)))
    print(f"compared {total} existing rows")
    for k, v in diffs.most_common():
        print(f"  {k}: {v} differ")
        for e in examples.get(k, [])[:4]:
            print('     ', str(e)[:230])


if __name__ == '__main__':
    main()
