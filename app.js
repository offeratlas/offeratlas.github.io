import {layoutDots} from './plot.js?v=oa22';
import {initEntering} from './entering.js?v=oa22';
import {programs,reports,reportSources,officialSources,checked,loadSnapshot,runtimeStatus,guidance,datasets,importAudit,refreshAudit,archiveInfo,loadState,loadArchive,resetReports} from './data.js?v=oa22';
import {months,outcomes,defaultFilters,filterReports,summarize,median,timingCounts,sortedRows,toCsv} from './model.js?v=oa22';
import {buildProgramCatalog,matchesStudyMode} from './catalog.js?v=oa22';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('en-CA');
const date=d=>d?new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Toronto'}).format(new Date(d+'T12:00:00Z')):'Unstated';
const link=(url,label,cls='')=>`<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
const badge=r=>`<span class="outcome-badge ${esc(r.outcome)}">${r.outcome==='Alternate'?'Alternate offer':esc(r.outcome)}</span>`;
let filters={...defaultFilters(),year:'2027'},page=0,catalogLimit=30,pmap=new Map(),rmap=new Map(),trigger,lastRows=[],toastTimer;
let catalogPrograms=[],cardModes=new Map();
function indexData(){resetReports();const view=buildProgramCatalog(programs,reports,reportSources);catalogPrograms=view.programs;reports.length=0;for(const r of view.reports){const d=reportSources[r.source]?.applicationDetails||{};reports.push({...r,...Object.fromEntries(['applicantGroup','province','citizenship','residenceCountry','applicationDate'].map(k=>[k,d[k]||'Unstated']))});}pmap=new Map(catalogPrograms.map(p=>[p.id,p]));rmap=new Map(reports.map(r=>[r.id,r]));}

// ---- Anonymous, cookie-free visit counting (GoatCounter). Counts tab views and button uses only: never averages, filters or anything typed. ----
function gc(path,title,event){let n=0;const go=()=>{const g=window.goatcounter;if(g&&g.count){try{g.count({path,title,event:!!event});}catch{}}else if(++n<20)setTimeout(go,500);};go();}
const gcOnceSeen=new Set(),gcOnce=name=>{if(!gcOnceSeen.has(name)){gcOnceSeen.add(name);gc(name,name,true);}};let gcView='';
document.addEventListener('click',e=>{const t=e.target;if(!t?.closest)return;if(t.closest('.rx-flag'))gc('flag-report','Flag a report',true);else if(t.closest('a[href*="docs.google.com/forms"]'))gc('submit-click','Submit your result',true);},true);
function setView(view,push){if(view==='search'){view='explorer';setTimeout(()=>gsOpen(),50);}if(!['explorer','compare','tracker','catalog','entering','sources','guides','changelog'].includes(view))view='explorer';if(gcView!==view){gcView=view;gc(view==='explorer'?'/':'/#'+view,view.charAt(0).toUpperCase()+view.slice(1));}document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view+'-view');document.querySelectorAll('[data-show]').forEach(el=>el.hidden=!el.dataset.show.split(' ').includes(view));{const d=document.querySelector('aside.disclaimer'),v=document.getElementById(view+'-view'),hd=v?.querySelector('.section-head');if(d){if(view==='explorer')document.getElementById('explorer-view').before(d);else if(hd)hd.after(d);}}document.querySelectorAll('.nav').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});const target=location.pathname+location.search+'#'+view;if(push&&location.hash!=='#'+view)history.pushState({view},'',target);else history.replaceState({view},'',target);if(view==='guides'||view==='changelog')loadFragment(view);if(view==='compare')compareRender();if(view==='tracker'){trackerRender();waitRender();}}
function controls(){const old=filters.university,unis=[...new Set(reports.map(r=>r.university))].sort();$('#university').innerHTML='<option value="All">All Canadian institutions</option>'+unis.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('');$('#university').value=old;for(const key of ['applicantGroup','province','citizenship','residenceCountry']){const options=[...new Set(reports.map(r=>r[key]||'Unstated'))].sort();$('#'+key).innerHTML='<option value="All">All / unstated</option>'+options.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');}$('#month').innerHTML='<option value="All">All months</option>'+months.map(m=>`<option>${m}</option>`).join('');$('#outcome').innerHTML='<option value="All">All outcomes</option>'+outcomes.map(o=>`<option>${o}</option>`).join('');sync();}
function sync(){for(const k of ['university','year','sourceType','studyMode','month','outcome','curriculum','minimum','maximum','query','sort','applicantGroup','province','citizenship','residenceCountry'])$('#'+k).value=filters[k];$('#unquantified').checked=filters.includeUnquantified;syncExtras();}
function picker(){const q=$('#program-search').value.trim().toLowerCase();const ids=new Set(reports.filter(r=>filters.university==='All'||r.university===filters.university).map(r=>r.program));const choices=catalogPrograms.filter(p=>ids.has(p.id)&&(!q||[p.name,p.university,...(p.aliases||[])].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name));const markup=choices.map(p=>`<label class="program-choice"><input type="checkbox" data-program="${p.id}" ${filters.programs.includes(p.id)?'checked':''}><span>${esc(p.name)}<small>${esc(p.university)}</small></span></label>`).join('')||'<p class="fine">No matching program labels.</p>';$('#program-options').innerHTML=markup;$('#expanded-options').innerHTML=markup;$('#expanded-note').textContent=filters.programs.length+' selected';$('#selection-note').textContent=(filters.programs.length?`${filters.programs.length} selected. Clear the selection to include all programs.`:'All programs included.')+` ${fmt(choices.length)} matching programs.`;}
function stats(rows){const s=summarize(rows);$('#stats').innerHTML=[[s.count,'REPORTED OUTCOMES','source records, not applicants'],[s.institutions,'INSTITUTIONS','in this filtered view'],[s.programs,'OFFICIAL PROGRAMS','source collections excluded'],[s.offers,'REPORTED OFFERS','counts, not a success rate']].map(a=>`<div class="stat"><div class="stat-value">${fmt(a[0])}</div><div class="stat-label">${a[1]}</div><div class="stat-detail">${a[2]}</div></div>`).join('');}
let plotMin=80,plotMax=100,plotExpanded=false;
const PHONE=matchMedia('(max-width:760px)'),HIST_H=96;
function binStep(span,width){const raw=span/Math.max(8,Math.floor(width/11));return [0.25,0.5,1,2,2.5,5,10,20,25].find(s=>s>=raw)||50;}
function histogram(pid,p,nums){const span=plotMax-plotMin,width=Math.max(220,(document.querySelector('#average-chart')?.clientWidth||320)-16),step=binStep(span,width),n=Math.ceil(span/step-1e-9),bins=Array.from({length:n},()=>({Offer:0,Rejected:0,Other:0}));
 for(const r of nums){const i=Math.min(n-1,Math.max(0,Math.floor((r.average-plotMin)/step+1e-9)));bins[i][r.outcome==='Offer'?'Offer':r.outcome==='Rejected'?'Rejected':'Other']++;}
 const max=Math.max(1,...bins.map(b=>b.Offer+b.Rejected+b.Other)),w=step/span*100,f=v=>+v.toFixed(2);
 return bins.map((b,i)=>{const t=b.Offer+b.Rejected+b.Other;if(!t)return '';const lo=f(plotMin+i*step),hi=f(Math.min(plotMax,lo+step)),h=v=>(v/max*HIST_H).toFixed(1);
  return `<button class="hist-bar" style="left:${(i*w).toFixed(3)}%;width:${w.toFixed(3)}%" data-inspect-program="${pid}" data-lo="${lo}" data-hi="${hi}" aria-label="${esc(p.name)}: ${t} report${t===1?'':'s'} between ${lo}% and ${hi}% (${b.Offer} offer${b.Offer===1?'':'s'}, ${b.Rejected} rejected, ${b.Other} other)" title="${lo}–${hi}%: ${t} report${t===1?'':'s'} · tap to list"><span class="hb-other" style="height:${h(b.Other)}px"></span><span class="hb-rej" style="height:${h(b.Rejected)}px"></span><span class="hb-offer" style="height:${h(b.Offer)}px"></span></button>`;}).join('');}
function averages(rows){const groups=new Map();for(const r of rows){if(r.isSourceCollection)continue;if(!groups.has(r.program))groups.set(r.program,[]);groups.get(r.program).push(r);}const chosen=[...groups].sort((a,b)=>b[1].length-a[1].length).slice(0,filters.programs.length||8);const span=plotMax-plotMin,pct=x=>(x-plotMin)/span*100;let shown=0,outside=0;
$('#average-chart').innerHTML=`<div class="plot-axis"><div>PROGRAM / SCHOOL</div><div class="axis-scale">${[0,25,50,75,100].map(x=>`<span style="left:${x}%">${(plotMin+span*x/100).toFixed(span<10?1:0)}</span>`).join('')}</div><div>MEDIAN</div></div>`+chosen.map(([pid,rs])=>{const p=pmap.get(pid),all=rs.filter(r=>Number.isFinite(r.average)),nums=all.filter(r=>r.average>=plotMin&&r.average<=plotMax),m=median(rs.filter(r=>r.outcome==='Offer').map(r=>r.average)),layout=layoutDots(nums,plotMin,plotMax);shown+=nums.length;outside+=all.length-nums.length;const useHist=PHONE.matches&&nums.length>24;const trackInner=useHist?histogram(pid,p,nums):layout.points.map(({record:r,x,y})=>`<button class="chart-point ${r.outcome}" data-record="${r.id}" style="left:${x}%;top:${y}px" title="${esc(p.name+' · '+r.averageLabel+'% · '+r.outcome+' · '+r.year)}" aria-label="Open evidence: ${esc(p.name+' '+r.averageLabel+'% '+r.outcome+' '+r.year)}"></button>`).join('');return `<div class="plot-row${useHist?' is-hist':''}"><div><button class="plot-name" data-only-program="${pid}">${esc(p.name)}<small>${esc(p.university)} · ${fmt(rs.length)} outcomes</small></button><button class="plot-inspect" data-inspect-program="${pid}">${useHist?'List all reports ↗':'Expand all dots ↗'}</button><span class="row-tools">${starBtn(pid)}<button class="plot-share" data-share="${pid}">Share</button></span></div><div class="plot-track${useHist?' hist':''}" style="height:${useHist?HIST_H+8:layout.height}px">${useHist?trackInner:layout.points.map(({record:r,x,y})=>`<button class="chart-point ${r.outcome}" data-record="${r.id}" style="left:${x}%;top:${y}px" title="${esc(p.name+' · '+r.averageLabel+'% · '+r.outcome+' · '+r.year)}" aria-label="Open evidence: ${esc(p.name+' '+r.averageLabel+'% '+r.outcome+' '+r.year)}"></button>`).join('')}${m===null||m<plotMin||m>plotMax?'':`<span class="median-line" style="left:${pct(m)}%;height:100%"></span>`}<div class="track-axis" aria-hidden="true"><span>${plotMin}</span><span>${Math.round((plotMin+plotMax)/2)}</span><span>${plotMax}</span></div></div><div class="program-stat">${m===null?'—':m.toFixed(1)+'%'}<small>offer median</small></div></div>`;}).join('')+(chosen.length?'':'<p class="panel-note">No matching reports.</p>');$('#plot-note').textContent=`${fmt(shown)} individually selectable dots; ${fmt(outside)} numeric reports outside the zoom window. No per-program dot cap. Use Full range to include outliers. Vertical stacking separates nearby values; only the horizontal position represents the average. Medians use all filtered numeric offers.`;}
function inspectProgram(id,lo,hi){const p=pmap.get(id),ranged=lo!==undefined&&hi!==undefined,a=+lo,b=+hi,rs=lastRows.filter(r=>r.program===id&&Number.isFinite(r.average)&&(!ranged||(r.average>=a&&(r.average<b||(b>=plotMax&&r.average<=b)))));$('#dot-title').textContent=p.name+(ranged?` · ${a}–${b}%`:' · every numeric report');$('#dot-list').innerHTML=rs.sort((a,b)=>b.average-a.average).map(r=>`<button data-record="${r.id}" class="dot-detail"><i class="legend-dot ${r.outcome}"></i><strong>${esc(r.averageLabel)}%</strong><span>${esc(r.outcome)} · Fall ${r.year}</span><small>${esc(decision(r))}</small></button>`).join('');$('#dot-count').textContent=fmt(rs.length)+' reports. Every button opens its source and applicant context.';$('#dot-dialog').showModal();}
function timing(){const c=timingCounts(filterReports(filters,true)),max=Math.max(1,...Object.values(c));$('#timing-chart').innerHTML=months.map(m=>`<button class="month-bar" data-month="${m}" aria-pressed="${filters.month===m}" title="${m}: ${fmt(c[m])} outcomes"><span class="bar-count">${c[m]}</span><span class="bar-fill" style="height:${c[m]?Math.max(3,c[m]/max*90):2}px"></span><span class="bar-name">${m==='Unknown'?'?':m.slice(0,3)}</span></button>`).join('');}
function outcomeChart(){const rows=filterReports({...filters,outcome:'All'}),c=Object.fromEntries(outcomes.map(o=>[o,0]));for(const r of rows)c[r.outcome]++;const max=Math.max(1,...Object.values(c));$('#outcomes-chart').innerHTML=outcomes.map(o=>`<button class="outcome-row" data-outcome="${o}" aria-pressed="${filters.outcome===o}"><span>${o==='Alternate'?'Alternate offer':o}</span><span class="outcome-track"><span class="outcome-fill" style="width:${c[o]/max*100}%;background:${o==='Offer'?'var(--green)':o==='Rejected'?'var(--red)':'var(--blue)'}"></span></span><b>${fmt(c[o])}</b></button>`).join('');}
function decision(r){return r.decisionDate?date(r.decisionDate):r.month==='Unknown'?'Unstated':r.month+' · day/year uncertain';}
function table(){const sorted=sortedRows(lastRows,filters.sort),pages=Math.max(1,Math.ceil(sorted.length/40));page=Math.min(page,pages-1);$('#report-rows').innerHTML=sorted.slice(page*40,page*40+40).map(r=>`<tr><td><div class="school-name">${esc(r.university)}</div><div class="program-name">${esc(r.programName)}</div>${r.isSourceCollection?`<small>Submitted: ${esc(r.submittedProgram)}</small>`:''}<small>Fall ${r.year} · ${r.sourceType}${r.homeInstitution==='Laurier'?' · Laurier home':''} · ${esc(r.studyMode==='Unstated'?'Study option unstated':r.studyMode)}</small></td><td><span class="average-number">${esc(r.averageLabel)}${r.average!==null?'%':''}</span>${r.average===null?'<small>Not a numeric percentage</small>':''}</td><td>${badge(r)}</td><td>${esc(decision(r))}<small>${esc(r.curriculum)}</small></td><td><button class="evidence-button" data-record="${r.id}">View details ↗</button>${reportSources[r.source]?.applicantComments?'<small>Applicant comment available</small>':''}</td></tr>`).join('');$('#table-footer').innerHTML=`<span>${fmt(sorted.length)} source outcomes · page ${page+1} of ${pages}</span><span class="pagination"><button data-page="prev" ${page?'':'disabled'}>← Previous</button><button data-page="next" ${page+1<pages?'':'disabled'}>Next →</button></span>`;$('#empty').hidden=!!sorted.length;$('#export').disabled=!sorted.length;}
function render(){page=0;lastRows=filterReports(filters);stats(lastRows);averages(lastRows);timing();outcomeChart();table();afterRender();}
function catalog(){const q=$('#catalog-query').value.trim().toLowerCase(),counts=new Map();for(const r of reports){if(!counts.has(r.program))counts.set(r.program,[]);counts.get(r.program).push(r);}const ps=catalogPrograms.filter(p=>!p.isSourceCollection&&counts.has(p.id)&&(!q||[p.displayName||p.name,p.university,...(p.aliases||[])].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.university.localeCompare(b.university)||(a.displayName||a.name).localeCompare(b.displayName||b.name));$('#catalog-count').textContent=`${fmt(ps.length)} officially named programs with reported outcomes. Every retained Canadian report remains available in Explore, including source records without a single program assignment.`;$('#catalog-cards').innerHTML=ps.slice(0,catalogLimit).map(p=>{const all=counts.get(p.id),mode=cardModes.get(p.id)||'Both',rs=all.filter(r=>matchesStudyMode(r,mode)),offers=rs.filter(r=>r.outcome==='Offer'),m=median(offers.map(r=>r.average)),years=[...new Set(rs.map(r=>r.year))].sort();return `<article class="program-card"><span class="uni">${esc(p.university)}</span><h3>${esc(p.displayName||p.name)}</h3>${p.admissionNote?`<p class="evidence-caveat">${esc(p.admissionNote)}</p>`:''}<label class="card-mode">Study option<select data-program-mode="${p.id}" aria-label="Study option for ${esc(p.name)}">${['Both','Co-op','Non-co-op','Unstated'].map(x=>`<option ${x===mode?'selected':''}>${x}</option>`).join('')}</select></label><p class="fine">Both includes unstated options. Source labels determine the split.</p><div class="program-data"><strong>${fmt(rs.length)} reported outcomes</strong><p>${fmt(offers.length)} offers · ${years.join(', ')}</p><p>${m===null?'No numeric offer averages reported':m.toFixed(1)+'% median reported offer average'}</p></div><details><summary>Sources & name mapping</summary><p>${esc(p.verification==='Official catalog match'?p.verificationNote:'Original submitted program label. Exact official-name mapping is not established; the source reports remain fully browsable.')}</p>${link(p.url,'Official institution / program')}</details><div class="card-actions">${starBtn(p.id)}<button class="pill-button ghosty" data-share="${p.id}">Share</button><button class="pill-button ghosty" data-cmp-add="${p.id}" data-view="compare">Compare my average</button><button class="pill-button" data-only-program="${p.id}" data-explore="true" data-study-mode="${mode}">Browse ${fmt(rs.length)} reports →</button></div></article>`;}).join('');$('#catalog-more').hidden=ps.length<=catalogLimit;const pools=catalogPrograms.filter(p=>p.isSourceCollection&&(!q||[p.university,...p.aliases].join(' ').toLowerCase().includes(q)));$('#source-collections').innerHTML=pools.map(p=>`<div class="source-collection"><strong>${esc(p.university)}</strong><p>${fmt(counts.get(p.id)?.length||0)} source reports. Original labels are searchable in Explore.</p><button class="pill-button" data-only-program="${p.id}" data-explore="true">Browse source reports →</button></div>`).join('');}

function sources(){const sheet=reports.filter(r=>r.sourceType==='Spreadsheet');$('#dataset-summary').textContent=`${fmt(sheet.length)} spreadsheet outcome records from ${fmt(new Set(sheet.map(r=>r.source)).size)} source rows, plus ${reports.length-sheet.length} curated Reddit outcomes. These are not distinct applicants.${ALLY()?'':` (Counting Fall ${archiveInfo.currentYear||2027} only. Load all years to include ${fmt(archiveInfo.reports||0)} more.)`}`;$('#spreadsheet-coverage').innerHTML=`<table><thead><tr><th>Source / entry year</th><th>Outcomes</th><th>Flagged</th></tr></thead><tbody>${datasets.map(d=>`<tr><td>${link(d.url,d.year+' · '+d.sheetName)}<small>${esc(d.title)}</small></td><td>${fmt(d.includedOutcomes)}</td><td>${fmt(d.flaggedOutcomes||0)}</td></tr>`).join('')}</tbody></table>`;$('#official-sources').innerHTML=officialSources.map(s=>`<article class="source-item">${link(s.url,s.title)}<p>${esc(s.note)}</p><span class="source-meta">${esc(s.checked?'Checked '+s.checked:'Date not recorded')}</span></article>`).join('');$('#report-sources').innerHTML=Object.entries(reportSources).filter(([k,s])=>s.kind!=='Spreadsheet').map(([k,s])=>`<article class="source-item">${link(s.url,s.title)}<p>${esc(s.evidence)}</p><details><summary>Interpretation & limits</summary><p>${esc(s.note)}</p><p>${esc(s.access)}</p></details></article>`).join('');$('#waterloo-guidance').innerHTML=Object.entries(guidance).map(([k,v])=>`<div class="waterloo-item"><strong>${esc(k.replace(/([A-Z])/g,' $1'))} · Waterloo Mathematics</strong><p>${esc(v)}</p></div>`).join('');$('#refresh-status').textContent=runtimeStatus.message;$('#audit-summary').innerHTML=`<p><strong>${fmt(importAudit.sourceRowsScanned||0)}</strong> submitted rows inspected · <strong>${fmt(importAudit.officialMatchedPrograms||0)}</strong> program labels with catalog matches.</p><p>${Object.entries(importAudit.excluded||{}).map(([k,n])=>esc(k)+': '+fmt(n)).join(' · ')}</p><p>Catalog access limitations: ${esc((importAudit.incompleteCatalogAccess||[]).join(", ")||"None recorded")}. Unassigned labels remain searchable as source records and never create program names.</p><p>Original Canadian program labels are preserved; all retained data is included in comparisons. Historical source-row flags remain intact.</p>`;}
function freshness(){const t=runtimeStatus.lastUpdated?new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(new Date(runtimeStatus.lastUpdated))+' Toronto time':'bundled research snapshot';$('#freshness-text').textContent='Last saved update: '+t+'. Self-reports are not a representative admissions database.';$('#coverage-summary').textContent=`${fmt(reports.length)} source outcomes · ${fmt(new Set(reports.map(r=>r.university)).size)} Canadian institution / campus groups. ${ALLY()?'All years are loaded.':'Fall '+(archiveInfo.currentYear||2027)+' is loaded; earlier years load on request.'}`;}
const RECEIPT_LABELS={applicantGroup:'Applicant group',citizenship:'Citizenship',province:'Province / state',residenceCountry:'Country of residence',ouacCode:'OUAC code',grade11Average:'Grade 11 final',grade12MidtermAverage:'Grade 12 midterm',grade12PredictedAverage:'Grade 12 predicted',grade12FinalAverage:'Grade 12 final',scholarship:'Scholarship / aid'};
const rxDate=t=>{const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(t||'').trim());return m?new Date(Date.UTC(+m[3],m[1]-1,+m[2])):null;};
const rxIso=t=>t?new Date(t+'T00:00:00Z'):null;
const rxShort=d=>new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(d);
const rxPct=v=>v===null||v===undefined?'':(Math.round(v*100)/100)+'%';
let receiptId=null,receiptScope='year';
function receiptOrder(){try{return sortedRows(lastRows,filters.sort).map(x=>x.id);}catch{return [];}}
function receiptTimeline(r,s,d){
  const steps=[['Applied',rxDate(d.applicationDate)],['Decision',rxIso(r.decisionDate)],['Reported',rxDate(s.submissionTimestamp)||rxIso(s.reportDate)]];
  const shown=steps.filter(x=>x[1]);
  if(!shown.length)return '';
  let out='',prev=null;
  for(const [label,when] of steps){
    if(!when){if(label==='Decision')out+=`<li class="rx-step muted"><span>Decision</span><strong>${esc(decision(r))}</strong></li>`;continue;}
    if(prev){const gap=Math.round((when-prev)/864e5);out+=`<li class="rx-gap" aria-hidden="true"><span>${gap>=0?gap+(gap===1?' day':' days'):'date order unclear'}</span></li>`;}
    out+=`<li class="rx-step"><span>${label}</span><strong>${rxShort(when)}</strong></li>`;prev=when;
  }
  return `<ol class="rx-timeline" aria-label="Application timeline">${out}</ol>`;
}
function receiptCompare(r){
  const key=x=>String(x.submittedProgram||'').trim().toLowerCase(),same=r.isSourceCollection?x=>x.university===r.university&&key(x)===key(r):x=>x.program===r.program;
  const pool=reports.filter(x=>same(x)&&x.average!==null&&x.average!==undefined&&(receiptScope==='all'||x.year===r.year));
  const scopeLabel=receiptScope==='all'?'all years':'Fall '+r.year;
  const toggle=`<div class="rx-scope" role="group" aria-label="Comparison range"><button data-scope="year" aria-pressed="${receiptScope==='year'}">Fall ${r.year}</button><button data-scope="all" aria-pressed="${receiptScope==='all'}">All years</button></div>`;
  if(pool.length<2)return `<section class="rx-section"><div class="rx-head"><h3>Compared with others</h3>${toggle}</div><p class="rx-empty">Not enough reports with a numeric average for this program in ${scopeLabel} to compare yet.</p></section>`;
  const vals=pool.map(x=>x.average),lo=Math.max(0,Math.floor(Math.min(...vals)/5)*5),hi=Math.min(100,Math.max(lo+5,Math.ceil(Math.max(...vals)/5)*5)),span=hi-lo||1;
  const cols=new Map();let maxStack=1;
  const dots=pool.slice().sort((a,b)=>a.average-b.average).map(x=>{const pos=(x.average-lo)/span,col=Math.round(pos*70),k=cols.get(col)||0;cols.set(col,k+1);maxStack=Math.max(maxStack,k+1);return {x,pos,k};});
  const stack=Math.min(maxStack,10),h=24+stack*11;
  const html=dots.map(({x,pos,k})=>`<button class="rx-dot ${esc(x.outcome)}${x.id===r.id?' me':''}" style="left:${(pos*100).toFixed(2)}%;bottom:${8+Math.min(k,stack-1)*11}px" data-receipt="${esc(x.id)}" title="${esc(x.averageLabel)}${x.average!==null&&!String(x.averageLabel).includes('%')?'%':''} · ${esc(x.outcome)} · Fall ${x.year}" aria-label="${esc(x.averageLabel)} percent, ${esc(x.outcome)}, Fall ${x.year}${x.id===r.id?' (this report)':''}"></button>`).join('');
  const offers=pool.filter(x=>x.outcome==='Offer').map(x=>x.average).sort((a,b)=>a-b);
  let line=`${fmt(pool.length)} reports with a numeric average for this ${r.isSourceCollection?'submitted program name':'program'} (${scopeLabel}).`;
  if(offers.length>=3){const mid=offers.length%2?offers[(offers.length-1)/2]:(offers[offers.length/2-1]+offers[offers.length/2])/2;line+=` Median reported offer: <strong>${rxPct(mid)}</strong>.`;
    if(r.average!==null&&r.average!==undefined){const below=offers.filter(v=>v<r.average).length;line+=` This average is higher than <strong>${Math.round(below/offers.length*100)}%</strong> of ${fmt(offers.length)} reported offers.`;}}
  return `<section class="rx-section"><div class="rx-head"><h3>Compared with others</h3>${toggle}</div><div class="rx-strip" style="height:${h}px">${html}</div><div class="rx-axis"><span>${lo}%</span><span>${Math.round((lo+hi)/2)}%</span><span>${hi}%</span></div><p class="rx-note">${line} <span class="rx-hint">Select a dot to open that receipt.</span></p></section>`;
}
function receiptNote(title,text){
  const t=String(text||'').trim();if(!t||/^(none|n\/?a|nope|no|-+|\.|nothing|null)\.?$/i.test(t))return '';
  const long=t.length>220;
  return `<div class="rx-note-card${long?' clamp':''}"><span class="rx-label">${esc(title)}</span><p>${esc(t)}</p>${long?'<button class="rx-more" data-more>Show more</button>':''}</div>`;
}
function evidence(id,b){if(b)gc('receipt-open','Open a receipt',true);
  const r=rmap.get(id);if(!r)return;
  const dlg=$('#evidence-dialog'),wasOpen=dlg.open;
  if(!wasOpen)trigger=b||document.activeElement;
  receiptId=id;
  const p=pmap.get(r.program)||{},s=reportSources[r.source]||{},d=s.applicationDetails||{};
  const order=receiptOrder(),idx=order.indexOf(id);
  const nav=idx>=0&&order.length>1?`<div class="rx-nav"><button data-nav="-1" aria-label="Previous receipt" ${idx===0?'disabled':''}>‹</button><span>${fmt(idx+1)} of ${fmt(order.length)}</span><button data-nav="1" aria-label="Next receipt" ${idx===order.length-1?'disabled':''}>›</button></div>`:'';
  const avg=r.average!==null&&r.average!==undefined?esc(r.averageLabel)+(String(r.averageLabel).includes('%')?'':'%'):esc(r.averageLabel||'Unstated');
  const facts=[],unstated=[];
  for(const [k,v] of Object.entries(d)){if(k==='applicationDate'||k==='supplementalApplication')continue;const label=RECEIPT_LABELS[k]||k;String(v).trim()?facts.push([label,v]):unstated.push(label);}
  for(const [label,v] of [['Study option',r.studyMode],['Home university',r.homeInstitution],['Curriculum',r.curriculum]])(!v||v==='Unstated')?unstated.push(label.toLowerCase()):facts.push([label,v]);
  const factHtml=facts.map(([k,v])=>`<div class="rx-fact${String(v).length>28?' wide':''}"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
  const verified=p.verification==='Official catalog match'&&r.programVerified!==false;
  const flags=r.reviewFlags||[];
  const pills=`<span class="rx-pill ${verified?'ok':'warn'}">${verified?'✓ Official program name confirmed':'⚑ Program name not matched to an official catalog'}</span>`+(flags.filter(f=>!/official catalog/i.test(f)).map(f=>`<span class="rx-pill warn">⚑ ${esc(f)}</span>`).join('')||`<span class="rx-pill ok">✓ No other review flags</span>`);
  const supp=String(s.supplementalContext||'').replace(/^Supplemental application:\s*/i,'');
  const notes=receiptNote('Applicant comments',s.applicantComments)+receiptNote('Supplemental application',d.supplementalApplication)+receiptNote('Supplemental highlights',supp)+(r.sourceType==='Reddit'?receiptNote('Reddit snapshot',s.snapshot||s.evidence):'');
  const raw=[['Submitted program',s.rawProgram||p.name],['Submitted decision',s.rawOutcome||r.outcome],['Submitted average',s.rawAverage],['Sheet submission / post',s.submissionTimestamp||date(s.reportDate)]].filter(x=>x[1]&&String(x[1]).trim());
  $('#evidence-content').innerHTML=`
  <header class="rx-top">
    <div class="dialog-eyebrow"><span class="badge">SELF-REPORTED</span><span>Fall ${r.year} · ${esc(r.sourceType)}</span></div><div class="rx-topright">${r.isSourceCollection?'':starBtn(r.program)}${nav}</div>
  </header>
  <div class="rx-hero">
    <div class="rx-title"><h2 id="evidence-title">${esc(r.isSourceCollection?(r.submittedProgram||s.rawProgram||r.programName):r.programName)}</h2><p>${esc(r.university)}${r.isSourceCollection?' · <span class="rx-muted">not assigned to a single official program</span>':''}</p></div>
    <div class="rx-score ${esc(r.outcome)}"><span class="rx-avg">${avg}</span>${badge(r)}</div>
  </div>
  ${receiptTimeline(r,s,d)}
  ${factHtml?`<div class="rx-facts">${factHtml}</div>`:''}
  ${unstated.length?`<p class="rx-unstated">Not stated: ${esc(unstated.join(', '))}</p>`:''}
  <div class="rx-pills">${pills}</div>
  ${notes?`<section class="rx-section"><h3>In their words</h3><div class="rx-notes">${notes}</div></section>`:r.sourceType==='Spreadsheet'?`<p class="rx-unstated">${s.contextChecked?'No applicant comment supplied in the source row.':'Applicant comments not yet available for this source.'}</p>`:''}
  ${receiptCompare(r)}
  <p class="rx-disclaimer">Self-reported by an anonymous applicant and not verified. Treat it as one data point, not proof.</p>
  <div class="rx-actions">${s.url?link(s.url,'Open source row / post','evidence-source'):''}${p.url?link(p.url,'Program page','rx-secondary'):''}<button class="rx-secondary" data-copy-receipt>Copy link to this receipt</button><a class="rx-flag" href="${esc(flagUrl(r))}" target="_blank" rel="noopener noreferrer">⚑ Flag this report</a></div>
  <details class="rx-source"><summary>About this source</summary>
    ${raw.length?`<dl>${raw.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`:''}
    <p>${esc(s.evidence)}</p><p class="evidence-caveat">${esc(s.note)}</p>
    <p class="fine">${esc(s.access)}. Catalog matching confirms program existence, not this applicant’s outcome. Possible cross-source overlap remains.</p>
  </details>`;
  if(!wasOpen){dlg.showModal();$('#close-dialog').focus();}
  writeUrl();
}
function receiptGo(step){const order=receiptOrder(),i=order.indexOf(receiptId),next=order[i+step];if(i>=0&&next){evidence(next);$(`#evidence-content [data-nav="${step}"]`)?.focus();}}
$('#evidence-content').addEventListener('click',e=>{
  const nav=e.target.closest('[data-nav]');if(nav){receiptGo(Number(nav.dataset.nav));return;}
  const dot=e.target.closest('[data-receipt]');if(dot){const id=dot.dataset.receipt;if(id!==receiptId){evidence(id);$('#evidence-content').scrollIntoView?.();$('#evidence-dialog').scrollTop=0;}return;}
  const sc=e.target.closest('[data-scope]');if(sc){receiptScope=sc.dataset.scope;evidence(receiptId);$(`#evidence-content [data-scope="${receiptScope}"]`)?.focus();return;}
  if(e.target.closest('[data-copy-receipt]')){copyText(urlFor(filters,receiptId),'Link to this receipt copied');return;}
  const more=e.target.closest('[data-more]');if(more){const card=more.closest('.rx-note-card');const open=card.classList.toggle('open');more.textContent=open?'Show less':'Show more';}
});
$('#evidence-dialog').addEventListener('keydown',e=>{if(e.target?.matches?.('input,select,textarea'))return;if(e.key==='ArrowRight'){e.preventDefault();receiptGo(1);}else if(e.key==='ArrowLeft'){e.preventDefault();receiptGo(-1);}});
function reset(){filters=baseFilters();$('#program-search').value='';sync();picker();render();}
function notify(t){clearTimeout(toastTimer);$('#toast').textContent=t;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4000);}
for(const k of ['university','year','sourceType','studyMode','month','outcome','curriculum','sort','applicantGroup','province','citizenship','residenceCountry'])$('#'+k).addEventListener('change',e=>{filters[k]=e.target.value;if(k==='university'){filters.programs=[];picker();}render();});
$('#program-search').addEventListener('input',picker);$('#clear-programs').addEventListener('click',()=>{filters.programs=[];picker();render();});$('#query').addEventListener('input',e=>{filters.query=e.target.value.trim();render();});$('#unquantified').addEventListener('change',e=>{filters.includeUnquantified=e.target.checked;render();});for(const k of ['minimum','maximum'])$('#'+k).addEventListener('input',()=>{const a=Number($('#minimum').value),b=Number($('#maximum').value),bad=$('#minimum').value===''||$('#maximum').value===''||a<0||b>100||a>b;$('#range-error').hidden=!bad;if(!bad){filters.minimum=a;filters.maximum=b;render();}});
$('#reset').addEventListener('click',reset);$('#empty-reset').addEventListener('click',reset);$('#catalog-query').addEventListener('input',()=>{catalogLimit=30;catalog();});$('#catalog-more').addEventListener('click',()=>{catalogLimit+=30;catalog();});
$('#close-dialog').addEventListener('click',()=>$('#evidence-dialog').close());$('#evidence-dialog').addEventListener('close',()=>trigger?.isConnected&&trigger.focus());$('#evidence-dialog').addEventListener('click',e=>{if(e.target===$('#evidence-dialog')){const box=e.target.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)e.target.close();}});
$('#export').addEventListener('click',()=>{const rows=lastRows.map(r=>({...r,sourceUrl:reportSources[r.source].url,applicantComments:reportSources[r.source].applicantComments||'',sourceSnapshot:reportSources[r.source].snapshot||'',applicationDetails:reportSources[r.source].applicationDetails||{},submissionTimestamp:reportSources[r.source].submissionTimestamp||'',supplementalContext:reportSources[r.source].supplementalContext||''}));if(!rows.length)return;const u=URL.createObjectURL(new Blob(['\ufeff'+toCsv(rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download='canada-offer-atlas-'+filters.year+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);notify('Exported '+fmt(rows.length)+' sourced outcomes.');});
for(const box of ['#program-options','#expanded-options'])$(box).addEventListener('change',e=>{const id=e.target.dataset.program;if(!id)return;filters.programs=e.target.checked?[...filters.programs,id]:filters.programs.filter(x=>x!==id);picker();render();});
 document.addEventListener('change',e=>{const id=e.target.dataset.programMode;if(id){cardModes.set(id,e.target.value);catalog();}});
 document.addEventListener('click',e=>{const v=e.target.closest('[data-view]');if(v){e.preventDefault();setView(v.dataset.view,true);document.querySelector('.view:not([hidden])')?.scrollIntoView({behavior:'auto',block:'start'});return;}const r=e.target.closest('[data-record]');if(r){evidence(r.dataset.record,r);return;}const ip=e.target.closest('[data-inspect-program]');if(ip){inspectProgram(ip.dataset.inspectProgram,ip.dataset.lo,ip.dataset.hi);return;}const pg=e.target.closest('[data-page]');if(pg&&!pg.disabled){page+=pg.dataset.page==='next'?1:-1;table();return;}const m=e.target.closest('[data-month]');if(m){filters.month=filters.month===m.dataset.month?'All':m.dataset.month;sync();render();return;}const o=e.target.closest('[data-outcome]');if(o){filters.outcome=filters.outcome===o.dataset.outcome?'All':o.dataset.outcome;sync();render();return;}const p=e.target.closest('[data-only-program]');if(p){filters.programs=[p.dataset.onlyProgram];if(p.dataset.explore){filters.studyMode=p.dataset.studyMode||'Both';filters.university='All';filters.year='All';setView('explorer');$('#workspace').scrollIntoView({behavior:'auto'});}sync();picker();render();}});
$('#expand-picker').onclick=()=>{$('#expanded-search').value=$('#program-search').value;picker();$('#program-dialog').showModal();};
$('#close-picker').onclick=()=>$('#program-dialog').close();$('#expanded-search').oninput=e=>{$('#program-search').value=e.target.value;picker();};
$('#picker-columns').onchange=e=>$('#expanded-options').style.setProperty('--picker-columns',e.target.value);
$('#expanded-clear').onclick=()=>{filters.programs=[];picker();render();};$('#close-dots').onclick=()=>$('#dot-dialog').close();
function zoom(a,b){plotMin=a;plotMax=b;$('#plot-min').value=a;$('#plot-max').value=b;averages(lastRows);}
$('#plot-full').onclick=()=>zoom(0,100);$('#plot-focus').onclick=()=>zoom(80,100);
for(const id of ['plot-min','plot-max'])$('#'+id).onchange=()=>{const a=+$('#plot-min').value,b=+$('#plot-max').value;if(a>=0&&b<=100&&a<b)zoom(a,b);};
$('#plot-expand').onclick=()=>{plotExpanded=!plotExpanded;$('#average-panel').classList.toggle('plot-expanded',plotExpanded);$('#plot-expand').textContent=plotExpanded?'Exit expanded view':'Expand chart';};
// ---- Shared helpers for links, archive loading, freshness, filters, credits ----
const FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSduOQcWoG-Hk8s-pn-TyM8CyDvxe8otqYOklNhDJChptaRRxg/viewform';
const ISSUES_URL='https://github.com/offeratlas/offeratlas.github.io/issues/new';
const URLKEYS={university:'u',year:'y',sourceType:'src',studyMode:'mode',month:'m',outcome:'o',curriculum:'cur',minimum:'min',maximum:'max',query:'q',sort:'sort',applicantGroup:'grp',province:'prov',citizenship:'cit',residenceCountry:'res'};
const PREF_KEY='offeratlas.loadAllYears';
const ALLY=()=>loadState.archiveLoaded&&loadState.includeArchive;
const prefGet=()=>{try{return localStorage.getItem(PREF_KEY);}catch{return null;}};
const prefSet=v=>{try{v?localStorage.setItem(PREF_KEY,v):localStorage.removeItem(PREF_KEY);}catch{}};
function baseFilters(){return {...defaultFilters(),year:ALLY()?'All':String(archiveInfo.currentYear||2027)};}
function readUrl(){const q=new URLSearchParams(location.search),f={};let any=false;for(const [k,key] of Object.entries(URLKEYS))if(q.has(key)){any=true;const v=q.get(key);f[k]=(k==='minimum'||k==='maximum')?Number(v):v;}if(q.has('p')){any=true;f.programs=q.get('p').split(',').filter(Boolean);}if(q.get('nq')==='1'){any=true;f.includeUnquantified=false;}if(any&&!('year' in f))f.year='All';return {filters:any?f:null,receipt:q.get('r')};}
function urlFor(f,receipt){const d=defaultFilters(),q=new URLSearchParams();for(const [k,key] of Object.entries(URLKEYS))if(f[k]!==undefined&&String(f[k])!==String(d[k])&&!(k==='query'&&!f[k]))q.set(key,f[k]);if(f.year&&(f.year!==d.year||ALLY()))q.set('y',f.year);if(f.programs?.length)q.set('p',f.programs.join(','));if(f.includeUnquantified===false)q.set('nq','1');if(receipt)q.set('r',receipt);let s=q.toString();if(s==='y='+(archiveInfo.currentYear||2027)&&!ALLY())s='';return location.origin+location.pathname+(s?'?'+s:'')+(location.hash||'');}
let urlTimer;function writeUrl(){clearTimeout(urlTimer);urlTimer=setTimeout(()=>{const open=$('#evidence-dialog').open?receiptId:null;const u=urlFor(filters,open);if(u!==location.href)history.replaceState(null,'',u);},150);}
async function copyText(text,msg){try{await navigator.clipboard.writeText(text);}catch{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();try{document.execCommand('copy');}catch{}t.remove();}notify(msg||'Link copied');}
// Archive (earlier years)
function banner(state){const el=$('#data-banner');if(!el)return;const n=fmt(archiveInfo.reports||0),yrs=archiveInfo.years||[],range=yrs.length?`${yrs[0]}–${yrs[yrs.length-1]}`:'earlier years',mb=((archiveInfo.gzipBytes||0)/1048576).toFixed(1);
 if(state==='hidden'||ALLY()){el.hidden=true;return;}el.hidden=false;
 el.innerHTML=state==='loading'?`<span class="db-spin" aria-hidden="true"></span><p><strong>Loading Fall ${range} reports…</strong> ${n} more reports are on the way.</p>`
 :state==='error'?`<p><strong>Older years couldn’t load.</strong> Check your connection and try again.</p><div class="db-actions"><button class="db-primary" data-archive="load">Try again</button></div>`
 :state==='collapsed'?`<p>Showing <strong>Fall ${archiveInfo.currentYear} only</strong>. </p><div class="db-actions"><button class="db-link" data-archive="load">Load all years (${range}) →</button></div>`
 :`<p><strong>Showing Fall ${archiveInfo.currentYear} first</strong> so the site opens fast. Also load every earlier year (${range})? That adds ${n} reports, about ${mb} MB.</p><div class="db-actions"><button class="db-primary" data-archive="load">Load all years</button><button class="db-ghost" data-archive="skip">Just ${archiveInfo.currentYear} for now</button><label class="db-remember"><input type="checkbox" id="db-remember"> Always load all years on this device</label></div>`;}
async function requestArchive({setAllYears=false,quiet=false}={}){if(ALLY()){syncYearsToggle();return true;}const wasLoaded=loadState.archiveLoaded;if(!wasLoaded)banner('loading');syncYearsToggle('loading');const ok=await loadArchive();if(!ok){banner('error');syncYearsToggle();return false;}if(setAllYears)filters.year='All';all();banner('hidden');syncYearsToggle();if(!quiet)notify(`Showing all years · ${fmt(reports.length)} reports`);return true;}
function useCurrentOnly(){loadState.includeArchive=false;filters.year=String(archiveInfo.currentYear||2027);all();banner('hidden');syncYearsToggle();notify(`Showing Fall ${archiveInfo.currentYear||2027} only · ${fmt(reports.length)} reports`);}
function syncYearsToggle(state){const all=ALLY();for(const b of document.querySelectorAll('[data-years]')){const on=b.dataset.years==='all'?all:!all;b.setAttribute('aria-pressed',String(on));}const w=$('#years-toggle');if(w)w.classList.toggle('loading',state==='loading');}
document.addEventListener('click',e=>{const y=e.target.closest('[data-years]');if(y){if(y.dataset.years==='all'){prefSet('always');requestArchive({setAllYears:true});}else{prefSet('cur');useCurrentOnly();}return;}const b=e.target.closest('[data-archive]');if(!b)return;if(b.dataset.archive==='load'){if($('#db-remember')?.checked)prefSet('always');requestArchive({setAllYears:true});}else{prefSet('cur');banner('hidden');syncYearsToggle();}});
// Freshness strip and "New this week"
const subTime=r=>{const s=reportSources[r.source]||{};const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(String(s.submissionTimestamp||''));return m?Date.UTC(+m[3],m[1]-1,+m[2],+m[4]+5,+m[5]):(s.reportDate?Date.parse(s.reportDate+'T12:00:00Z'):0);};
const torDay=ms=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));return Date.parse(p+'T00:00:00Z');};
const ago=t=>{const d=Math.round((torDay(Date.now())-torDay(t))/864e5);return d<=0?'today':d===1?'yesterday':d+' days ago';};
function fresh(){const el=$('#fresh-list');if(!el)return;const cur=reports.filter(r=>r.year===(archiveInfo.currentYear||2027)).map(r=>[r,subTime(r)]).filter(x=>x[1]).sort((a,b)=>b[1]-a[1]);const week=cur.filter(x=>Date.now()-x[1]<7*864e5);
 const upd=runtimeStatus.lastUpdated?new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',timeZone:'America/Toronto'}).format(new Date(runtimeStatus.lastUpdated)):null;
 $('#fresh-meta').innerHTML=`<span class="live-dot" aria-hidden="true"></span> Updated daily at 8 AM ET${upd?` · last new entries ${esc(upd)}`:''} · <strong>${fmt(week.length)}</strong> new report${week.length===1?'':'s'} in the past 7 days`;
 const items=cur.slice(0,20);if(!items.length){el.innerHTML='<p class="fine">No new reports yet this cycle.</p>';return;}
 const sym=o=>o==='Offer'?'▲':o==='Rejected'?'▼':'◆';
 const avgTxt=r=>r.average!==null&&r.average!==undefined?esc(r.averageLabel)+(String(r.averageLabel).includes('%')?'':'%'):esc(String(r.averageLabel||'—').slice(0,16));
 const item=([r,t],dup)=>`<button class="tk-item ${esc(r.outcome)}" data-record="${esc(r.id)}"${dup?' tabindex="-1" aria-hidden="true"':''}><span class="tk-sym" aria-hidden="true">${sym(r.outcome)}</span><span class="tk-prog">${esc(r.isSourceCollection?(r.submittedProgram||r.programName):r.programName)}</span><span class="tk-uni">${esc(r.university)}</span><span class="tk-avg">${avgTxt(r)}</span><span class="tk-out">${r.outcome==='Alternate'?'ALT OFFER':esc(r.outcome.toUpperCase())}</span><span class="tk-when">${ago(t)}</span></button>`;
 const run=items.map(x=>item(x,false)).join(''),dup=items.map(x=>item(x,true)).join('');
 el.innerHTML=`<div class="ticker" role="region" aria-label="Latest reports ticker"><div class="tk-track" style="--tk-dur:${Math.max(60,items.length*9)}s"><div class="tk-run">${run}</div><div class="tk-run" aria-hidden="true">${dup}</div></div></div><button class="tk-toggle" id="tk-toggle" aria-pressed="false">Pause ❚❚</button>`;
 const box=el.querySelector('.ticker'),tg=$('#tk-toggle');tg.onclick=()=>{const p=box.classList.toggle('paused');tg.setAttribute('aria-pressed',String(p));tg.textContent=p?'Play ▶':'Pause ❚❚';};}
