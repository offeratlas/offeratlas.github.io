// Generates programs/*, sitemap.xml from snapshot.json using the site's own catalog code.
// Run from the repository root: node tools/build-site.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildProgramCatalog } from '../catalog.js';
import { buildSite } from './site-pages.mjs';

const snap = JSON.parse(readFileSync('snapshot.json', 'utf8'));
const catalog = buildProgramCatalog(snap.programs, snap.reports, snap.reportSources);
const files = buildSite({ snap, catalog });

// Remove program pages that no longer exist, then write only files whose content changed.
const keep = new Set(Object.keys(files).filter(p => p.startsWith('programs/')).map(p => p.split('/')[1]));
if (existsSync('programs')) for (const d of readdirSync('programs', { withFileTypes: true }))
  if (d.isDirectory() && !keep.has(d.name)) rmSync(join('programs', d.name), { recursive: true, force: true });
let written = 0;
for (const [path, content] of Object.entries(files)) {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) continue;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  written++;
}
console.log(`program pages: ${Object.keys(files).filter(p => /^programs\/[^/]+\/index\.html$/.test(p)).length}; files written: ${written}`);
