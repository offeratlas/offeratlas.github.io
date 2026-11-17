// Pure page builder for static, search-friendly program pages.
// Input: the snapshot plus the site's own program catalog (catalog.js), so pages match the explorer.
// Output: { 'relative/path': 'file contents' }. No file system access here.

export const MIN_REPORTS = 5;
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSduOQcWoG-Hk8s-pn-TyM8CyDvxe8otqYOklNhDJChptaRRxg/viewform';
const ISSUES = 'https://github.com/offeratlas/offeratlas.github.io/issues/new';
const CYCLE = ['September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(.{0,110})-.*$/, (m, a) => m.length > 110 ? a : m);
const num = v => typeof v === 'number' && Number.isFinite(v);
const quantile = (sorted, q) => { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
const pct = v => v === null ? '—' : (Math.round(v * 10) / 10).toFixed(1) + '%';
const fmtDate = iso => { if (!iso) return 'Unstated'; const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
const avgLabel = r => num(r.average) ? (String(r.averageLabel).includes('%') ? r.averageLabel : r.averageLabel + '%') : (r.averageLabel || 'Unstated');

function stats(rs) {
  const years = [...new Set(rs.map(r => r.year))].sort((a, b) => b - a).map(year => {
    const all = rs.filter(r => r.year === year), offers = all.filter(r => r.outcome === 'Offer');
    const vals = offers.map(r => r.average).filter(num).sort((a, b) => a - b);
    const dated = offers.map(r => r.decisionDate).filter(Boolean).sort();
    return { year, n: all.length, offers: offers.length, median: quantile(vals, .5), p25: quantile(vals, .25), p75: quantile(vals, .75), numeric: vals.length, first: dated[0] || null };
  });
  const offers = rs.filter(r => r.outcome === 'Offer');
  const vals = offers.map(r => r.average).filter(num).sort((a, b) => a - b);
  const months = CYCLE.map(m => [m, offers.filter(r => r.month === m).length]);
  const buckets = [['Below 80', 0, 80], ['80–85', 80, 85], ['85–90', 85, 90], ['90–95', 90, 95], ['95+', 95, 101]].map(([label, a, b]) => {
    const inB = rs.filter(r => num(r.average) && r.average >= a && r.average < b);
    return { label, offers: inB.filter(r => r.outcome === 'Offer').length, other: inB.filter(r => r.outcome !== 'Offer').length };
  });
  const latestYear = years.find(y => y.numeric >= 3);
  return { years, offers: offers.length, median: quantile(vals, .5), months, buckets, latestYear };
}

const head = ({ title, desc, url, site }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Offer Atlas"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${site}/og-image.jpg"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#162840"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/programs/page.css"></head><body>`;
const topbar = `<header class="pg-top"><a class="pg-brand" href="/"><span class="pg-icon" aria-hidden="true">↗</span>OFFER ATLAS</a><nav><a href="/programs/">All programs</a><a href="/">Explorer</a><a class="pg-submit" href="${FORM}" target="_blank" rel="noopener noreferrer">Submit your result ↗</a></nav></header>`;
const footer = `<footer class="pg-foot"><p><strong>Self-reported, unverified data.</strong> Reports come from public, applicant-submitted spreadsheets and Reddit posts. They are not unique applicants, not a random sample, and medians are not cutoffs. Not affiliated with any university.</p><p><a href="/#sources">Sources &amp; credits</a> · <a href="${FORM}" target="_blank" rel="noopener noreferrer">Submit your result ↗</a> · <a href="${ISSUES}" target="_blank" rel="noopener noreferrer">Report a correction ↗</a></p></footer></body></html>`;

function programPage({ p, rs, slug, s, site }) {
  const name = p.displayName || p.name, url = `${site}/programs/${slug}/`;
  const explore = `/?p=${encodeURIComponent(p.id)}`;
  const ly = s.latestYear;
  const desc = `${name} at ${p.university}: ${rs.length} self-reported admission results, ${s.offers} offers` +
    (ly ? `, median reported offer average ${pct(ly.median)} for Fall ${ly.year}` : '') + '. See averages, offer dates and every source.';
  const title = `${name} — ${p.university} admission averages & offer dates | Offer Atlas`;
  const maxM = Math.max(1, ...s.months.map(m => m[1])), maxB = Math.max(1, ...s.buckets.map(b => b.offers + b.other));
  const latest = [...rs].sort((a, b) => b.year - a.year || String(b.decisionDate || '').localeCompare(a.decisionDate || '')).slice(0, 20);
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Programs', item: `${site}/programs/` },
    { '@type': 'ListItem', position: 2, name: `${name} — ${p.university}`, item: url }] };
  return head({ title, desc, url, site }) + topbar + `<main class="pg">
<p class="pg-crumbs"><a href="/programs/">Programs</a> › <a href="/programs/#${esc(slugify(p.university))}">${esc(p.university)}</a></p>
<h1>${esc(name)}</h1><p class="pg-sub">${esc(p.university)} · self-reported admission results</p>
<div class="pg-stats">
 <div><span>Reports</span><strong>${rs.length}</strong></div>
 <div><span>Offers</span><strong>${s.offers}</strong></div>
 <div><span>Median offer average${ly ? ` · Fall ${ly.year}` : ''}</span><strong>${ly ? pct(ly.median) : '—'}</strong></div>
 <div><span>Median offer average · all years</span><strong>${pct(s.median)}</strong></div>
</div>
<div class="pg-cta"><a class="pg-btn" href="${explore}">Explore every receipt →</a><a class="pg-btn ghost" href="${FORM}" target="_blank" rel="noopener noreferrer">Got a decision? Add yours ↗</a></div>
<section><h2>By entry year</h2><div class="pg-scroll"><table><thead><tr><th>Entry</th><th>Reports</th><th>Offers</th><th>Median offer avg</th><th>Middle half of offers</th><th>Earliest offer</th></tr></thead><tbody>
${s.years.map(y => `<tr><td>Fall ${y.year}</td><td>${y.n}</td><td>${y.offers}</td><td>${y.numeric >= 3 ? pct(y.median) : '—'}</td><td>${y.numeric >= 4 ? pct(y.p25) + ' – ' + pct(y.p75) : '—'}</td><td>${fmtDate(y.first)}</td></tr>`).join('')}
</tbody></table></div><p class="pg-note">Medians need at least 3 numeric offer averages; the middle-half range needs 4.</p></section>
<div class="pg-two">
<section><h2>When offers arrived</h2><div class="pg-bars">${s.months.map(([m, c]) => `<div class="pg-bar"><span>${m.slice(0, 3)}</span><span class="pg-track"><i style="width:${(c / maxM * 100).toFixed(1)}%"></i></span><b>${c || ''}</b></div>`).join('')}</div><p class="pg-note">Offers with a stated decision month, all years.</p></section>
<section><h2>Averages reported</h2><div class="pg-bars">${s.buckets.map(b => `<div class="pg-bar"><span>${b.label}</span><span class="pg-track"><i style="width:${(b.offers / maxB * 100).toFixed(1)}%"></i><em style="width:${(b.other / maxB * 100).toFixed(1)}%"></em></span><b>${b.offers + b.other || ''}</b></div>`).join('')}</div><p class="pg-note"><i class="k off"></i>Offers <i class="k oth"></i>Other outcomes (rejected, deferred, waitlisted…)</p></section>
</div>
<section><h2>Latest reports</h2><div class="pg-scroll"><table><thead><tr><th>Entry</th><th>Average</th><th>Outcome</th><th>Decision</th><th></th></tr></thead><tbody>
${latest.map(r => `<tr><td>Fall ${r.year}</td><td>${esc(avgLabel(r))}</td><td><span class="pg-out ${esc(r.outcome)}">${esc(r.outcome)}</span></td><td>${r.decisionDate ? fmtDate(r.decisionDate) : esc(r.month || 'Unstated')}</td><td><a href="/?p=${encodeURIComponent(p.id)}&amp;r=${encodeURIComponent(r.id)}">Receipt →</a></td></tr>`).join('')}
</tbody></table></div><p class="pg-note">Showing ${latest.length} of ${rs.length}. <a href="${explore}">See all ${rs.length} with filters and charts →</a></p></section>
${p.url ? `<p class="pg-official">Official program information: <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.university)} ↗</a></p>` : ''}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</main>` + footer;
}