// Filter panel extras: average slider, presets, "More filters" count
const PRESETS=[['All',0,100],['95+',95,100],['90–95',90,95],['85–90',85,90],['80–85',80,85],['<80',0,80]];
function setRange(a,b){$('#minimum').value=a;$('#maximum').value=b;$('#minimum').dispatchEvent(new Event('input',{bubbles:true}));}
function syncExtras(){const lo=$('#avg-lo'),hi=$('#avg-hi');if(!lo)return;lo.value=filters.minimum;hi.value=filters.maximum;const a=(filters.minimum/100*100),b=(filters.maximum/100*100);$('#avg-track-fill').style.cssText=`left:${a}%;right:${100-b}%`;$('#avg-readout').textContent=filters.minimum===0&&filters.maximum===100?'Any average':`${filters.minimum}% – ${filters.maximum}%`;for(const btn of document.querySelectorAll('[data-avg]')){const [x,y]=btn.dataset.avg.split('-').map(Number);btn.setAttribute('aria-pressed',String(x===filters.minimum&&y===filters.maximum));}
 const d=defaultFilters(),n=['sourceType','studyMode','month','outcome','curriculum','applicantGroup','province','citizenship','residenceCountry','includeUnquantified'].filter(k=>String(filters[k])!==String(d[k])).length;const c=$('#more-count');c.textContent=n;c.hidden=!n;}
