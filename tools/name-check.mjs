// Daily name-quality check (runs in the GitHub Action after each data import).
// Every program name is already tidied for display by tidyName() in catalog.js; this script
// reports how many names it fixed and lists any it could not make look right, so they can be
// added to the rules in catalog.js. Writes data/name-quality.json and prints a summary.
// Run from the repository root: node tools/name-check.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { buildProgramCatalog, tidyName, CANON, SMALL } from '../catalog.js';

const snap = JSON.parse(readFileSync('snapshot.json', 'utf8'));
const { reports } = buildProgramCatalog(snap.programs, snap.reports, snap.reportSources);
const src = snap.reportSources;
const today = new Date(), dayMs = 864e5;
const recent = r => { const d = Date.parse(src[r.source]?.reportDate || ''); return d && today - d <= 7 * dayMs; };
const known = new Set(Object.values(CANON).map(v => v.toUpperCase()));

function problems(name) {
  const out = [];
  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 2) out.push('too short or no letters');
  if (name.length > 110) out.push('very long');
  if (/[^\w\s()&/+,.'’:;–\-À-ÿ]/.test(name)) out.push('unusual symbols');
  for (const w of name.match(/[A-Za-z][A-Za-z'’-]*/g) || []) {
    if (w === w.toLowerCase() && !SMALL.has(w) && w.length > 1 && w !== 'w') { out.push(`lowercase word "${w}"`); break; }
    if (w.length >= 2 && w.length <= 5 && w === w.toUpperCase() && !known.has(w)) { out.push(`unknown short form "${w}"`); break; }
  }
  return out;
}

const seen = new Map();
let fixed = 0;
for (const r of reports) {
  const raw = String(r.rawSubmittedProgram ?? '').trim(), shown = r.submittedProgram;
  if (raw !== shown) fixed++;
  const key = r.university + '|' + shown;
  if (seen.has(key)) { seen.get(key).reports++; if (recent(r)) seen.get(key).recent = true; continue; }
  seen.set(key, { university: r.university, raw, shown, reports: 1, recent: recent(r), problems: problems(shown) });
}
const flagged = [...seen.values()].filter(x => x.problems.length).sort((a, b) => b.recent - a.recent || b.reports - a.reports);
const result = {
  checked: today.toISOString().slice(0, 10),
  reports: reports.length,
  namesTidied: fixed,
  distinctNames: seen.size,
  needsAttention: flagged.length,
  newThisWeekNeedingAttention: flagged.filter(x => x.recent).length,
  examples: flagged.slice(0, 80),
};
writeFileSync('data/name-quality.json', JSON.stringify(result, null, 1));
console.log(`names: ${reports.length} reports, ${fixed} tidied for display, ${flagged.length} distinct names still need a rule ` +
  `(${result.newThisWeekNeedingAttention} from this week)`);
for (const x of flagged.filter(x => x.recent).slice(0, 25)) console.log(`  NEW  ${x.university}: "${x.shown}" — ${x.problems.join(', ')}`);