function indexPage({ pages, site, total }) {
  const byUni = new Map();
  for (const pg of pages) { if (!byUni.has(pg.p.university)) byUni.set(pg.p.university, []); byUni.get(pg.p.university).push(pg); }
  const unis = [...byUni.keys()].sort((a, b) => a.localeCompare(b));
  const title = 'All programs — Canadian university admission averages | Offer Atlas';
  const desc = `Self-reported admission averages and offer dates for ${pages.length} Canadian university programs, from ${total.toLocaleString('en-CA')} public applicant reports.`;
  return head({ title, desc, url: `${site}/programs/`, site }) + topbar + `<main class="pg">
<h1>Every program, its reported outcomes</h1><p class="pg-sub">${pages.length} programs with at least ${MIN_REPORTS} self-reported results. Updated daily.</p>
<input id="pg-search" class="pg-search" type="search" placeholder="Search a program or school…" aria-label="Search programs">
${unis.map(u => `<section class="pg-uni" id="${esc(slugify(u))}"><h2>${esc(u)}</h2><ul>${byUni.get(u).sort((a, b) => (a.p.displayName || a.p.name).localeCompare(b.p.displayName || b.p.name)).map(pg =>
    `<li><a href="/programs/${pg.slug}/">${esc(pg.p.displayName || pg.p.name)}</a><span>${pg.rs.length} reports${pg.s.latestYear ? ` · median offer ${pct(pg.s.latestYear.median)} (Fall ${pg.s.latestYear.year})` : ''}</span></li>`).join('')}</ul></section>`).join('')}
<script>document.getElementById('pg-search').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();for(const s of document.querySelectorAll('.pg-uni')){let any=false;const uni=s.querySelector('h2').textContent.toLowerCase();for(const li of s.querySelectorAll('li')){const show=!q||uni.includes(q)||li.textContent.toLowerCase().includes(q);li.hidden=!show;any=any||show;}s.hidden=!any;}});</script>
</main>` + footer;
}