function filterSummary(){const el=$('#filter-summary');if(!el)return;const d=defaultFilters(),parts=[filters.year==='All'?'All years':'Fall '+filters.year,filters.university==='All'?'All schools':filters.university];if(filters.programs.length)parts.push(filters.programs.length+' program'+(filters.programs.length>1?'s':''));if(filters.minimum!==0||filters.maximum!==100)parts.push(filters.minimum+'–'+filters.maximum+'%');const more=['sourceType','studyMode','month','outcome','curriculum','applicantGroup','province','citizenship','residenceCountry','includeUnquantified'].filter(k=>String(filters[k])!==String(d[k])).length;if(more)parts.push('+'+more+' more');el.textContent=parts.join(' · ')+' · '+fmt(lastRows.length)+' reports';}
function afterRender(){syncExtras();writeUrl();filterSummary();const y=filters.year,cy=String(archiveInfo.currentYear||2027);if(loadState.coreLoaded&&!ALLY()&&y!==cy)requestArchive({quiet:false});}
// Credits
function credits(){const el=$('#credits-list');if(!el)return;const seen=new Map();for(const d of datasets){if(!seen.has(d.spreadsheetId))seen.set(d.spreadsheetId,{title:d.title,url:d.url.split('#')[0],years:[]});seen.get(d.spreadsheetId).years.push(d.year);}
 const reddit=(refreshAudit.reddit?.sources||['https://www.reddit.com/r/OntarioGrade12s/','https://www.reddit.com/r/uwaterloo/']);
 el.innerHTML=[...seen.values()].map(s=>`<li>${link(s.url,s.title)}<span class="credit-meta">Entry ${[...new Set(s.years)].sort().join(', ')} · public, applicant-submitted Google Sheet</span></li>`).join('')+reddit.map(u=>`<li>${link(u,'r/'+u.replace(/\/+$/,'').split('/').pop())}<span class="credit-meta">Public Reddit posts, summarized with links to each post</span></li>`).join('');}

