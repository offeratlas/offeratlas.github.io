// Generates programs/*, schools/* and sitemap.xml from snapshot.json using the site's own catalog code.
// Run from the repository root: node tools/build-site.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildProgramCatalog } from '../catalog.js';
import { buildSite } from './site-pages.mjs';

const snap = JSON.parse(readFileSync('snapshot.json', 'utf8'));
const catalog = buildProgramCatalog(snap.programs, snap.reports, snap.reportSources);
const files = buildSite({ snap, catalog });

// Remove generated page folders that no longer exist, then write only files whose content changed.
for (const root of ['programs', 'schools']) {
  const keep = new Set(Object.keys(files).filter(p => p.startsWith(root + '/')).map(p => p.split('/')[1]));
  if (existsSync(root)) for (const d of readdirSync(root, { withFileTypes: true }))
    if (d.isDirectory() && !keep.has(d.name)) rmSync(join(root, d.name), { recursive: true, force: true });
}
let written = 0;
for (const [path, content] of Object.entries(files)) {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) continue;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  written++;
}
const count = re => Object.keys(files).filter(p => re.test(p)).length;
console.log(`program pages: ${count(/^programs\/[^/]+\/index\.html$/)}; school pages: ${count(/^schools\/[^/]+\/index\.html$/)}; files written: ${written}`);