const CSS = `:root{--ink:#162840;--muted:#536477;--paper:#f5f4ef;--line:#d9dede;--lime:#d6f46a;--blue:#375af4;--green:#247458;--red:#b13c4d;font:17px Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper)}
*{box-sizing:border-box}body{margin:0;background:var(--paper)}a{color:inherit;text-underline-offset:4px}
.pg-top{max-width:1100px;margin:auto;padding:18px 16px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.pg-brand{font-weight:850;letter-spacing:-.3px;text-decoration:none;display:flex;align-items:center;gap:10px}.pg-icon{background:var(--ink);color:var(--lime);width:34px;height:34px;border-radius:10px;display:grid;place-items:center}
.pg-top nav{display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:15px;font-weight:650}.pg-submit{background:var(--lime);padding:8px 14px;border-radius:30px;text-decoration:none}
.pg{max-width:1100px;margin:auto;padding:22px 16px 40px}.pg-crumbs{font-size:14px;color:var(--muted);margin:0 0 10px}
.pg h1{font-size:clamp(30px,5vw,46px);letter-spacing:-1.5px;line-height:1.08;margin:0}.pg-sub{color:var(--muted);margin:8px 0 22px}
.pg-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.pg-stats div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.pg-stats span{display:block;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted)}.pg-stats strong{font-size:28px;letter-spacing:-.8px}
.pg-cta{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 8px}.pg-btn{background:var(--ink);color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px}.pg-btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.pg section{margin-top:28px}.pg h2{font-size:21px;margin:0 0 12px}.pg-two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.pg-scroll{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px}table{width:100%;border-collapse:collapse;font-size:15px;min-width:520px}th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line)}th{font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)}tr:last-child td{border-bottom:0}
.pg-note{font-size:13px;color:var(--muted);margin:8px 0 0}.pg-bars{display:grid;gap:6px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}
.pg-bar{display:grid;grid-template-columns:72px 1fr 34px;align-items:center;gap:8px;font-size:13px}.pg-bar>span:first-child{color:var(--muted)}.pg-track{display:flex;gap:2px;height:12px}.pg-track i,.pg-track em{display:block;height:12px;border-radius:6px;background:var(--green)}.pg-track em{background:#c5ccd6}.pg-bar>b{font-weight:650;text-align:right}
.k{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 4px 0 10px;vertical-align:middle}.k.off{background:var(--green);margin-left:0}.k.oth{background:#c5ccd6}
.pg-out{font-size:12px;font-weight:700;padding:3px 9px;border-radius:20px;background:#edf1fb;color:#2846a2}.pg-out.Offer{background:#e3f2ea;color:#21654a}.pg-out.Rejected{background:#fae8ec;color:#9d3447}.pg-out.Deferred{background:#fff1dd;color:#8d5b19}
.pg-official{font-size:14px;color:var(--muted);margin-top:24px}.pg-search{width:100%;font:inherit;padding:12px 14px;border:1px solid var(--line);border-radius:12px;margin:4px 0 10px;background:#fff}
.pg-uni h2{font-size:19px;margin:22px 0 8px}.pg-uni ul{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:6px}
.pg-uni li{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}.pg-uni li a{font-weight:700;text-decoration:none}.pg-uni li a:hover{text-decoration:underline}.pg-uni li span{font-size:13px;color:var(--muted)}
.pg-foot{max-width:1100px;margin:auto;padding:24px 16px 40px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
@media(max-width:760px){.pg-two{grid-template-columns:1fr}.pg-stats strong{font-size:24px}}`;