// ---- Watchlist, compare-my-average, offer tracker, share images, flagging, theme ----
const CUR=()=>archiveInfo.currentYear||2027;
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}};
const todayISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date());
const pname=p=>p?(p.displayName||p.name):'';
function byProgram(){const m=new Map();for(const r of reports){if(r.isSourceCollection)continue;if(!m.has(r.program))m.set(r.program,[]);m.get(r.program).push(r);}return m;}
let progIndex=null;const progReports=()=>progIndex||(progIndex=byProgram());
// Watchlist ---------------------------------------------------------------
let watch=store.get('offeratlas.watch',{ids:[],seen:{}});
const isWatched=id=>watch.ids.includes(id);
const starBtn=id=>id&&!String(id).startsWith('SOURCE_')?`<button class="star-btn" data-watch="${esc(id)}" aria-pressed="${isWatched(id)}" title="${isWatched(id)?'Remove from watchlist':'Add to watchlist'}" aria-label="${isWatched(id)?'Remove from watchlist':'Add to watchlist'}">${isWatched(id)?'★':'☆'}</button>`:'';
function toggleWatch(id){if(!isWatched(id))gc('watch-star','Star a program',true);if(isWatched(id)){watch.ids=watch.ids.filter(x=>x!==id);delete watch.seen[id];}else{watch.ids.push(id);watch.seen[id]=Date.now();}store.set('offeratlas.watch',watch);for(const b of document.querySelectorAll(`[data-watch="${CSS.escape(id)}"]`)){const on=isWatched(id);b.setAttribute('aria-pressed',String(on));b.textContent=on?'★':'☆';b.title=b.ariaLabel=on?'Remove from watchlist':'Add to watchlist';}watchStrip();notify(isWatched(id)?'Added to your watchlist ★':'Removed from your watchlist');}
function watchStrip(){const el=$('#watch-strip');if(!el)return;const ids=watch.ids.filter(id=>pmap.has(id));if(!ids.length){el.hidden=true;return;}const idx=progReports();el.hidden=false;
 el.innerHTML=`<span class="ws-title">★ Your watchlist</span>`+ids.map(id=>{const p=pmap.get(id),rs=idx.get(id)||[],seen=watch.seen[id]||0,nw=rs.filter(r=>subTime(r)>seen).length;return `<button class="ws-chip" data-watch-open="${esc(id)}"><strong>${esc(pname(p))}</strong><span>${esc(p.university)}</span>${nw?`<em>+${nw} new</em>`:''}</button>`;}).join('')+`<button class="ws-link" data-view="compare">Compare my average →</button>`;}
