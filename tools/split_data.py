"""Split snapshot.json into a small current-cycle file and an archive.

data/core.json     everything the site needs plus Fall 2027 reports (loads first)
data/archive.json  reports and receipts for earlier years (loaded on request)

snapshot.json stays the single master copy that tools/update_data.py edits.
Files are only rewritten when their content changes.
"""
import gzip, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRENT_YEAR = 2027


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def write_if_changed(path, text):
    path.parent.mkdir(exist_ok=True)
    if path.exists() and path.read_text(encoding='utf-8') == text:
        return False
    path.write_text(text, encoding='utf-8')
    return True


def main():
    snap = json.loads((ROOT / 'snapshot.json').read_text(encoding='utf-8'))
    sources = snap['reportSources']
    current = [r for r in snap['reports'] if r['year'] == CURRENT_YEAR]
    older = [r for r in snap['reports'] if r['year'] != CURRENT_YEAR]
    current_ids = {r['source'] for r in current}
    archive = {
        'schemaVersion': 1,
        'reports': older,
        'reportSources': {k: v for k, v in sources.items() if k not in current_ids},
    }
    archive_text = dump(archive)
    core = {k: v for k, v in snap.items() if k not in ('reports', 'reportSources')}
    core['reports'] = current
    core['reportSources'] = {k: sources[k] for k in current_ids if k in sources}
    core['archiveInfo'] = {
        'reports': len(older),
        'years': sorted({r['year'] for r in older}),
        'gzipBytes': len(gzip.compress(archive_text.encode('utf-8'), 6)),
        'currentYear': CURRENT_YEAR,
    }
    changed = [name for name, text in (('core.json', dump(core)), ('archive.json', archive_text))
               if write_if_changed(ROOT / 'data' / name, text)]
    print(f"core: {len(current)} reports; archive: {len(older)} reports "
          f"(~{core['archiveInfo']['gzipBytes'] // 1024} KB compressed); rewritten: {changed or 'none'}")


if __name__ == '__main__':
    main()
