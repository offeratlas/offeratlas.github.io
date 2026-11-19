// Daily deadline check (runs in the GitHub Action). Flags deadlines that need a human to re-check
// the official page: dates not posted yet, dates long passed (next cycle needed), entries not checked for months.
// Writes data/deadline-quality.json and prints a summary. Run from the repository root.
import { readFileSync, writeFileSync } from 'node:fs';
const dl = JSON.parse(readFileSync('deadlines.json', 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const issues = [];
for (const x of dl.items) {
  if (!x.date) { if (days(today, x.checked) > 14) issues.push({ id: x.id, problem: 'date still not posted: re-check the official page', url: x.url }); }
  else if (days(today, x.date) > 45) issues.push({ id: x.id, problem: 'passed more than 6 weeks ago: add next cycle’s date', url: x.url });
  if (days(today, x.checked) > 300) issues.push({ id: x.id, problem: 'not checked in over 10 months', url: x.url });
}
const upcoming = dl.items.filter(x => x.date && x.date >= today).length;
const out = { checked: today, cycle: dl.cycle, items: dl.items.length, upcoming, needsAttention: issues.length, issues };
writeFileSync('data/deadline-quality.json', JSON.stringify(out, null, 1));
console.log(`deadlines: ${dl.items.length} listed, ${upcoming} upcoming, ${issues.length} need a re-check`);
for (const i of issues) console.log(`  ${i.id}: ${i.problem}`);
