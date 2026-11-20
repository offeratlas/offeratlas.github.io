"""Reads a public Google Sheet tab as rows of text, the same as its CSV export.

1. The normal CSV export (exact text). Sheet owners can switch this off for viewers
   ("disable download"), which makes it answer 401/403.
2. Fallback: two public views combined.
   - gviz CSV has every column, but blanks values whose type differs from the rest
     of the column (e.g. "42/45 IB" in a column of numbers) and drops "%".
   - The web view (htmlview) has the exact typed text, but leaves out hidden columns.
   Rows are matched by position and columns by header name; for every column the web
   view shows, its text is used, otherwise the gviz value. If the two views disagree on
   row count or on any text value, nothing is returned (the update stops safely).
"""
import csv, io, re, time, urllib.error, urllib.request
from html.parser import HTMLParser

UA = {'User-Agent': 'offeratlas-updater'}


def _get(url, tries=3):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode('utf-8')
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404) or i == tries - 1:
                raise
        except Exception:
            if i == tries - 1:
                raise
        time.sleep(5 * (i + 1))


class _Table(HTMLParser):
    """Collects (row-header text, [th texts], [td texts]) for every <tr>."""
    def __init__(self):
        super().__init__(); self.rows = []; self.row = None; self.cell = None; self.kind = None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row = ([], [])
        elif tag in ('td', 'th') and self.row is not None:
            self.cell = []; self.kind = tag; self.span = int(dict(attrs).get('colspan') or 1)
        elif tag == 'br' and self.cell is not None: self.cell.append('\n')
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            text = ''.join(self.cell)
            if self.kind == 'th': self.row[0].append(text)
            else: self.row[1].extend([text] + [''] * (self.span - 1))   # merged cell: text in its first column
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.rows.append(self.row); self.row = None
    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)


def _col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _combined(sid, gid):
    base = f'https://docs.google.com/spreadsheets/d/{sid}'
    for attempt in range(3):   # someone may submit between the two downloads: try again
        g = list(csv.reader(io.StringIO(_get(f'{base}/gviz/tq?tqx=out:csv&headers=1&gid={gid}'))))
        t = _Table(); t.feed(_get(f'{base}/htmlview/sheet?headers=true&gid={gid}'))
        # column letters from the header row (hidden columns are simply absent)
        letters = next((ths for ths, tds in t.rows if len(ths) > 3 and all(re.fullmatch('[A-Z]{0,3}', x.strip()) for x in ths)), None)
        if not letters:
            raise SystemExit('Sheet web view has no column letters; not updating.')
        cols = [_col_index(x.strip()) for x in letters[1:]]   # first <th> is the row-number corner
        web = {}
        for ths, tds in t.rows:
            if len(ths) == 1 and ths[0].strip().isdigit():
                web[int(ths[0].strip())] = dict(zip(cols, tds))
        while g and not any(c.strip() for c in g[-1]): g.pop()
        last = max(web) if web else 0
        while last and not any(v.strip() for v in web[last].values()): last -= 1
        if len(g) == last:
            break
        time.sleep(10)
    else:
        raise SystemExit(f'Sheet views disagree on row count ({len(g)} vs {last}); not updating.')
    out = []
    for n, gr in enumerate(g, start=1):
        wr = web.get(n)
        if wr is None:
            raise SystemExit(f'Sheet web view is missing row {n}; not updating.')
        row = []
        for j, gv in enumerate(gr):
            if j in wr:
                hv = wr[j]
                if gv.strip() and re.search('[A-Za-z]', gv) and gv.strip() != hv.strip():
                    raise SystemExit(f'Sheet views disagree at row {n} ({gv!r} vs {hv!r}); not updating.')
                row.append(hv)
            else:
                row.append(gv)
        out.append(row)
    return out


def fetch_rows(sid, gid):
    """Rows of the tab as lists of strings, row 1 = header (like the CSV export)."""
    try:
        return list(csv.reader(io.StringIO(_get(f'https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}'))))
    except urllib.error.HTTPError as e:
        if e.code not in (401, 403):
            raise
        print(f'CSV export blocked ({e.code}); reading the public views instead.')
        return _combined(sid, gid)
