// Pure page builder for static, search-friendly program and school pages.
// Input: the snapshot plus the site's own program catalog (catalog.js), so pages match the explorer.
// Output: { 'relative/path': 'file contents' }. No file system access here.

export const MIN_REPORTS = 5;
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSduOQcWoG-Hk8s-pn-TyM8CyDvxe8otqYOklNhDJChptaRRxg/viewform';
const ISSUES = 'https://github.com/offeratlas/offeratlas.github.io/issues/new';
const CREATOR = 'Regular-Database9310', CREATOR_URL = 'https://www.reddit.com/user/Regular-Database9310/', CREATOR_POST = 'https://www.reddit.com/r/OntarioGrade12s/s/gqGYqgWozB';
const CYCLE = ['September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'];
const ext = 'target="_blank" rel="noopener noreferrer"';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(.{0,110})-.*$/, (m, a) => m.length > 110 ? a : m);
const num = v => typeof v === 'number' && Number.isFinite(v);
const quantile = (sorted, q) => { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
const pct = v => v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toFixed(1) + '%';
const fmtDate = iso => { if (!iso) return 'Unstated'; const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
const avgLabel = r => num(r.average) ? (String(r.averageLabel).includes('%') ? r.averageLabel : r.averageLabel + '%') : (r.averageLabel || 'Unstated');

// Themes people mention in comments and supplemental-application notes.
const THEMES = [
  ['Kira assessment', /\bkira\b/], ['AIF (Waterloo form)', /\baif\b/], ['Casper', /\bcasper\b/], ['Interview', /interview/],
  ['Video / written responses', /\bvideo\b|written response|\bessays?\b/], ['Scholarship mentioned', /scholarship|entrance award/],
  ['Clubs & leadership', /\bclubs?\b|president|\bexec\b|executive|founder|founded|council|captain/],
  ['Volunteering', /volunteer/], ['Robotics', /robotics|\bfrc\b|\bvex\b/], ['DECA / HOSA / FBLA', /\bdeca\b|\bhosa\b|\bfbla\b/],
  ['Math & CS contests', /euclid|\bcsmc\b|\bccc\b|\bcemc\b|olympiad|math contest/], ['Coding & hackathons', /hackathon|coding|programming/],
  ['Research', /research/], ['Job or internship', /\bjob\b|internship|part[- ]time|work experience/],
  ['Sports', /\bsports?\b|varsity|volleyball|badminton|basketball|soccer|hockey/], ['Music & arts', /\bmusic\b|piano|\bband\b|violin|\bart\b/],
  ['Tutoring', /tutor/], ['IB / AP student', /\bib\b|\bap\b/],
];
const TRIVIAL = /^(none|n\/?a|nope|no|-+|\.|nothing|null|nah)\.?$/i;
function notesFor(snap, r) {
  const s = snap.reportSources?.[r.source] || {};
  const parts = [s.applicantComments, String(s.supplementalContext || '').replace(/^Supplemental application:\s*/i, ''), s.applicationDetails?.supplementalApplication]
    .map(x => String(x || '').trim()).filter(x => x && !TRIVIAL.test(x));
  return parts;
}

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

// Year-over-year median offer average, as an inline SVG line chart.
function trendChart(years) {
  const pts = years.filter(y => y.numeric >= 3).sort((a, b) => a.year - b.year);
  if (pts.length < 2) return '';
  const W = 640, H = 200, L = 46, R = 18, T = 18, B = 34;
  const vals = pts.flatMap(p => [p.median, p.p25 ?? p.median, p.p75 ?? p.median]);
  let lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1); if (hi - lo < 4) { lo -= 2; hi += 2; } hi = Math.min(100, hi);
  const x = i => L + (pts.length === 1 ? 0 : i * (W - L - R) / (pts.length - 1)), y = v => T + (hi - v) * (H - T - B) / (hi - lo);
  const ticks = [lo, (lo + hi) / 2, hi].map(v => Math.round(v * 2) / 2);
  const band = pts.every(p => p.p25 !== null && p.numeric >= 4)
    ? `<path class="tr-band" d="M${pts.map((p, i) => `${x(i)},${y(p.p75)}`).join(' L')} L${pts.map((p, i) => `${x(i)},${y(p.p25)}`).reverse().join(' L')} Z"/>` : '';
  const first = pts[0].median, last = pts[pts.length - 1].median, delta = last - first;
  return `<section><h2>Is it getting more competitive?</h2><div class="pg-card"><svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Median reported offer average by entry year: ${pts.map(p => `Fall ${p.year} ${pct(p.median)}`).join(', ')}">
${ticks.map(t => `<line class="tr-grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tr-tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}%</text>`).join('')}
${band}<polyline class="tr-line" points="${pts.map((p, i) => `${x(i)},${y(p.median)}`).join(' ')}"/>
${pts.map((p, i) => `<circle class="tr-dot" cx="${x(i)}" cy="${y(p.median)}" r="5"/><text class="tr-val" x="${x(i)}" y="${y(p.median) - 11}" text-anchor="middle">${pct(p.median)}</text><text class="tr-year" x="${x(i)}" y="${H - 10}" text-anchor="middle">Fall ${p.year}</text>`).join('')}
</svg><p class="pg-note">Median reported offer average per entry year${band ? '; the shaded band is the middle half of reported offers' : ''}. Fall ${pts[0].year} → Fall ${pts[pts.length - 1].year}: <strong>${delta >= 0 ? '+' : ''}${delta.toFixed(1)} points</strong>. Small samples move a lot, so treat this as a rough signal.</p></div></section>`;
}

function insights(snap, rs) {
  const withNotes = rs.map(r => [r, notesFor(snap, r)]).filter(([, n]) => n.length);
  if (withNotes.length < 3) return '';
  const counts = THEMES.map(([label, re]) => [label, withNotes.filter(([, n]) => re.test(n.join(' ').toLowerCase())).length]).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = Math.max(1, ...counts.map(c => c[1]));
  const quotes = withNotes.filter(([r]) => r.outcome === 'Offer').sort((a, b) => b[0].year - a[0].year || String(b[0].decisionDate || '').localeCompare(a[0].decisionDate || ''))
    .map(([r, n]) => [r, n.sort((a, b) => b.length - a.length)[0]]).filter(([, t]) => t.length >= 25).slice(0, 3);
  return `<section><h2>What applicants mentioned</h2><div class="pg-card"><p class="pg-lead">${withNotes.length} of ${rs.length} reports include comments or supplemental-application notes. Most common themes:</p>
${counts.length ? `<div class="pg-bars plain">${counts.map(([l, c]) => `<div class="pg-bar wide"><span>${esc(l)}</span><span class="pg-track"><i class="blue" style="width:${(c / max * 100).toFixed(1)}%"></i></span><b>${c}</b></div>`).join('')}</div>` : ''}
${quotes.length ? `<div class="pg-quotes">${quotes.map(([r, t]) => `<blockquote><p>“${esc(t.length > 180 ? t.slice(0, 177).trimEnd() + '…' : t)}”</p><cite>Fall ${r.year} · ${esc(avgLabel(r))} · Offer</cite></blockquote>`).join('')}</div>` : ''}
<p class="pg-note">Counts are of reports mentioning each theme, matched by keyword, so they're approximate. Mentions don't show what caused an offer.</p></div></section>`;
}

const themeScript = `<script>(function(){try{var t=JSON.parse(localStorage.getItem('offeratlas.theme')||'"light"');var d=t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();</script>`;
const head = ({ title, desc, url, site, feed }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${themeScript}
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Offer Atlas"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${site}/og-image.jpg"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#162840"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/programs/page.css">${feed ? `<link rel="alternate" type="application/atom+xml" title="${esc(feed.title)}" href="${feed.href}">` : ''}</head><body>`;
const topbar = `<header class="pg-top"><a class="pg-brand" href="/"><span class="pg-icon" aria-hidden="true">↗</span>OFFER ATLAS</a><nav aria-label="Main"><a href="/#explorer">Explore</a><a href="/#compare">Compare my average</a><a href="/#tracker">Offer tracker</a><a href="/programs/">Programs</a><a href="/schools/">Schools</a><a href="/#guides">Guides</a><a href="/#search" class="pg-search-link">⌕ Search</a><a class="pg-submit" href="${FORM}" ${ext}>Submit your result ↗</a></nav></header>`;
const footer = `<footer class="pg-foot"><p><strong>Self-reported, unverifiable data.</strong> Reports come from public, applicant-submitted spreadsheets and Reddit posts. They are not unique applicants, not a random sample, and medians are not cutoffs. Not affiliated with any university.</p><p><a href="/#sources">Sources &amp; credits</a> · <a href="/guides/">Guides</a> · <a href="/changelog/">Changelog</a> · <a href="/feeds/latest.xml">RSS</a> · <a href="${FORM}" ${ext}>Submit your result ↗</a> · <a href="${ISSUES}" ${ext}>Report a correction ↗</a></p></footer></body></html>`;
const disclaimer = `<p class="pg-disclaimer"><strong>Self-reported and unverifiable.</strong> Every result here was submitted anonymously by an applicant and has not been checked. Averages may be rounded, mistyped or false, and posters aren’t a random sample. Use this as rough context, not a cutoff or prediction. Data from the r/OntarioGrade12s spreadsheets by <a href="${CREATOR_URL}" ${ext}>u/${CREATOR}</a>.</p>`;

function programPage({ p, rs, slug, s, site, snap, schoolSlug, similar }) {
  const name = p.displayName || p.name, url = `${site}/programs/${slug}/`;
  const explore = `/?p=${encodeURIComponent(p.id)}`;
  const ly = s.latestYear;
  const desc = `${name} at ${p.university}: ${rs.length} self-reported admission results, ${s.offers} offers` +
    (ly ? `, median reported offer average ${pct(ly.median)} for Fall ${ly.year}` : '') + '. See averages, offer dates, trends and every source.';
  const title = `${name} — ${p.university} admission averages & offer dates | Offer Atlas`;
  const maxM = Math.max(1, ...s.months.map(m => m[1])), maxB = Math.max(1, ...s.buckets.map(b => b.offers + b.other));
  const latest = [...rs].sort((a, b) => b.year - a.year || String(b.decisionDate || '').localeCompare(a.decisionDate || '')).slice(0, 20);
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Schools', item: `${site}/schools/` },
    { '@type': 'ListItem', position: 2, name: p.university, item: `${site}/schools/${schoolSlug}/` },
    { '@type': 'ListItem', position: 3, name, item: url }] };
  return head({ title, desc, url, site, feed: { title: `New reports: ${name} (${p.university})`, href: `/feeds/${slug}.xml` } }) + topbar + `<main class="pg">
<p class="pg-crumbs"><a href="/schools/">Schools</a> › <a href="/schools/${schoolSlug}/">${esc(p.university)}</a></p>
<h1>${esc(name)}</h1><p class="pg-sub">${esc(p.university)} · self-reported admission results</p>
${disclaimer}
<div class="pg-stats">
 <div><span>Reports</span><strong>${rs.length}</strong></div>
 <div><span>Offers</span><strong>${s.offers}</strong></div>
 <div><span>Median offer average${ly ? ` · Fall ${ly.year}` : ''}</span><strong>${ly ? pct(ly.median) : '—'}</strong></div>
 <div><span>Median offer average · all years</span><strong>${pct(s.median)}</strong></div>
</div>
<div class="pg-cta"><a class="pg-btn" href="${explore}">Explore every receipt →</a><a class="pg-btn ghost" href="/?cp=${encodeURIComponent(p.id)}#compare">Compare my average</a><a class="pg-btn ghost" href="/?share=${encodeURIComponent(p.id)}">Share as image</a><a class="pg-btn ghost" href="${FORM}" ${ext}>Add your result ↗</a><a class="pg-btn ghost" href="/feeds/${slug}.xml" title="Atom/RSS feed of new reports for this program">Follow (RSS)</a></div>
<section><h2>By entry year</h2><div class="pg-scroll"><table><thead><tr><th>Entry</th><th>Reports</th><th>Offers</th><th>Median offer avg</th><th>Middle half of offers</th><th>Earliest offer</th></tr></thead><tbody>
${s.years.map(y => `<tr><td>Fall ${y.year}</td><td>${y.n}</td><td>${y.offers}</td><td>${y.numeric >= 3 ? pct(y.median) : '—'}</td><td>${y.numeric >= 4 ? pct(y.p25) + ' – ' + pct(y.p75) : '—'}</td><td>${fmtDate(y.first)}</td></tr>`).join('')}
</tbody></table></div><p class="pg-note">Medians need at least 3 numeric offer averages; the middle-half range needs 4.</p></section>
${trendChart(s.years)}
<div class="pg-two">
<section><h2>When offers arrived</h2><div class="pg-bars">${s.months.map(([m, c]) => `<div class="pg-bar"><span>${m.slice(0, 3)}</span><span class="pg-track"><i style="width:${(c / maxM * 100).toFixed(1)}%"></i></span><b>${c || ''}</b></div>`).join('')}</div><p class="pg-note">Offers with a stated decision month, all years. <a href="/#tracker">See this cycle’s offer tracker →</a></p></section>
<section><h2>Averages reported</h2><div class="pg-bars">${s.buckets.map(b => `<div class="pg-bar"><span>${b.label}</span><span class="pg-track"><i style="width:${(b.offers / maxB * 100).toFixed(1)}%"></i><em style="width:${(b.other / maxB * 100).toFixed(1)}%"></em></span><b>${b.offers + b.other || ''}</b></div>`).join('')}</div><p class="pg-note"><i class="k off"></i>Offers <i class="k oth"></i>Other outcomes (rejected, deferred, waitlisted…)</p></section>
</div>
${insights(snap, rs)}
${similar || ''}
<section><h2>Latest reports</h2><div class="pg-scroll"><table><thead><tr><th>Entry</th><th>Average</th><th>Outcome</th><th>Decision</th><th></th></tr></thead><tbody>
${latest.map(r => `<tr><td>Fall ${r.year}</td><td>${esc(avgLabel(r))}</td><td><span class="pg-out ${esc(r.outcome)}">${esc(r.outcome)}</span></td><td>${r.decisionDate ? fmtDate(r.decisionDate) : esc(r.month || 'Unstated')}</td><td><a href="/?p=${encodeURIComponent(p.id)}&amp;r=${encodeURIComponent(r.id)}">Receipt →</a></td></tr>`).join('')}
</tbody></table></div><p class="pg-note">Showing ${latest.length} of ${rs.length}. <a href="${explore}">See all ${rs.length} with filters and charts →</a></p></section>
<p class="pg-official"><a href="/schools/${schoolSlug}/">More programs at ${esc(p.university)} →</a>${p.url ? ` · Official program information: <a href="${esc(p.url)}" ${ext}>${esc(p.university)} ↗</a>` : ''}</p>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</main>` + footer;
}

function schoolPage({ uni, slug, pages, site, cur }) {
  const url = `${site}/schools/${slug}/`, total = pages.reduce((a, x) => a + x.rs.length, 0), offers = pages.reduce((a, x) => a + x.s.offers, 0);
  const title = `${uni} admission averages by program | Offer Atlas`;
  const desc = `Self-reported admission averages and offer dates for ${pages.length} ${uni} programs, from ${total.toLocaleString('en-CA')} public applicant reports.`;
  const rows = [...pages].sort((a, b) => b.rs.length - a.rs.length);
  const firstThis = x => { const d = x.rs.filter(r => r.year === cur && r.outcome === 'Offer' && r.decisionDate).map(r => r.decisionDate).sort()[0]; return d ? fmtDate(d) : '—'; };
  return head({ title, desc, url, site }) + topbar + `<main class="pg">
<p class="pg-crumbs"><a href="/schools/">Schools</a> › ${esc(uni)}</p>
<h1>${esc(uni)}</h1><p class="pg-sub">${pages.length} programs · ${total.toLocaleString('en-CA')} self-reported results · ${offers.toLocaleString('en-CA')} offers</p>
${disclaimer}
<div class="pg-cta"><a class="pg-btn" href="/?u=${encodeURIComponent(uni)}&amp;y=All">Explore all ${esc(uni)} receipts →</a><a class="pg-btn ghost" href="/#tracker">Offer tracker</a></div>
<section><h2>Programs</h2><div class="pg-scroll"><table class="pg-sortable"><thead><tr><th>Program</th><th>Reports</th><th>Offers</th><th>Latest median offer</th><th>First offer · Fall ${cur}</th></tr></thead><tbody>
${rows.map(x => `<tr><td><a href="/programs/${x.slug}/"><strong>${esc(x.p.displayName || x.p.name)}</strong></a></td><td>${x.rs.length}</td><td>${x.s.offers}</td><td>${x.s.latestYear ? `${pct(x.s.latestYear.median)} <small>(Fall ${x.s.latestYear.year})</small>` : '—'}</td><td>${firstThis(x)}</td></tr>`).join('')}
</tbody></table></div><p class="pg-note">Programs with at least ${MIN_REPORTS} reports. Medians need at least 3 numeric offer averages.</p></section>
</main>` + footer;
}

function schoolsIndex({ schools, site }) {
  const title = 'Canadian universities — admission averages by school | Offer Atlas';
  const desc = `Self-reported admission averages and offer dates for ${schools.length} Canadian universities and colleges.`;
  return head({ title, desc, url: `${site}/schools/`, site }) + topbar + `<main class="pg">
<h1>Schools</h1><p class="pg-sub">${schools.length} Canadian universities and colleges with program pages. Updated daily.</p>${disclaimer}
<input id="pg-search" class="pg-search" type="search" placeholder="Search a school…" aria-label="Search schools">
<ul class="pg-grid">${schools.map(s => `<li><a href="/schools/${s.slug}/">${esc(s.uni)}</a><span>${s.pages.length} programs · ${s.pages.reduce((a, x) => a + x.rs.length, 0).toLocaleString('en-CA')} reports</span></li>`).join('')}</ul>
<script>document.getElementById('pg-search').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();for(const li of document.querySelectorAll('.pg-grid li'))li.hidden=!!q&&!li.textContent.toLowerCase().includes(q);});</script>
</main>` + footer;
}

function indexPage({ pages, site, total, schoolSlug }) {
  const byUni = new Map();
  for (const pg of pages) { if (!byUni.has(pg.p.university)) byUni.set(pg.p.university, []); byUni.get(pg.p.university).push(pg); }
  const unis = [...byUni.keys()].sort((a, b) => a.localeCompare(b));
  const title = 'All programs — Canadian university admission averages | Offer Atlas';
  const desc = `Self-reported admission averages and offer dates for ${pages.length} Canadian university programs, from ${total.toLocaleString('en-CA')} public applicant reports.`;
  return head({ title, desc, url: `${site}/programs/`, site }) + topbar + `<main class="pg">
<h1>Every program, its reported outcomes</h1>${disclaimer}<p class="pg-sub">${pages.length} programs with at least ${MIN_REPORTS} self-reported results. Updated daily.</p>
<input id="pg-search" class="pg-search" type="search" placeholder="Search a program or school…" aria-label="Search programs">
${unis.map(u => `<section class="pg-uni" id="${esc(slugify(u))}"><h2><a href="/schools/${schoolSlug.get(u)}/">${esc(u)}</a></h2><ul class="pg-grid">${byUni.get(u).sort((a, b) => (a.p.displayName || a.p.name).localeCompare(b.p.displayName || b.p.name)).map(pg =>
    `<li><a href="/programs/${pg.slug}/">${esc(pg.p.displayName || pg.p.name)}</a><span>${pg.rs.length} reports${pg.s.latestYear ? ` · median offer ${pct(pg.s.latestYear.median)} (Fall ${pg.s.latestYear.year})` : ''}</span></li>`).join('')}</ul></section>`).join('')}
<script>document.getElementById('pg-search').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();for(const s of document.querySelectorAll('.pg-uni')){let any=false;const uni=s.querySelector('h2').textContent.toLowerCase();for(const li of s.querySelectorAll('li')){const show=!q||uni.includes(q)||li.textContent.toLowerCase().includes(q);li.hidden=!show;any=any||show;}s.hidden=!any;}});</script>
</main>` + footer;
}

const CSS = `:root{--ink:#162840;--muted:#536477;--paper:#f5f4ef;--card:#fff;--line:#d9dede;--lime:#d6f46a;--blue:#375af4;--green:#247458;--red:#b13c4d;--soft:#c5ccd6;font:17px Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper)}
html[data-theme=dark]{--ink:#e7edf5;--muted:#9fb0c6;--paper:#0d1726;--card:#15233a;--line:#2a3d5a;--blue:#7f9bff;--green:#3fbf8a;--red:#ff7d92;--soft:#4b5d78;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--paper)}a{color:inherit;text-underline-offset:4px}
.pg-top{max-width:1100px;margin:auto;padding:18px 16px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.pg-brand{font-weight:850;letter-spacing:-.3px;text-decoration:none;display:flex;align-items:center;gap:10px}.pg-icon{background:#162840;color:var(--lime);width:34px;height:34px;border-radius:10px;display:grid;place-items:center}
.pg-top nav{display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:15px;font-weight:650}.pg-top nav a{text-decoration:none}.pg-top nav a:hover{text-decoration:underline}.pg-search-link{border:1px solid var(--line);border-radius:20px;padding:6px 12px;background:var(--card)}.pg-submit{background:var(--lime);color:#162840;padding:8px 14px;border-radius:30px;text-decoration:none}
.pg{max-width:1100px;margin:auto;padding:22px 16px 40px}.pg-crumbs{font-size:14px;color:var(--muted);margin:0 0 10px}
.pg h1{font-size:clamp(30px,5vw,46px);letter-spacing:-1.5px;line-height:1.08;margin:0}.pg-sub{color:var(--muted);margin:8px 0 22px}
.pg-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.pg-stats div{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.pg-stats span{display:block;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted)}.pg-stats strong{font-size:28px;letter-spacing:-.8px}
.pg-cta{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 8px}.pg-btn{background:#162840;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px}.pg-btn.ghost{background:var(--card);color:var(--ink);border:1px solid var(--line)}
html[data-theme=dark] .pg-btn:not(.ghost){background:var(--lime);color:#162840}
.pg section{margin-top:28px}.pg h2{font-size:21px;margin:0 0 12px}.pg-two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.pg-scroll{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:14px}table{width:100%;border-collapse:collapse;font-size:15px;min-width:520px}th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line)}th{font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)}tr:last-child td{border-bottom:0}td small{color:var(--muted)}
.pg-note{font-size:13px;color:var(--muted);margin:8px 0 0}.pg-bars{display:grid;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}.pg-bars.plain{background:none;border:0;padding:0}
.pg-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}.pg-lead{margin:0 0 12px;font-size:15px}
.pg-bar{display:grid;grid-template-columns:72px 1fr 34px;align-items:center;gap:8px;font-size:13px}.pg-bar.wide{grid-template-columns:minmax(120px,190px) 1fr 34px}.pg-bar>span:first-child{color:var(--muted)}.pg-track{display:flex;gap:2px;height:12px}.pg-track i,.pg-track em{display:block;height:12px;border-radius:6px;background:var(--green)}.pg-track i.blue{background:var(--blue)}.pg-track em{background:var(--soft)}.pg-bar>b{font-weight:650;text-align:right}
.k{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 4px 0 10px;vertical-align:middle}.k.off{background:var(--green);margin-left:0}.k.oth{background:var(--soft)}
.trend{width:100%;height:auto;display:block}.tr-grid{stroke:var(--line);stroke-width:1}.tr-tick,.tr-year{fill:var(--muted);font-size:12px}.tr-val{fill:var(--ink);font-size:13px;font-weight:700}.tr-line{fill:none;stroke:var(--blue);stroke-width:3;stroke-linejoin:round}.tr-dot{fill:var(--card);stroke:var(--blue);stroke-width:3}.tr-band{fill:var(--blue);opacity:.12}
.pg-quotes{display:grid;gap:10px;margin-top:14px}.pg-quotes blockquote{margin:0;border-left:4px solid var(--blue);background:color-mix(in srgb,var(--blue) 8%,var(--card));border-radius:0 12px 12px 0;padding:10px 14px}.pg-quotes p{margin:0;font-size:15px;line-height:1.5}.pg-quotes cite{display:block;margin-top:4px;font-size:12px;font-style:normal;color:var(--muted)}
.pg-out{font-size:12px;font-weight:700;padding:3px 9px;border-radius:20px;background:#edf1fb;color:#2846a2}.pg-out.Offer{background:#e3f2ea;color:#21654a}.pg-out.Rejected{background:#fae8ec;color:#9d3447}.pg-out.Deferred{background:#fff1dd;color:#8d5b19}
html[data-theme=dark] .pg-out{background:#1b2a4a;color:#a9bcff}html[data-theme=dark] .pg-out.Offer{background:#163a2c;color:#6fdcaa}html[data-theme=dark] .pg-out.Rejected{background:#3d1820;color:#ff8fa1}html[data-theme=dark] .pg-out.Deferred{background:#3d2c10;color:#f0b45c}
.pg-disclaimer{background:#fff6e5;border:1px solid #f0d9a8;border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.55;margin:0 0 20px;color:#5c4210}.pg-disclaimer a{font-weight:700}
html[data-theme=dark] .pg-disclaimer{background:#2e2410;border-color:#5a4720;color:#f2d49a}
.pg-official{font-size:14px;color:var(--muted);margin-top:24px}.pg-search{width:100%;font:inherit;color:var(--ink);padding:12px 14px;border:1px solid var(--line);border-radius:12px;margin:4px 0 10px;background:var(--card)}
.pg-uni h2{font-size:19px;margin:22px 0 8px}.pg-uni h2 a{text-decoration:none}.pg-uni h2 a:hover{text-decoration:underline}.pg-grid{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:6px}
.pg-grid li{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}.pg-grid li a{font-weight:700;text-decoration:none}.pg-grid li a:hover{text-decoration:underline}.pg-grid li span{font-size:13px;color:var(--muted)}
.pg-h3{font-size:15px;margin:0 0 8px;color:var(--muted)}.pg-grid.one{grid-template-columns:1fr}
.pg-toc{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px}.pg-toc a{font-size:14px;font-weight:650;text-decoration:none;border:1px solid var(--line);background:var(--card);border-radius:20px;padding:6px 12px}.pg-toc a:hover{border-color:var(--ink)}
.guide{margin-top:14px;scroll-margin-top:16px}.guide h2{margin-bottom:8px}.guide p{font-size:16px;line-height:1.7;margin:0 0 10px}
.log{margin-top:12px}.log h2{font-size:18px;margin:0 0 8px}.log ul{margin:6px 0 0;padding-left:20px}.log li{font-size:15px;line-height:1.6}.log-data{margin:0;font-size:15px}
.pg-foot{max-width:1100px;margin:auto;padding:24px 16px 40px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
@media(max-width:760px){.pg-two{grid-template-columns:1fr}.pg-stats strong{font-size:24px}.pg-bar.wide{grid-template-columns:120px 1fr 30px}.pg-top nav{gap:10px;font-size:14px}}`;


const fold = t => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
function similarHtml(pg, pages) {
  const me = pg.s.latestYear?.median, key = fold(pg.p.displayName || pg.p.name);
  const li = x => `<li><a href="/programs/${x.slug}/">${esc(x.p.displayName || x.p.name)}</a><span>${esc(x.p.university)}${x.s.latestYear ? ` · median offer ${pct(x.s.latestYear.median)} (Fall ${x.s.latestYear.year})` : ''} · ${x.rs.length} reports</span></li>`;
  const diff = x => (me === undefined || !x.s.latestYear) ? 99 : Math.abs(x.s.latestYear.median - me);
  const same = pages.filter(x => x !== pg && x.p.university !== pg.p.university && fold(x.p.displayName || x.p.name) === key)
    .sort((a, b) => diff(a) - diff(b) || b.rs.length - a.rs.length).slice(0, 6);
  const near = me === undefined ? [] : pages.filter(x => x !== pg && !same.includes(x) && x.s.latestYear && Math.abs(x.s.latestYear.median - me) <= 1)
    .sort((a, b) => (a.p.university === pg.p.university ? -1 : 0) - (b.p.university === pg.p.university ? -1 : 0) || diff(a) - diff(b) || b.rs.length - a.rs.length).slice(0, 6);
  if (!same.length && !near.length) return '';
  return `<section><h2>Similar programs</h2><div class="pg-two">
${same.length ? `<div><h3 class="pg-h3">${esc(pg.p.displayName || pg.p.name)} at other schools</h3><ul class="pg-grid one">${same.map(li).join('')}</ul></div>` : ''}
${near.length ? `<div><h3 class="pg-h3">Similar reported offer averages${me !== undefined ? ` (within 1 point of ${pct(me)})` : ''}</h3><ul class="pg-grid one">${near.map(li).join('')}</ul></div>` : ''}
</div><p class="pg-note">Matched by program name and by median reported offer average only. Programs can differ a lot in content, supplementary requirements and competitiveness.</p></section>`;
}

const xmlEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function feedXml({ title, selfUrl, pageUrl, items, site, updated }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${xmlEsc(title)}</title>
<subtitle>Self-reported, unverified admission results. Data: r/OntarioGrade12s spreadsheets by u/${CREATOR}.</subtitle>
<link rel="self" href="${xmlEsc(selfUrl)}"/><link rel="alternate" href="${xmlEsc(pageUrl)}"/>
<id>${xmlEsc(selfUrl)}</id><updated>${updated}T12:00:00Z</updated>
${items.map(({ r, when, program, uni, pid }) => `<entry><title>${xmlEsc(`${r.outcome} · ${avgLabel(r)} · ${program} (${uni}) · Fall ${r.year}`)}</title>
<id>tag:offeratlas.github.io,2026:report:${xmlEsc(r.id)}</id><updated>${when}T12:00:00Z</updated>
<link href="${xmlEsc(`${site}/?p=${encodeURIComponent(pid)}&r=${encodeURIComponent(r.id)}`)}"/>
<summary>${xmlEsc(`${r.outcome} for ${program} at ${uni}, Fall ${r.year}. Reported average ${avgLabel(r)}. Decision ${r.decisionDate ? fmtDate(r.decisionDate) : (r.month || 'date unstated')}. Self-reported and unverified.`)}</summary></entry>`).join('\n')}
</feed>
`;
}

function guidesPage({ site }) {
  const url = `${site}/guides/`;
  const sec = (id, h, body) => `<section id="${id}" class="pg-card guide"><h2>${h}</h2>${body}</section>`;
  return head({ title: 'Ontario university admissions guide: Top 6, OUAC, AIF, Kira, Casper | Offer Atlas', desc: 'Plain-language explanations of Ontario university admissions: Top 6 averages, OUAC 101 vs 105, offer timelines, conditional offers, AIF, Kira, Casper and supplementary applications.', url, site }) + topbar + `<main class="pg">
<h1>Admissions, explained simply</h1><p class="pg-sub">A plain-language glossary for Ontario applicants. Rules differ by university and program, so always confirm on the official pages linked below.</p>
<nav class="pg-toc">${[['top6', 'Top 6 average'], ['groups', 'OUAC 101 vs 105'], ['timeline', 'When offers come out'], ['conditional', 'Conditional offers'], ['outcomes', 'Deferred, waitlisted, alternate'], ['aif', 'AIF'], ['kira', 'Kira'], ['casper', 'Casper'], ['supp', 'Supplementary applications'], ['ib', 'IB & AP'], ['reading', 'Reading this site']].map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</nav>
${sec('top6', 'Top 6 average', `<p>Most Ontario universities calculate your admission average from your <strong>six best Grade 12 U or M courses</strong>, and the program’s required courses (prerequisites) must be among them. For example, a program might require English (ENG4U), Advanced Functions (MHF4U) and Calculus (MCV4U), then add your three best remaining 4U/4M courses.</p><p>Early in the year, universities often use your <strong>Grade 11 final marks and Grade 12 midterm or first-semester marks</strong> instead, which is why early offers can arrive before you have final grades. Some programs adjust averages (for example, Waterloo applies an adjustment factor to some programs). Each program page states exactly what it uses.</p>`)}
${sec('groups', 'OUAC 101 vs 105 (Group A vs Group B)', `<p>The Ontario Universities’ Application Centre (OUAC) has two main undergraduate applications. <strong>OUAC 101</strong> (Group A) is for students currently attending an Ontario high school. <strong>OUAC 105</strong> (Group B) is for everyone else, such as students from other provinces, international students and people who already graduated.</p><p>On this site, “Group A” and “Group B” labels come straight from applicants’ submissions. See <a href="https://www.ouac.on.ca/" ${ext}>ouac.on.ca ↗</a> for the official definitions.</p>`)}
${sec('timeline', 'When offers come out', `<p>Universities send offers on a rolling basis. <strong>Early offers</strong> can start in the fall for strong applicants, while many programs make most decisions between <strong>February and May</strong>. Applications submitted by each university’s “equal consideration” date (often in January) are considered equally.</p><p>Use the <a href="/#tracker">Offer tracker</a> to see what applicants reported this cycle compared with last year. For official dates, check <a href="https://www.ouac.on.ca/" ${ext}>OUAC ↗</a> and each university’s admissions site.</p>`)}
${sec('conditional', 'Conditional offers', `<p>Most offers are <strong>conditional</strong>: you must finish your courses and usually keep a minimum final average (sometimes in specific courses too). Your offer letter and the university’s applicant portal list the exact conditions. Falling below them can lead to an offer being rescinded, so read the letter carefully.</p>`)}
${sec('outcomes', 'Deferred, waitlisted and alternate offers', `<p><strong>Deferred</strong> means the university hasn’t decided yet and will review you again later, often with newer marks. <strong>Waitlisted</strong> means you may get an offer if space opens. An <strong>alternate offer</strong> is an offer to a different program than the one you applied to. On this site these stay separate from offers and rejections.</p>`)}
${sec('aif', 'AIF (Admission Information Form)', `<p>The <strong>AIF</strong> is the University of Waterloo’s form where applicants share information beyond grades, such as activities, achievements and interests. Some Waterloo programs require it and others strongly recommend it. See <a href="https://uwaterloo.ca/future-students/" ${ext}>Waterloo future students ↗</a> for current details.</p>`)}
${sec('kira', 'Kira', `<p><strong>Kira</strong> is an online assessment with timed video and/or written responses that some programs use to learn about applicants’ communication and personal qualities. Programs that use it tell you in their supplementary application instructions.</p>`)}
${sec('casper', 'Casper', `<p><strong>Casper</strong> is an online situational judgment test, where you respond to scenarios, used by some programs (often in health or education) as part of admissions. Check each program’s requirements for whether it is needed.</p>`)}
${sec('supp', 'Supplementary applications', `<p>Many competitive programs ask for a <strong>supplementary application</strong>: extra questions, essays, videos, interviews or portfolios. These often have their own deadlines, earlier than you might expect, and can matter a lot alongside your average. The “What applicants mentioned” section on each <a href="/programs/">program page</a> shows what people reported.</p>`)}
${sec('ib', 'IB and AP students', `<p>Universities convert IB and AP results in their own ways (for example using predicted IB scores for early offers). Averages reported here as “42/45 IB” are kept as written and aren’t converted into percentages, so they don’t appear on percentage charts. Check each university’s IB/AP admission page.</p>`)}
${sec('reading', 'Reading this site', `<p>Everything on Offer Atlas is <strong>self-reported and unverified</strong>. A median reported offer average is <strong>not a cutoff</strong>, and people who post aren’t a random sample (people with good news post more often). Use it as context alongside official requirements, not as a prediction.</p>`)}
</main>` + footer;
}

function changelogPage({ site, changes, history }) {
  const days = new Map();
  for (const c of changes) { if (!days.has(c.date)) days.set(c.date, { notes: [], data: null }); days.get(c.date).notes.push(c.text); }
  for (const h of history) { if (!(h.new || h.edited)) continue; if (!days.has(h.date)) days.set(h.date, { notes: [], data: null }); days.get(h.date).data = h; }
  const dates = [...days.keys()].sort().reverse();
  return head({ title: 'Changelog | Offer Atlas', desc: 'What changed on Offer Atlas: new features, fixes and daily data updates.', url: `${site}/changelog/`, site }) + topbar + `<main class="pg">
<h1>Changelog</h1><p class="pg-sub">New features, fixes and daily data updates. Data is refreshed every morning at 8 AM Toronto time.</p>
${dates.map(d => { const x = days.get(d); return `<section class="pg-card log"><h2>${fmtDate(d)}</h2>${x.data ? `<p class="log-data">📈 Data update: <strong>+${x.data.new}</strong> new report${x.data.new === 1 ? '' : 's'}${x.data.edited ? ` · ${x.data.edited} edited` : ''} · ${Number(x.data.total).toLocaleString('en-CA')} total${x.data.programs?.length ? ` · new offers for ${x.data.programs.slice(0, 3).map(k => esc(k.split('|').reverse().join(', '))).join('; ')}` : ''}</p>` : ''}${x.notes.length ? `<ul>${x.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</section>`; }).join('')}
</main>` + footer;
}

export function buildSite({ snap, catalog, site = 'https://offeratlas.github.io', changes = [], history = [] }) {
  const files = {}, byProg = new Map();
  const cur = Math.max(...catalog.reports.map(r => r.year));
  for (const r of catalog.reports) { if (r.isSourceCollection) continue; if (!byProg.has(r.program)) byProg.set(r.program, []); byProg.get(r.program).push(r); }
  const used = new Set(), pages = [];
  const progs = catalog.programs.filter(p => !p.isSourceCollection && (byProg.get(p.id) || []).length >= MIN_REPORTS)
    .sort((a, b) => a.university.localeCompare(b.university) || (a.displayName || a.name).localeCompare(b.displayName || b.name) || a.id.localeCompare(b.id));
  for (const p of progs) {
    const rs = byProg.get(p.id);
    let slug = slugify(`${p.displayName || p.name} ${p.university}`) || 'program', n = 2;
    while (used.has(slug)) slug = slugify(`${p.displayName || p.name} ${p.university}`) + '-' + n++;
    used.add(slug);
    const lastmod = rs.map(r => snap.reportSources?.[r.source]?.reportDate || r.decisionDate || '').filter(Boolean).sort().pop() || snap.checked;
    pages.push({ p, rs, slug, s: stats(rs), lastmod });
  }
  const schoolSlug = new Map(), schools = [];
  for (const uni of [...new Set(pages.map(x => x.p.university))].sort((a, b) => a.localeCompare(b))) {
    const slug = slugify(uni); schoolSlug.set(uni, slug);
    const ps = pages.filter(x => x.p.university === uni);
    schools.push({ uni, slug, pages: ps, lastmod: ps.map(x => x.lastmod).sort().pop() });
  }
  for (const pg of pages) files[`programs/${pg.slug}/index.html`] = programPage({ ...pg, site, snap, schoolSlug: schoolSlug.get(pg.p.university), similar: similarHtml(pg, pages) });
  // Follow feeds: one per program page plus a site-wide feed of the newest current-cycle reports.
  const whenOf = r => snap.reportSources?.[r.source]?.reportDate || r.decisionDate || snap.checked;
  for (const pg of pages) {
    const items = [...pg.rs].sort((a, b) => whenOf(b).localeCompare(whenOf(a))).slice(0, 30).map(r => ({ r, when: whenOf(r), program: pg.p.displayName || pg.p.name, uni: pg.p.university, pid: pg.p.id }));
    files[`feeds/${pg.slug}.xml`] = feedXml({ title: `Offer Atlas: ${pg.p.displayName || pg.p.name} (${pg.p.university})`, selfUrl: `${site}/feeds/${pg.slug}.xml`, pageUrl: `${site}/programs/${pg.slug}/`, items, site, updated: items[0]?.when || snap.checked });
  }
  const latest = catalog.reports.filter(r => r.year === cur).sort((a, b) => whenOf(b).localeCompare(whenOf(a))).slice(0, 60)
    .map(r => ({ r, when: whenOf(r), program: r.isSourceCollection ? (r.submittedProgram || r.programName) : r.programName, uni: r.university, pid: r.program }));
  files['feeds/latest.xml'] = feedXml({ title: `Offer Atlas: latest Fall ${cur} reports`, selfUrl: `${site}/feeds/latest.xml`, pageUrl: `${site}/`, items: latest, site, updated: latest[0]?.when || snap.checked });
  files['guides/index.html'] = guidesPage({ site });
  files['changelog/index.html'] = changelogPage({ site, changes, history });
  // In-site versions: the main site loads these fragments into its Guides and Changelog tabs.
  const inner = h => h.slice(h.indexOf('<main class="pg">') + 17, h.lastIndexOf('</main>'));
  files['guides/fragment.html'] = inner(files['guides/index.html']);
  files['changelog/fragment.html'] = inner(files['changelog/index.html']);
  files['programs/map.json'] = JSON.stringify({ programs: Object.fromEntries(pages.map(x => [x.p.id, x.slug])), schools: Object.fromEntries(schools.map(x => [x.uni, x.slug])), list: pages.map(x => [x.p.id, x.slug, x.p.displayName || x.p.name, x.p.university, x.rs.length]) });
  for (const sc of schools) files[`schools/${sc.slug}/index.html`] = schoolPage({ ...sc, site, cur });
  files['programs/index.html'] = indexPage({ pages, site, total: catalog.reports.length, schoolSlug });
  files['schools/index.html'] = schoolsIndex({ schools, site });
  files['programs/page.css'] = CSS;
  const newest = pages.map(x => x.lastmod).sort().pop() || snap.checked;
  files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [{ loc: `${site}/`, lastmod: newest }, { loc: `${site}/programs/`, lastmod: newest }, { loc: `${site}/schools/`, lastmod: newest }, { loc: `${site}/guides/`, lastmod: '2026-11-17' }, { loc: `${site}/changelog/`, lastmod: newest },
      ...schools.map(x => ({ loc: `${site}/schools/${x.slug}/`, lastmod: x.lastmod })),
      ...pages.map(x => ({ loc: `${site}/programs/${x.slug}/`, lastmod: x.lastmod }))]
      .map(u => `<url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n') + '\n</urlset>\n';
  return files;
}