// Compare my average -------------------------------------------------------
let cmp=store.get('offeratlas.compare',{avg:null,programs:[],scope:'cur'});
const saveCmp=()=>store.set('offeratlas.compare',cmp);
function cmpLabel(p,n){if(n<5)return ['few','Too few reports to say much'];return p>=75?['above','Above most reported offers']:p>=40?['within','Within the typical range of reported offers']:p>=15?['lower','Toward the lower end of reported offers']:['below','Below most reported offers'];}
function compareRender(){const el=$('#cmp-results');if(!el)return;$('#cmp-avg').value=cmp.avg??'';$('#cmp-scope').value=cmp.scope;
 const cy=CUR(),idx=progReports(),avg=Number(cmp.avg),hasAvg=cmp.avg!==null&&cmp.avg!==''&&Number.isFinite(avg);
 if(!cmp.programs.length&&watch.ids.length){cmp.programs=watch.ids.filter(id=>pmap.has(id)).slice(0,6);saveCmp();}
 $('#cmp-chips').innerHTML=cmp.programs.filter(id=>pmap.has(id)).map(id=>`<span class="cmp-chip">${esc(pname(pmap.get(id)))} <small>${esc(pmap.get(id).university)}</small><button data-cmp-remove="${esc(id)}" aria-label="Remove ${esc(pname(pmap.get(id)))}">×</button></span>`).join('');
 const needArchive=cmp.scope!=='cur'&&!ALLY();
 $('#cmp-note').innerHTML=needArchive?`Earlier years aren’t loaded yet. <button class="db-link" data-archive="load">Load all years</button> to compare with past cycles.`:'';
 if(!cmp.programs.length){el.innerHTML='<p class="cmp-empty">Add a program above to see where your average sits among reported offers. Tip: ★ programs anywhere on the site to add them to your watchlist.</p>';return;}
 el.innerHTML=cmp.programs.filter(id=>pmap.has(id)).map(id=>{const p=pmap.get(id),pool=(idx.get(id)||[]).filter(r=>Number.isFinite(r.average)&&(cmp.scope==='all'||(cmp.scope==='recent'?r.year>=cy-2:r.year===cy)));
  const offers=pool.filter(r=>r.outcome==='Offer').map(r=>r.average).sort((a,b)=>a-b),rej=pool.filter(r=>r.outcome==='Rejected').map(r=>r.average);
  const q=f=>{if(!offers.length)return null;const i=(offers.length-1)*f,lo=Math.floor(i),hi=Math.ceil(i);return offers[lo]+(offers[hi]-offers[lo])*(i-lo);};
  const scopeTxt=cmp.scope==='all'?'all loaded years':cmp.scope==='recent'?`Fall ${cy-2}–${cy}`:`Fall ${cy}`;
  let summary='',chip='';
  if(hasAvg&&offers.length){const below=offers.filter(v=>v<avg).length+offers.filter(v=>v===avg).length/2,pc=Math.round(below/offers.length*100),[cls,txt]=cmpLabel(pc,offers.length);chip=`<span class="cmp-verdict ${cls}">${txt}</span>`;
   const rejAbove=rej.filter(v=>v>=avg).length;summary=`Your <strong>${avg}%</strong> is higher than <strong>${pc}%</strong> of ${fmt(offers.length)} reported offer${offers.length===1?'':'s'} (${scopeTxt}).${rej.length?` ${rejAbove} of ${rej.length} reported rejection${rej.length===1?'':'s'} had an average at or above yours.`:''}`;}
  else if(!offers.length)summary=`No reported offers with a numeric average for ${scopeTxt} yet.`;else summary='Enter your average above to see where it sits.';
  const vals=pool.map(r=>r.average).concat(hasAvg?[avg]:[]),lo=Math.max(50,Math.floor(Math.min(...(vals.length?vals:[85]))-1)),hi=100,span=hi-lo||1,step=span>30?2:span>15?1:0.5,n=Math.ceil(span/step);
  const bins=Array.from({length:n},()=>({o:0,r:0,x:0}));for(const r of pool){const i=Math.min(n-1,Math.max(0,Math.floor((r.average-lo)/step)));bins[i][r.outcome==='Offer'?'o':r.outcome==='Rejected'?'r':'x']++;}
  const mx=Math.max(1,...bins.map(b=>b.o+b.r+b.x)),w=100/n,H=70;
  const bars=bins.map((b,i)=>b.o+b.r+b.x?`<div class="cmp-bar" style="left:${(i*w).toFixed(2)}%;width:${w.toFixed(2)}%"><span class="hb-other" style="height:${(b.x/mx*H).toFixed(1)}px"></span><span class="hb-rej" style="height:${(b.r/mx*H).toFixed(1)}px"></span><span class="hb-offer" style="height:${(b.o/mx*H).toFixed(1)}px"></span></div>`:'').join('');
  const you=hasAvg?`<div class="cmp-you" style="left:${((avg-lo)/span*100).toFixed(2)}%"><span>You ${avg}%</span></div>`:'';
  const med=q(.5),p25=q(.25),p75=q(.75);
  return `<article class="cmp-card"><header><div><h3>${esc(pname(p))}</h3><p>${esc(p.university)}</p></div><div class="cmp-tools">${starBtn(id)}<button class="cmp-tool" data-share="${esc(id)}">Share</button><button class="cmp-tool" data-cmp-remove="${esc(id)}" aria-label="Remove">×</button></div></header>
  ${chip}<div class="cmp-strip" style="height:${H+28}px">${bars}${you}</div><div class="cmp-axis"><span>${lo}%</span><span>${Math.round((lo+hi)/2)}%</span><span>${hi}%</span></div>
  <p class="cmp-sum">${summary}</p>${offers.length>=3?`<p class="cmp-stats">Median reported offer <strong>${med.toFixed(1)}%</strong>${offers.length>=4?` · middle half ${p25.toFixed(1)}–${p75.toFixed(1)}%`:''} · ${fmt(pool.length)} numeric reports</p>`:''}
  <button class="db-link" data-only-program="${esc(id)}" data-explore="true">See these receipts →</button></article>`;}).join('')+`<p class="cmp-disclaimer">Self-reported, unverified data from a non-random group of applicants. This shows where your average sits among what people posted. It is not a prediction or a cutoff, and averages are only one part of admissions.</p>`;}
function cmpSuggest(){const q=$('#cmp-search').value.trim().toLowerCase(),el=$('#cmp-suggest');if(!q){el.innerHTML='';return;}const idx=progReports();
 const toks=q.split(/\s+/).filter(Boolean);const hits=catalogPrograms.filter(p=>{if(p.isSourceCollection||!idx.has(p.id)||cmp.programs.includes(p.id))return false;const t=[pname(p),p.university,...(p.aliases||[])].join(' ').toLowerCase();return toks.every(k=>t.includes(k));}).sort((a,b)=>(idx.get(b.id).length)-(idx.get(a.id).length)).slice(0,8);
 el.innerHTML=hits.map(p=>`<button data-cmp-add="${esc(p.id)}"><strong>${esc(pname(p))}</strong><span>${esc(p.university)} · ${fmt(idx.get(p.id).length)} reports</span></button>`).join('')+(ALLY()?(hits.length?'':'<p class="fine">No matching programs.</p>'):`<p class="fine">${hits.length?'Only programs with Fall '+CUR()+' reports are listed.':'No Fall '+CUR()+' reports match yet.'} <button class="db-link" data-archive="load">Load all years</button> to search every program.</p>`);}
// Offer tracker -----------------------------------------------------------
let trkLimit=60;
function trackerRows(){const cy=CUR(),idx=progReports(),today=todayISO(),cut=String(Number(today.slice(0,4))-1)+today.slice(4),weekAgo=new Date(Date.now()-7*864e5).toISOString().slice(0,10),rows=[];
 for(const [id,rs] of idx){const p=pmap.get(id);if(!p)continue;const curO=rs.filter(r=>r.year===cy&&r.outcome==='Offer'),prevO=rs.filter(r=>r.year===cy-1&&r.outcome==='Offer');if(!curO.length&&prevO.length<3)continue;
  const cd=curO.map(r=>r.decisionDate).filter(d=>d&&d<=today).sort(),pd=prevO.map(r=>r.decisionDate).filter(Boolean).sort();
  const first=cd[0]||null,last=cd[cd.length-1]||null,pFirst=pd[0]||null,pByNow=pd.filter(d=>d<=cut).length;
  let status,cls,sortKey;if(curO.length){status=last&&last>=weekAgo?'Offers out · new this week':'Offers out';cls='out';sortKey=first||'9';}
  else if(pFirst&&pFirst<=cut){status=`Not yet · last year started ${date(pFirst)}`;cls='late';sortKey='z';}
  else if(pFirst){const exp=String(Number(pFirst.slice(0,4))+1)+pFirst.slice(4);status=`Expected around ${date(exp)}`;cls='soon';sortKey='y'+exp;}
  else{status='No dated offers last year';cls='none';sortKey='zz';}
  rows.push({id,p,curN:curO.length,first,last,prevN:prevO.length,pFirst,pByNow,status,cls,sortKey});}
 return rows;}