export function buildSite({ snap, catalog, site = 'https://offeratlas.github.io' }) {
  const files = {}, byProg = new Map();
  for (const r of catalog.reports) { if (r.isSourceCollection) continue; if (!byProg.has(r.program)) byProg.set(r.program, []); byProg.get(r.program).push(r); }
  const used = new Set(), pages = [];
  const progs = catalog.programs.filter(p => !p.isSourceCollection && (byProg.get(p.id) || []).length >= MIN_REPORTS)
    .sort((a, b) => a.university.localeCompare(b.university) || (a.displayName || a.name).localeCompare(b.displayName || b.name) || a.id.localeCompare(b.id));
  for (const p of progs) {
    const rs = byProg.get(p.id);
    let slug = slugify(`${p.displayName || p.name} ${p.university}`) || 'program', n = 2;
    while (used.has(slug)) slug = slugify(`${p.displayName || p.name} ${p.university}`) + '-' + n++;
    used.add(slug);
    const s = stats(rs);
    const lastmod = rs.map(r => snap.reportSources?.[r.source]?.reportDate || r.decisionDate || '').filter(Boolean).sort().pop() || snap.checked;
    pages.push({ p, rs, slug, s, lastmod });
    files[`programs/${slug}/index.html`] = programPage({ p, rs, slug, s, site });
  }
  files['programs/index.html'] = indexPage({ pages, site, total: catalog.reports.length });
  files['programs/page.css'] = CSS;
  const newest = pages.map(x => x.lastmod).sort().pop() || snap.checked;
  files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [{ loc: `${site}/`, lastmod: newest }, { loc: `${site}/programs/`, lastmod: newest }, ...pages.map(x => ({ loc: `${site}/programs/${x.slug}/`, lastmod: x.lastmod }))]
      .map(u => `<url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n') + '\n</urlset>\n';
  return files;
}