function trackerRender(){const el=$('#trk-rows');if(!el)return;const q=$('#trk-search').value.trim().toLowerCase(),sort=$('#trk-sort').value,st=$('#trk-status').value,cy=CUR();
 let rows=trackerRows().filter(r=>(!q||[pname(r.p),r.p.university].join(' ').toLowerCase().includes(q))&&(st==='all'||(st==='out'?r.cls==='out':r.cls!=='out'))&&(!$('#trk-watch').checked||isWatched(r.id)));
 const by={recent:(a,b)=>String(b.last||'').localeCompare(a.last||''),first:(a,b)=>String(a.first||'9').localeCompare(b.first||'9'),most:(a,b)=>b.curN-a.curN,soon:(a,b)=>a.sortKey.localeCompare(b.sortKey),az:(a,b)=>a.p.university.localeCompare(b.p.university)||pname(a.p).localeCompare(pname(b.p))};
 rows.sort(by[sort]||by.recent);const all=trackerRows(),out=all.filter(r=>r.cls==='out').length;
 $('#trk-summary').innerHTML=`<strong>${fmt(out)}</strong> programs have reported Fall ${cy} offers so far · ${fmt(all.length-out)} tracked programs haven’t yet. Dates are decision dates applicants reported.`;
 $('#trk-archive-note').innerHTML=ALLY()?'':`<p class="trk-note">Last-year comparisons need earlier data. <button class="db-link" data-archive="load">Load all years</button></p>`;
 $('#trk-head-prev').textContent=`Fall ${cy-1} (last cycle)`;$('#trk-head-cur').textContent=`Fall ${cy} (this cycle)`;
 el.innerHTML=rows.slice(0,trkLimit).map(r=>`<tr><td>${starBtn(r.id)}</td><td><button class="trk-prog" data-only-program="${esc(r.id)}" data-explore="true"><strong>${esc(pname(r.p))}</strong><span>${esc(r.p.university)}</span></button></td><td><span class="trk-status ${r.cls}">${esc(r.status)}</span></td><td>${r.curN?`<strong>${fmt(r.curN)}</strong> offer${r.curN===1?'':'s'}<small>first ${r.first?date(r.first):'date unstated'}${r.last&&r.last!==r.first?` · latest ${date(r.last)}`:''}</small>`:'<span class="muted">—</span>'}</td><td>${ALLY()?(r.prevN?`${fmt(r.prevN)} offers<small>first ${r.pFirst?date(r.pFirst):'—'} · ${fmt(r.pByNow)} by this date</small>`:'<span class="muted">—</span>'):'<span class="muted">load all years</span>'}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No programs match.</td></tr>';
 $('#trk-more').hidden=rows.length<=trkLimit;}
// Share as image ----------------------------------------------------------
function wrapText(ctx,text,maxW){const words=String(text).split(/\s+/),lines=[];let line='';for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;}if(line)lines.push(line);return lines;}
// Story image (1080×1920) for one program. Pure drawing: takes plain data, returns a canvas.
function wrapLines(x,text,maxW){const parts=String(text).replace(/([\/–-])(?=\S)/g,'$1​').split(/(?<=\s)|​/);const lines=[];let line='';
 const push=t=>{if(x.measureText(t).width<=maxW){line=t;return;}let s='';for(const ch of t){if(x.measureText(s+ch).width>maxW&&s){lines.push(s);s=ch;}else s+=ch;}line=s;};
 for(const p of parts){const t=line+p;if(x.measureText(t.trimEnd()).width<=maxW)line=t;else{if(line.trim())lines.push(line.trimEnd());push(p.trimStart());}}if(line.trim())lines.push(line.trimEnd());return lines;}
function drawStory({name,uni,cy,pick,med,offersN,curOffers,firstCur,values,allOfferMed}){
 const c=document.createElement('canvas');c.width=1080;c.height=1920;const x=c.getContext('2d'),F='Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif',M=96,W=1080-2*M;
 const g=x.createLinearGradient(0,0,0,1920);g.addColorStop(0,'#172b45');g.addColorStop(1,'#0b1626');x.fillStyle=g;x.fillRect(0,0,1080,1920);
 const text=(t,px,y,{w=850,color='#fff',align='left',size=30}={})=>{x.font=`${w} ${size}px ${F}`;x.fillStyle=color;x.textAlign=align;x.fillText(t,px,y);x.textAlign='left';};
 // header
 x.fillStyle='#d6f46a';x.beginPath();x.roundRect(M,92,88,88,24);x.fill();text('↗',M+44,155,{w:900,size:54,color:'#162840',align:'center'});
 text('OFFER ATLAS',M+112,132,{size:42});text('Self-reported admission results',M+112,172,{w:600,size:28,color:'#9fb0c6'});
 // title: shrink until it fits in 3 lines
 let size=92,lines;for(;size>=54;size-=4){x.font=`850 ${size}px ${F}`;lines=wrapLines(x,name,W);if(lines.length<=3)break;}
 if(lines.length>3){lines=lines.slice(0,3);let l=lines[2];while(x.measureText(l+'…').width>W&&l.length>1)l=l.slice(0,-1);lines[2]=l.trimEnd()+'…';}
 let y=270+size;for(const l of lines){text(l,M,y,{size});y+=Math.round(size*1.1);}
 y+=8;x.font=`600 40px ${F}`;for(const l of wrapLines(x,uni,W).slice(0,2)){text(l,M,y+6,{w:600,size:40,color:'#b8c4d6'});y+=50;}
 // headline number
 y+=58;text(pick?`MEDIAN REPORTED OFFER AVERAGE · FALL ${pick}`:'MEDIAN REPORTED OFFER AVERAGE',M,y,{w:750,size:26,color:'#9fb0c6'});
 y+=152;text(med!==null?med.toFixed(1)+'%':'—',M-6,y,{w:900,size:164,color:'#d6f46a'});
 y+=52;text(med!==null?`middle value of ${offersN} reported offers that year`:'Not enough reported offers yet',M,y,{w:600,size:30,color:'#b8c4d6'});
 // stat boxes
 y+=46;const bw=(W-24)/2,box=(lab,val,bx,small)=>{x.fillStyle='#21385a';x.beginPath();x.roundRect(bx,y,bw,156,26);x.fill();text(lab,bx+32,y+52,{w:750,size:24,color:'#9fb0c6'});let fs=small?44:60;x.font=`850 ${fs}px ${F}`;while(x.measureText(val).width>bw-64&&fs>26){fs-=2;x.font=`850 ${fs}px ${F}`;}text(val,bx+32,y+124,{w:850,size:fs});};
 box(`FALL ${cy} OFFERS SO FAR`,curOffers?fmt(curOffers):'None reported yet',M,!curOffers);box(`FIRST FALL ${cy} OFFER`,firstCur||'None reported yet',M+bw+24,!firstCur);
 // chart
 y+=156+70;const footTop=1736;
 text('Where reported averages landed',M,y,{size:38});y+=44;
 text('All years · each bar covers 1 percentage point',M,y,{w:600,size:28,color:'#b8c4d6'});y+=46;
 const leg=[['#3fbf8a','Offer'],['#ff7d92','Rejected'],['#8aa0ff','Other (deferred, waitlisted…)']];let lx=M;
 for(const [col,lab] of leg){x.fillStyle=col;x.beginPath();x.roundRect(lx,y-20,24,24,6);x.fill();text(lab,lx+34,y,{w:600,size:26,color:'#dfe6ef'});x.font=`600 26px ${F}`;lx+=34+x.measureText(lab).width+36;}
 y+=34;
 const vals=values.filter(v=>Number.isFinite(v.a)&&v.a<=100);
 if(vals.length<3){text('Not enough reported averages to chart yet.',M,y+80,{w:600,size:30,color:'#b8c4d6'});}
 else{const sorted=vals.map(v=>v.a).sort((a,b)=>a-b),p5=sorted[Math.floor(sorted.length*0.05)];let lo=Math.max(50,Math.floor((p5-1)/5)*5);if(100-lo<10)lo=90;const hi=100,n=hi-lo;
  const bins=Array.from({length:n},()=>({o:0,r:0,x:0}));let below=0;for(const v of vals){if(v.a<lo){below++;continue;}const i=Math.min(n-1,Math.floor(v.a-lo));v.o==='Offer'?bins[i].o++:v.o==='Rejected'?bins[i].r++:bins[i].x++;}
  const mx=Math.max(1,...bins.map(b=>b.o+b.r+b.x)),step=mx<=4?1:mx<=10?2:mx<=25?5:mx<=60?10:mx<=150?25:50,top=Math.ceil(mx/step)*step;
  const yl=58,cx=M+yl,cw=W-yl,top0=y+(allOfferMed!==null&&allOfferMed>=lo?54:8),ch=footTop-(below?118:86)-top0,cy0=top0+ch;
  x.font=`600 24px ${F}`;for(let t=0;t<=top;t+=step){const yy=cy0-t/top*ch;x.fillStyle='#2b4263';x.fillRect(cx,yy,cw,t?1:3);text(String(t),cx-14,yy+8,{w:600,size:24,color:'#9fb0c6',align:'right'});}
  const bwid=cw/n;for(let i=0;i<n;i++){const b=bins[i];let yy=cy0;for(const [k,col] of [['o','#3fbf8a'],['r','#ff7d92'],['x','#8aa0ff']]){const h=b[k]/top*ch;if(!h)continue;x.fillStyle=col;x.fillRect(cx+i*bwid+2,yy-h,Math.max(2,bwid-4),h);yy-=h;}}
  const tick=n<=12?2:5;for(let v=lo;v<=hi;v+=tick)text(v+'%',cx+(v-lo)*bwid,cy0+38,{w:650,size:26,color:'#dfe6ef',align:v===lo?'left':v===hi?'right':'center'});
  if(allOfferMed!==null&&allOfferMed>=lo){const mxp=cx+(allOfferMed-lo)*bwid;x.strokeStyle='#d6f46a';x.lineWidth=4;x.setLineDash([12,10]);x.beginPath();x.moveTo(mxp,top0-12);x.lineTo(mxp,cy0);x.stroke();x.setLineDash([]);
   const lab=`all-years median offer ${allOfferMed.toFixed(1)}%`;x.font=`750 26px ${F}`;const lw=x.measureText(lab).width+24;let bx=Math.min(Math.max(mxp-lw/2,cx),cx+cw-lw);x.fillStyle='#d6f46a';x.beginPath();x.roundRect(bx,y-4,lw,40,12);x.fill();text(lab,bx+12,y+25,{w:750,size:26,color:'#162840'});}
  if(below)text(`${below} report${below===1?'':'s'} below ${lo}% not shown.`,M,cy0+80,{w:600,size:24,color:'#9fb0c6'});}
 // footer
 x.fillStyle='#2b4263';x.fillRect(M,footTop,W,2);
 text('offeratlas.github.io',M,footTop+62,{size:44,color:'#d6f46a'});
 text('Self-reported & unverified · data: r/OntarioGrade12s spreadsheet',M,footTop+108,{w:500,size:26,color:'#9fb0c6'});
 text('Reports, not unique applicants · not a cutoff or prediction',M,footTop+144,{w:500,size:26,color:'#9fb0c6'});
 return c;}
function storyData(p,rs,cy){const yrs=[...new Set(rs.map(r=>r.year))].sort((a,b)=>b-a),pick=yrs.find(y=>rs.filter(r=>r.year===y&&r.outcome==='Offer'&&Number.isFinite(r.average)).length>=3);
 const offersY=pick?rs.filter(r=>r.year===pick&&r.outcome==='Offer'&&Number.isFinite(r.average)).map(r=>r.average):[],curOffers=rs.filter(r=>r.year===cy&&r.outcome==='Offer'),firstCur=curOffers.map(r=>r.decisionDate).filter(Boolean).sort()[0];
 const allOffers=rs.filter(r=>r.outcome==='Offer'&&Number.isFinite(r.average)).map(r=>r.average);
 return {name:pname(p),uni:p.university,cy,pick,med:offersY.length?median(offersY):null,offersN:offersY.length,curOffers:curOffers.length,firstCur:firstCur?date(firstCur).replace(/, \d{4}$/,''):null,values:rs.filter(r=>Number.isFinite(r.average)).map(r=>({a:r.average,o:r.outcome})),allOfferMed:allOffers.length>=3?median(allOffers):null};}
async function shareProgram(id){gc('share-image','Share image',true);if(!ALLY()){notify('Loading all years for the chart…');await requestArchive({quiet:true});}const p=pmap.get(id);if(!p)return;const cy=CUR(),rs=(progReports().get(id)||[]);
 const c=drawStory(storyData(p,rs,cy));
 const blob=await new Promise(r=>c.toBlob(r,'image/png')),url=URL.createObjectURL(blob),file=new File([blob],`offer-atlas-${(pname(p)+'-'+p.university).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,60)}.png`,{type:'image/png'});
 const d=$('#share-dialog');$('#share-img').src=url;$('#share-title').textContent=pname(p)+' · '+p.university;$('#share-size').textContent='Sized for Instagram or TikTok stories (1080×1920). Includes the self-reported disclaimer and credit.';
 $('#share-download').onclick=()=>{const a=document.createElement('a');a.href=url;a.download=file.name;a.click();};
 const can=navigator.canShare&&navigator.canShare({files:[file]});$('#share-native').hidden=!can;$('#share-native').onclick=()=>navigator.share({files:[file],title:'Offer Atlas',text:`${pname(p)} · ${p.university} on Offer Atlas`}).catch(()=>{});
 if(!d.open)d.showModal();}
// Flag a report -----------------------------------------------------------
function flagUrl(r){const s=reportSources[r.source]||{},title=`Flag report: ${r.programName} · ${r.university} · ${r.averageLabel} · ${r.outcome}`;const body=`**Report:** ${r.id}\n**Program:** ${r.programName} (${r.university})\n**Entry:** Fall ${r.year}\n**Average:** ${r.averageLabel}\n**Outcome:** ${r.outcome}\n**Receipt:** ${urlFor(filters,r.id)}\n**Source row:** ${s.url||''}\n\n**What looks wrong?**\n<!-- e.g. impossible average, duplicate, joke entry, wrong program -->\n`;return `${ISSUES_URL}?title=${encodeURIComponent(title)}&labels=flag&body=${encodeURIComponent(body)}`;}
// Theme toggle ------------------------------------------------------------
const THEMES=['light','dark','auto'],THEME_ICON={auto:'◐',light:'☀',dark:'☾'},THEME_LABEL={auto:'Theme: match device',light:'Theme: light',dark:'Theme: dark'};
function applyTheme(){const t=store.get('offeratlas.theme','light');const dark=t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';const b=$('#theme-toggle');if(b){b.textContent=THEME_ICON[t];b.title=b.ariaLabel=THEME_LABEL[t]+' (click to change)';}document.querySelector('meta[name=theme-color]')?.setAttribute('content',dark?'#0d1726':'#162840');}
// Events ------------------------------------------------------------------
document.addEventListener('click',e=>{const t=e.target;
 const w=t.closest('[data-watch]');if(w){e.stopPropagation();toggleWatch(w.dataset.watch);return;}
 const wo=t.closest('[data-watch-open]');if(wo){const id=wo.dataset.watchOpen;watch.seen[id]=Date.now();store.set('offeratlas.watch',watch);filters.programs=[id];sync();picker();render();watchStrip();$('#workspace').scrollIntoView({behavior:'auto'});return;}
 const sh=t.closest('[data-share]');if(sh){shareProgram(sh.dataset.share);return;}
 const ca=t.closest('[data-cmp-add]');if(ca){if(!cmp.programs.includes(ca.dataset.cmpAdd))cmp.programs.push(ca.dataset.cmpAdd);saveCmp();$('#cmp-search').value='';cmpSuggest();compareRender();return;}
 const cr=t.closest('[data-cmp-remove]');if(cr){cmp.programs=cmp.programs.filter(x=>x!==cr.dataset.cmpRemove);saveCmp();compareRender();return;}
},true);

// ---- When will I hear back? -----------------------------------------------
let wait=store.get('offeratlas.wait',{pid:null,date:''});
const mdyD=t=>{const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(t||''));return m?Date.UTC(+m[3],m[1]-1,+m[2]):null;};
const isoD=t=>t?Date.parse(t+'T00:00:00Z'):null;
const cycleStart=ms=>{const d=new Date(ms),y=d.getUTCMonth()>=8?d.getUTCFullYear():d.getUTCFullYear()-1;return Date.UTC(y,8,1);};
const dShort=ms=>new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(ms));
function waitRender(){const el=$('#wait-result');if(!el)return;$('#wait-date').value=wait.date||'';const p=wait.pid&&pmap.get(wait.pid);
 $('#wait-chosen').innerHTML=p?`<span class="cmp-chip">${esc(pname(p))} <small>${esc(p.university)}</small><button data-wait-clear aria-label="Clear program">×</button></span>`:'';
 if(!p){el.innerHTML=`<p class="wait-empty">Pick a program and the date you applied to see how long people waited for a decision.</p>`;return;}
 const rows=(progReports().get(wait.pid)||[]).map(r=>{const a=mdyD(r.applicationDate),d=isoD(r.decisionDate);if(!a||!d)return null;const days=Math.round((d-a)/864e5);return days>=0&&days<=300?{r,a,d,days,doc:(a-cycleStart(a))/864e5}:null;}).filter(Boolean);
 const more=ALLY()?'':` <button class="db-link" data-archive="load">Load all years</button> for more data.`;
 if(rows.length<3){el.innerHTML=`<p class="wait-empty">Only ${rows.length} report${rows.length===1?'':'s'} for this program include both an application date and a decision date, which isn’t enough to estimate.${more}</p>`;return;}
 const user=wait.date?Date.parse(wait.date+'T00:00:00Z'):null,udoc=user!==null?(user-cycleStart(user))/864e5:null;
 let pool=rows,scope='all reports with both dates';if(udoc!==null){const near=rows.filter(x=>Math.abs(x.doc-udoc)<=14);if(near.length>=5){pool=near;scope=`people who applied within 2 weeks of ${dShort(user)} (any year)`;}else scope='all reports with both dates (too few applied near your date)';}
 const ds=pool.map(x=>x.days).sort((a,b)=>a-b),q=f=>{const i=(ds.length-1)*f,lo=Math.floor(i),hi=Math.ceil(i);return Math.round(ds[lo]+(ds[hi]-ds[lo])*(i-lo));},med=q(.5),p25=q(.25),p75=q(.75);
 const elapsed=user!==null?Math.max(0,Math.round((Date.now()-user)/864e5)):null,heardBy=elapsed!==null?pool.filter(x=>x.days<=elapsed).length:null;
 const W=7,maxD=Math.min(300,Math.max(...ds)+W),nb=Math.ceil(maxD/W),bins=Array.from({length:nb},()=>({o:0,x:0}));for(const x of pool){const i=Math.min(nb-1,Math.floor(x.days/W));x.r.outcome==='Offer'?bins[i].o++:bins[i].x++;}const mx=Math.max(1,...bins.map(b=>b.o+b.x)),H=70,bw=100/nb;
 const bars=bins.map((b,i)=>b.o+b.x?`<div class="cmp-bar" style="left:${(i*bw).toFixed(2)}%;width:${bw.toFixed(2)}%" title="${i*W}–${i*W+W-1} days: ${b.o+b.x} reports"><span class="hb-other" style="height:${(b.x/mx*H).toFixed(1)}px"></span><span class="hb-offer" style="height:${(b.o/mx*H).toFixed(1)}px"></span></div>`:'').join('');
 const now=elapsed!==null&&elapsed<=maxD?`<div class="cmp-you" style="left:${(elapsed/maxD*100).toFixed(2)}%"><span>Today · day ${elapsed}</span></div>`:'';
 el.innerHTML=`<div class="wait-stats"><div><span>Typical wait</span><strong>${med} days</strong><small>median</small></div><div><span>Most heard between</span><strong>${p25}–${p75} days</strong><small>middle half</small></div>${user!==null?`<div><span>Likely window for you</span><strong>${dShort(user+p25*864e5)} – ${dShort(user+p75*864e5)}</strong><small>if your wait is typical</small></div>`:''}</div>
 <div class="cmp-strip" style="height:${H+28}px">${bars}${now}</div><div class="cmp-axis"><span>0 days</span><span>${Math.round(maxD/2)}</span><span>${maxD} days</span></div>
 <p class="cmp-sum">Based on ${fmt(pool.length)} ${scope}. ${heardBy!==null?`By day ${elapsed}, <strong>${heardBy} of ${pool.length}</strong> (${Math.round(heardBy/pool.length*100)}%) had heard back. `:''}<span class="muted">Green = offers, blue = other decisions.</span>${more}</p>
 <p class="cmp-disclaimer">Self-reported dates, often from people who heard early. Programs release decisions in batches, so your wait can be very different. Not a prediction.</p>`;}
function waitSuggest(){const q=$('#wait-search').value.trim().toLowerCase(),el=$('#wait-suggest');if(!q){el.innerHTML='';return;}const idx=progReports();
 const toks=q.split(/\s+/).filter(Boolean);const hits=catalogPrograms.filter(p=>{if(p.isSourceCollection||!idx.has(p.id))return false;const t=[pname(p),p.university,...(p.aliases||[])].join(' ').toLowerCase();return toks.every(k=>t.includes(k));}).sort((a,b)=>idx.get(b.id).length-idx.get(a.id).length).slice(0,6);
 el.innerHTML=hits.map(p=>`<button data-wait-pick="${esc(p.id)}"><strong>${esc(pname(p))}</strong><span>${esc(p.university)} · ${fmt(idx.get(p.id).length)} reports</span></button>`).join('')||`<p class="fine">No matching programs${ALLY()?'':` with Fall ${CUR()} reports. <button class="db-link" data-archive="load">Load all years</button>`}.</p>`;}
// ---- Global search (Ctrl+K) ------------------------------------------------
let pageMap=null;const loadMap=()=>pageMap?Promise.resolve(pageMap):fetch('programs/map.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{programs:{},schools:{}}).catch(()=>({programs:{},schools:{}})).then(m=>pageMap=m);
const VIEWS=[['Explore reports','view:explorer','Charts, filters and every receipt'],['Compare my average','view:compare','Where your average sits among reported offers'],['Offer tracker','view:tracker','Which programs have sent offers this cycle'],['When will I hear back?','view:tracker#wait','Typical wait from application to decision'],['Programs','view:catalog','Browse every program'],['Sources & credits','view:sources','Where the data comes from'],['Guides','view:guides','Top 6, OUAC, AIF, Kira, Casper explained'],['Changelog','view:changelog','What’s new on Offer Atlas'],['Weekly recap image','recap','Make a shareable image of this week']];
let gsItems=[],gsSel=0;
function gsSearch(){const q=$('#gs-input').value.trim().toLowerCase(),toks=q.split(/\s+/).filter(Boolean),idx=progReports(),out=[];
 const match=t=>toks.every(k=>t.includes(k));
 for(const [label,act,sub] of VIEWS)if(!q||match((label+' '+sub).toLowerCase()))out.push({type:'Page',label,sub,act,score:q?(label.toLowerCase().startsWith(q)?3:1):0});
 if(q){for(const p of catalogPrograms){if(p.isSourceCollection||!idx.has(p.id))continue;const n=pname(p),t=[n,p.university,...(p.aliases||[])].join(' ').toLowerCase();if(!match(t))continue;out.push({type:'Program',label:n,sub:`${p.university} · ${fmt(idx.get(p.id).length)} reports`,act:'prog:'+p.id,score:(n.toLowerCase().startsWith(toks[0])?2:1)+Math.min(1,idx.get(p.id).length/200)});}
  const seen=new Set(out.filter(x=>x.type==='Program').map(x=>x.act.slice(5)));for(const [id,slug,n,uni,cnt] of (pageMap?.list||[])){if(seen.has(id))continue;if(!match([n,uni].join(' ').toLowerCase()))continue;out.push({type:'Program',label:n,sub:`${uni} · ${fmt(cnt)} reports (all years)`,act:'prog:'+id,score:(n.toLowerCase().startsWith(toks[0])?2:1)+Math.min(1,cnt/200)});}
  const unis=new Set([...reports.map(r=>r.university),...(pageMap?.list||[]).map(x=>x[3])]);for(const u of unis)if(match(u.toLowerCase()))out.push({type:'School',label:u,sub:'All programs at this school',act:'uni:'+u,score:u.toLowerCase().startsWith(toks[0])?2.5:1.5});}
 gsItems=out.sort((a,b)=>b.score-a.score).slice(0,q?14:9);gsSel=0;gsDraw();}
function gsDraw(){$('#gs-results').innerHTML=gsItems.map((x,i)=>`<li><button class="gs-item${i===gsSel?' sel':''}" data-gs="${i}"><span class="gs-type ${x.type}">${x.type}</span><span class="gs-text"><strong>${esc(x.label)}</strong><small>${esc(x.sub)}</small></span>${x.type==='Program'?`<span class="gs-hint">${pageMap?.programs?.[x.act.slice(5)]?'Program page →':'Explore →'}</span>`:''}</button></li>`).join('')||`<li class="gs-none">No matches${ALLY()?'':` in Fall ${CUR()} data. <button class="db-link" data-archive="load">Load all years</button>`}</li>`;$('#gs-results .sel')?.scrollIntoView({block:'nearest'});}
function gsGo(i){const x=gsItems[i];if(!x)return;$('#search-dialog').close();const [k,v]=[x.act.split(':')[0],x.act.slice(x.act.indexOf(':')+1)];
 if(k==='view'){const [view,anchor]=v.split('#');setView(view,true);if(anchor)setTimeout(()=>$('#'+anchor+'-panel')?.scrollIntoView({behavior:'smooth'}),50);else document.querySelector('.view:not([hidden])')?.scrollIntoView({behavior:'auto'});}
 else if(k==='href')location.href=v;else if(k==='recap')weeklyRecap();
 else if(k==='prog'){const slug=pageMap?.programs?.[v];if(slug)location.href='programs/'+slug+'/';else{filters.programs=[v];filters.university='All';sync();picker();render();setView('explorer');$('#workspace').scrollIntoView({behavior:'auto'});}}
 else if(k==='uni'){filters.university=v;filters.programs=[];sync();picker();render();setView('explorer');$('#workspace').scrollIntoView({behavior:'auto'});}}
async function gsOpen(){gc('search-open','Open search',true);const d=$('#search-dialog');if(!d.open)d.showModal();$('#gs-input').value='';gsSearch();$('#gs-input').focus();await loadMap();gsSearch();}
// ---- Weekly recap image ----------------------------------------------------
async function weeklyRecap(){gc('weekly-recap','Weekly recap image',true);const cy=CUR(),today=torDay(Date.now()),start=today-6*864e5,inWeek=t=>{const d=torDay(t);return d>=start&&d<=today;};
 const cur=reports.filter(r=>r.year===cy).map(r=>[r,subTime(r)]).filter(x=>x[1]),wk=cur.filter(x=>inWeek(x[1]));
 const offers=wk.filter(([r])=>r.outcome==='Offer'),rej=wk.filter(([r])=>r.outcome==='Rejected').length;
 const byProg=new Map();for(const [r] of offers){const k=r.isSourceCollection?(r.submittedProgram||r.programName)+'|'+r.university:r.program;const e=byProg.get(k)||{n:0,name:r.isSourceCollection?(r.submittedProgram||r.programName):r.programName,uni:r.university};e.n++;byProg.set(k,e);}
 const top=[...byProg.values()].sort((a,b)=>b.n-a.n).slice(0,4);
 const firstSeen=new Map();for(const [r,t] of cur)if(r.outcome==='Offer'&&!r.isSourceCollection){const f=firstSeen.get(r.program);if(!f||t<f.t)firstSeen.set(r.program,{t,name:r.programName,uni:r.university});}
 const firsts=[...firstSeen.values()].filter(f=>inWeek(f.t)).slice(0,4);
 const dayCount=Array(7).fill(0);for(const [,t] of wk)dayCount[new Date(torDay(t)).getUTCDay()]++;const busiest=dayCount.indexOf(Math.max(...dayCount));
 const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 const c=document.createElement('canvas');c.width=1080;c.height=1350;const x=c.getContext('2d'),F='Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';
 const g=x.createLinearGradient(0,0,0,1350);g.addColorStop(0,'#162840');g.addColorStop(1,'#0b1626');x.fillStyle=g;x.fillRect(0,0,1080,1350);
 x.fillStyle='#d6f46a';x.beginPath();x.roundRect(80,80,80,80,22);x.fill();x.fillStyle='#162840';x.font=`900 50px ${F}`;x.textAlign='center';x.fillText('↗',120,138);x.textAlign='left';
 x.fillStyle='#fff';x.font=`850 40px ${F}`;x.fillText('OFFER ATLAS',184,118);x.fillStyle='#9fb0c6';x.font=`600 28px ${F}`;x.fillText(`Weekly recap · ${dShort(start)}–${dShort(today)}`,184,156);
 x.font=`850 78px ${F}`;x.fillStyle='#fff';x.fillText('This week in ',80,290);{const w=x.measureText('This week in ').width;x.fillStyle='#e0314b';x.fillText('Ontario',80+w,290);}x.fillStyle='#d6f46a';x.fillText(`Fall ${cy} admissions`,80,378);
 const box=(lab,val,bx,by,w,col)=>{x.fillStyle='#21385a';x.beginPath();x.roundRect(bx,by,w,170,26);x.fill();x.fillStyle='#9fb0c6';x.font=`700 24px ${F}`;x.fillText(lab,bx+30,by+52);x.fillStyle=col;x.font=`850 70px ${F}`;x.fillText(val,bx+30,by+136);};
 box('NEW REPORTS',fmt(wk.length),80,430,290,'#fff');box('OFFERS',fmt(offers.length),395,430,290,'#4fd69c');box('REJECTIONS',fmt(rej),710,430,290,'#ff7d92');
 let y=680;x.fillStyle='#9fb0c6';x.font=`700 26px ${F}`;x.fillText('MOST NEW OFFERS',80,y);y+=20;
 const fit=(t,w)=>{let s=t;while(x.measureText(s).width>w&&s.length>4)s=s.slice(0,-2);return s===t?t:s.trimEnd()+'…';};
 if(!top.length){y+=60;x.fillStyle='#b8c4d6';x.font=`600 34px ${F}`;x.fillText('No offers reported yet this week.',80,y);}
 for(const t of top){y+=74;x.fillStyle='#fff';x.font=`750 36px ${F}`;x.fillText(fit(t.name,700),80,y);x.fillStyle='#9fb0c6';x.font=`500 26px ${F}`;x.fillText(fit(t.uni,700),80,y+32);x.fillStyle='#4fd69c';x.font=`850 40px ${F}`;x.textAlign='right';x.fillText(`+${t.n}`,1000,y+10);x.textAlign='left';y+=26;}
 const LIMIT=1205;y+=56;if(firsts.length&&y+70<LIMIT){x.fillStyle='#9fb0c6';x.font=`700 26px ${F}`;x.fillText('FIRST OFFERS OF THE CYCLE',80,y);x.fillStyle='#fff';x.font=`600 30px ${F}`;for(const f of firsts){if(y+44>LIMIT-40)break;y+=44;x.fillText(fit(`★ ${f.name} · ${f.uni}`,920),80,y);}y+=12;}
 if(wk.length&&y+50<=LIMIT){y+=50;x.fillStyle='#b8c4d6';x.font=`600 30px ${F}`;x.fillText(`Busiest day: ${DAYS[busiest]}`,80,y);}
 x.fillStyle='#d6f46a';x.font=`800 38px ${F}`;x.fillText('offeratlas.github.io',80,1270);x.fillStyle='#8193ab';x.font=`500 22px ${F}`;x.fillText('Self-reported & unverified · data: r/OntarioGrade12s spreadsheet',80,1306);
 const blob=await new Promise(r=>c.toBlob(r,'image/png')),url=URL.createObjectURL(blob),file=new File([blob],`offer-atlas-weekly-recap-${new Date(today).toISOString().slice(0,10)}.png`,{type:'image/png'});
 const d=$('#share-dialog');$('#share-img').src=url;$('#share-title').textContent=`Weekly recap · ${dShort(start)}–${dShort(today)}`;$('#share-img').alt='Weekly recap image';
 $('#share-download').onclick=()=>{const a=document.createElement('a');a.href=url;a.download=file.name;a.click();};
 const can=navigator.canShare&&navigator.canShare({files:[file]});$('#share-native').hidden=!can;$('#share-native').onclick=()=>navigator.share({files:[file],title:'Offer Atlas weekly recap'}).catch(()=>{});
 $('#share-size').textContent='Sized for Instagram feed posts (1080×1350). Covers the last 7 days of reports.';if(!d.open)d.showModal();}
// ---- Events ----------------------------------------------------------------
document.addEventListener('click',e=>{const t=e.target;
 const wp=t.closest('[data-wait-pick]');if(wp){wait.pid=wp.dataset.waitPick;store.set('offeratlas.wait',wait);$('#wait-search').value='';waitSuggest();waitRender();return;}
 if(t.closest('[data-wait-clear]')){wait.pid=null;store.set('offeratlas.wait',wait);waitRender();return;}
 const gi=t.closest('[data-gs]');if(gi){gsGo(+gi.dataset.gs);return;}
 if(t.closest('#search-open')){gsOpen();return;}
 if(t.closest('[data-recap]')){weeklyRecap();return;}
},true);
document.addEventListener('keydown',e=>{const typing=!!e.target?.matches?.('input,textarea,select,[contenteditable]');
 if((e.key==='k'||e.key==='K')&&(e.ctrlKey||e.metaKey)){e.preventDefault();gsOpen();return;}
 if(e.key==='/'&&!typing){e.preventDefault();gsOpen();return;}
 if($('#search-dialog').open&&e.target.id==='gs-input'){if(e.key==='ArrowDown'){e.preventDefault();gsSel=Math.min(gsItems.length-1,gsSel+1);gsDraw();}else if(e.key==='ArrowUp'){e.preventDefault();gsSel=Math.max(0,gsSel-1);gsDraw();}else if(e.key==='Enter'){e.preventDefault();gsGo(gsSel);}}});

// ---- Guides & Changelog tabs (content shared with the standalone pages) ----
const fragLoaded={};
async function loadFragment(view){const el=$('#'+view+'-body');if(!el||fragLoaded[view])return;fragLoaded[view]=true;
 try{const r=await fetch(`${view}/fragment.html`,{cache:'no-cache'});if(!r.ok)throw 0;el.innerHTML=(await r.text()).replace(/<h1>[\s\S]*?<\/h1>/,'').replace(/<p class="pg-sub">[\s\S]*?<\/p>/,'').replace(/<script[\s\S]*?<\/script>/g,'');}
 catch{fragLoaded[view]=false;el.innerHTML=`<p class="fine">Couldn’t load this page. <a href="${view}/">Open it here</a>.</p>`;}}
document.addEventListener('click',e=>{const a=e.target.closest('#guides-view a, #changelog-view a');if(!a)return;const h=a.getAttribute('href')||'';
 if(h.startsWith('#')&&!['#explorer','#compare','#tracker','#catalog','#entering','#sources','#guides','#changelog','#search'].includes(h)){e.preventDefault();document.getElementById(h.slice(1))?.scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(h.startsWith('/#')){e.preventDefault();setView(h.slice(2),true);document.querySelector('.view:not([hidden])')?.scrollIntoView({behavior:'auto',block:'start'});}},true);

function all(){syncYearsToggle();progIndex=null;indexData();controls();picker();render();catalog();sources();credits();freshness();fresh();watchStrip();if(!$('#compare-view').hidden){compareRender();cmpSuggest();}if(!$('#tracker-view').hidden){trackerRender();waitRender();}}
$('#reload').addEventListener('click',async()=>{const ok=await loadSnapshot();all();notify(ok?'Loaded the latest saved data.':'Saved data unavailable. Please try again.');});
$('#evidence-dialog').addEventListener('close',()=>writeUrl());
const filtersBox=$('.filters');if(PHONE.matches)filtersBox.classList.add('collapsed');
$('#filters-toggle').addEventListener('click',()=>{const c=filtersBox.classList.toggle('collapsed');$('#filters-toggle').setAttribute('aria-expanded',String(!c));$('#filters-toggle').textContent=c?'Show filters':'Hide filters';});
let phoneMode=PHONE.matches,resizeTimer;const modeCheck=()=>{if(PHONE.matches!==phoneMode){phoneMode=PHONE.matches;averages(lastRows);}};PHONE.addEventListener('change',modeCheck);addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(modeCheck,200);});
applyTheme();matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);$('#theme-toggle').addEventListener('click',()=>{const t=store.get('offeratlas.theme','light');store.set('offeratlas.theme',THEMES[(THEMES.indexOf(t)+1)%3]);applyTheme();});
$('#cmp-avg').addEventListener('input',e=>{gcOnce('compare-average');const v=e.target.value;cmp.avg=v===''?null:Number(v);saveCmp();compareRender();});$('#cmp-scope').addEventListener('change',e=>{cmp.scope=e.target.value;saveCmp();if(cmp.scope!=='cur'&&!ALLY())requestArchive({quiet:true});compareRender();});$('#cmp-search').addEventListener('input',cmpSuggest);
for(const id of ['trk-search','trk-sort','trk-status','trk-watch'])$('#'+id).addEventListener(id==='trk-search'?'input':'change',()=>{trkLimit=60;trackerRender();});$('#trk-more').addEventListener('click',()=>{trkLimit+=60;trackerRender();});$('#close-share').addEventListener('click',()=>$('#share-dialog').close());
$('#wait-search').addEventListener('input',waitSuggest);$('#wait-date').addEventListener('change',e=>{wait.date=e.target.value;store.set('offeratlas.wait',wait);waitRender();});$('#gs-input').addEventListener('input',gsSearch);$('#close-search').addEventListener('click',()=>$('#search-dialog').close());
$('#copy-view')?.addEventListener('click',()=>copyText(urlFor(filters,null),'Link to this view copied'));
for(const id of ['avg-lo','avg-hi'])$('#'+id).addEventListener('input',()=>{let a=+$('#avg-lo').value,b=+$('#avg-hi').value;if(a>b){if(id==='avg-lo')a=b;else b=a;}setRange(a,b);});
$('#avg-presets').addEventListener('click',e=>{const b=e.target.closest('[data-avg]');if(!b)return;const [x,y]=b.dataset.avg.split('-').map(Number);setRange(x,y);});
window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));window.addEventListener('popstate',()=>{setView(location.hash.slice(1)||'explorer');document.querySelector('.view:not([hidden])')?.scrollIntoView({behavior:'auto',block:'start'});});initEntering();all();setView(location.hash.slice(1)||'explorer');
(async()=>{const url=readUrl(),sp=new URLSearchParams(location.search);banner('hidden');const ok=await loadSnapshot();if(url.filters)filters={...baseFilters(),...url.filters};all();if(!ok)return;
 const cy=String(archiveInfo.currentYear||2027),needAll=prefGet()==='always'||(url.filters&&url.filters.year!==cy)||(url.receipt&&!rmap.has(url.receipt));
 if(needAll){const was=filters.year;await requestArchive({quiet:true});if(!url.filters&&prefGet()==='always'){filters.year='All';sync();render();}else if(url.filters){filters={...baseFilters(),...url.filters};sync();picker();render();}}else if(prefGet()!=='cur')banner('prompt');syncYearsToggle();
 if(url.receipt&&rmap.has(url.receipt)){setView('explorer');evidence(url.receipt);}
 if(sp.get('cp')){const id=sp.get('cp');if(!pmap.has(id)||!(progReports().get(id)||[]).some(r=>r.year===CUR())){if(!ALLY())await requestArchive({quiet:true});if(cmp.scope==='cur')cmp.scope='recent';}if(!cmp.programs.includes(id))cmp.programs.unshift(id);saveCmp();setView('compare');}
 if(sp.get('share')){const id=sp.get('share');if(!ALLY())await requestArchive({quiet:true});setView('explorer');shareProgram(id);}})();
