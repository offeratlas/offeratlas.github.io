import {officialProgramMap} from './official-programs.js?v=oa14';
// Presentation grouping only. Source records and identities stay unchanged in storage.
const fold=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const common={cs:'Computer Science','comp sci':'Computer Science',compsci:'Computer Science','computer sci':'Computer Science',math:'Mathematics','honours math':'Mathematics',bmos:'Management and Organizational Studies','management organizational studies':'Management and Organizational Studies','med sci':'Medical Sciences',medsci:'Medical Sciences','medical science':'Medical Sciences','health sci':'Health Sciences',healthsci:'Health Sciences','health science':'Health Sciences','life sci':'Life Sciences',lifesci:'Life Sciences','life science':'Life Sciences','biomedical science':'Biomedical Sciences','bio med science':'Biomedical Sciences','business admin':'Business Administration','business administration':'Business Administration','comp eng':'Computer Engineering','computer engineer':'Computer Engineering','computer enginnering':'Computer Engineering','mech eng':'Mechanical Engineering','soft eng':'Software Engineering','eng 1':'Engineering I','engineering 1':'Engineering I','computer science 1':'Computer Science I','rotman':'Rotman Commerce','rotman comm':'Rotman Commerce','rotmans commerce':'Rotman Commerce','rotman commercec':'Rotman Commerce'};
const waterloo={afm:'Accounting and Financial Management','accounting and finance management':'Accounting and Financial Management','accounting finance':'Accounting and Financial Management','accounting and financial management':'Accounting and Financial Management',cfm:'Computing and Financial Management',farm:'Financial Analysis and Risk Management','financial analysis risk management':'Financial Analysis and Risk Management',se:'Software Engineering',ce:'Computer Engineering',syde:'Systems Design Engineering',tron:'Mechatronics Engineering','math cpa':'Mathematics / Chartered Professional Accountancy','mathematics chartered professional accountancy':'Mathematics / Chartered Professional Accountancy','mathematics business administration':'Mathematics + Business Administration','computer science business administration':'Computer Science + Business Administration'};
export function normalizeProgram(raw,institution=''){
 let s=String(raw||'Program unstated').trim();
 s=s.replace(/^(?:university of waterloo|uwaterloo|waterloo|university of toronto|uoft|mcmaster university|university of ottawa|western university|wilfrid laurier university|york university|queen[’']?s university)\s*[-–:]*\s+/i,'');
 let initial=fold(s);if(institution==='Waterloo'&&waterloo[initial])return waterloo[initial];if(common[initial])return common[initial];
 s=s.replace(/\b(?:with|and)?\s*(?:non[- ]?co[- ]?op|no co[- ]?op|co[- ]?op(?:erative)?(?: program)?(?: only| available| option| optional)?|regular(?: stream| program| option)?|optional|honou?rs?)\b/gi,' ')
 .replace(/\b(?:bachelor(?:s|'s)? of|bachelor|bsc|hbsc|basc|bcs|bmath|ba|hba|bba|bcom|bcomm|beng|bafm|degree|program only)\b/gi,' ')
 .replace(/\([^a-z0-9]*\)/gi,' ');
 let k=fold(s).replace(/\bscence\b/g,'science').replace(/\bbachlors of\b/g,'').replace(/\benginnering\b/g,'engineering').replace(/\b(and|or|with)\s*$/,'').replace(/^and\s+/,'').trim();
 // A form label often repeats the complete program after its degree in parentheses.
 for(let repeat=0;repeat<3;repeat++){const w=k.split(' '),n=w.length;if(n%2===0&&w.slice(0,n/2).join(' ')===w.slice(n/2).join(' '))k=w.slice(0,n/2).join(' ');}
 // Remove a redundant trailing acronym, e.g. Accounting and Financial Management (AFM).
 let w=k.split(' ');if(w.length>2){const acronym=w.slice(0,-1).filter(x=>!['and','of','in','the'].includes(x)).map(x=>x[0]).join('');if(w.at(-1)===acronym)k=w.slice(0,-1).join(' ');}
 k=k.replace(/^engineering (electrical|mechanical|civil|computer|chemical|mechatronics|biomedical|software|aerospace)$/,'$1 engineering');
 k=k.replace(/\s+(?:at )?(?:wilfrid laurier university|waterloo campus|st george campus|scarborough campus|mississauga campus|including pey|with pey|pey|utsg|utsc|utm)$/,'').replace(/^studies in /,'').trim();
 if(['Waterloo','Laurier','Joint'].includes(institution)){
  const business=/business administration|\bbusiness\b|\bbba\b/.test(k);
  if(business&&/computer science/.test(k))return 'Business Administration + Computer Science (Double Degree)';
  if(business&&/financial math/.test(k))return 'Business Administration + Financial Mathematics (Double Degree)';
  if(business&&/mathematics|\bmath\b/.test(k))return 'Business Administration + Mathematics (Double Degree)';
 }
 if(institution==='Waterloo'&&waterloo[k])return waterloo[k];
 if(['UTSG','UTSC','UTM','Toronto'].includes(institution)){
  if(/^(?:track ?one)(?: undeclared)?(?: eng| engineering)?$/.test(k))return 'TrackOne (Undeclared Engineering)';
  if(['engsci','eng sci','engineering science eng sci'].includes(k))return 'Engineering Science';
  if(['mathematical and physical sciences','physical and mathematical sciences','math and phys sci','math and physical sciences','mathematics and physical sciences'].includes(k))return 'Mathematics and Physical Sciences';
  if(['life sciences including psychology','life sciences including psych','life science gateway'].includes(k))return 'Life Sciences';
 }
 if(k==='chem eng')return 'Chemical Engineering';if(k==='mech')return 'Mechanical Engineering';
 
 if(institution==='McMaster'&&k==='engineering')return 'Engineering I';
 if(institution==='Queens'&&['smith engineering common first year','smith engineering','engineering common first year'].includes(k))return 'Engineering';
 if(institution==='Western'&&['ivey','aeo','ivey aeo','ivey advanced entry opportunity'].includes(k))return 'Ivey AEO';
 if(common[k])return common[k];
 return k? k.split(' ').map(x=>['and','of','in','at','for','with'].includes(x)?x:x.length===1?x.toUpperCase():x[0].toUpperCase()+x.slice(1)).join(' '):'Program unstated';
}
export function inferStudyMode(raw){
 const s=fold(raw);
 if(/co op.*(?:and|or).*regular|regular.*(?:and|or).*co op|co op.*non co op|both/.test(s))return 'Unstated';
 if(/\b(non co op|non coop|noncoop|no co op|no coop|without co op|without coop|regular)\b/.test(s))return 'Non-co-op';
 if(/\b(optional|available|option)\b/.test(s))return 'Unstated';
 if(/\b(co op|coop|cooperative)\b/.test(s))return 'Co-op';
 return 'Unstated';
}
export function matchesStudyMode(r,mode='Both'){return mode==='Both'||!mode||r.studyMode===mode;}
export function buildProgramCatalog(rawPrograms,rawReports,sources){
 const original=new Map(rawPrograms.map(p=>[p.id,p])),groups=new Map(),views=[];
 // Only names with official evidence enter the catalog. A new source label can
 // reuse an unambiguous previously audited alias; it cannot invent a program.
 const aliases=new Map();
 const addAlias=(inst,label,m)=>{const k=inst+'|'+fold(normalizeProgram(label,inst));const old=aliases.get(k);if(old===undefined)aliases.set(k,m);else if(old&&old.id!==m.id)aliases.set(k,null);};
 for(const p of rawPrograms){const m=officialProgramMap[p.id]||p.officialProgramMapping;if(m){addAlias(p.institutionId||'Waterloo',p.name,m);addAlias(p.institutionId||'Waterloo',m.name,m);}}
 for(const r of rawReports){
  const sourceProgram=r.sourceProgram||r.program,p=original.get(sourceProgram);if(!p)throw new Error('Source program is missing for '+r.id);
  const institution=r.institutionId||p.institutionId||'Waterloo',university=r.university||p.university||'University of Waterloo';
  const submitted=sources[r.source]?.rawProgram||p.name;
  const audited=p.officialProgramMapping||officialProgramMap[sourceProgram];
  const m=audited===undefined?aliases.get(institution+'|'+fold(normalizeProgram(p.name,institution))):audited;
  const isSourceCollection=!m;
  const name=m?m.name:'Source reports without a single program assignment';
  const id=m?'OFFICIAL_'+institution+'__'+fold(m.name).replaceAll(' ','_'):'SOURCE_'+institution;
  if(!groups.has(id))groups.set(id,{...p,id,name,displayName:name,university,institutionId:institution,aliases:[],sourcePrograms:[],isSourceCollection,url:m?.url||p.url,verification:m?'Official catalog match':'Source records',verificationNote:m?'Mapped to the official university program name. '+m.reason+'. Source wording is preserved in evidence.':'The source does not yet identify one official program confidently. These records remain searchable and browsable without becoming invented program names.',officialCatalog:m?.catalog,officialChecked:m?.checked,admissionNote:m?.admissionNote,unavailableIntakes:m?.unavailableIntakes});
  const g=groups.get(id);if(!g.sourcePrograms.includes(sourceProgram)){g.sourcePrograms.push(sourceProgram);g.aliases.push(p.name);}
  const studyMode=r.studyMode&&['Co-op','Non-co-op','Unstated'].includes(r.studyMode)?r.studyMode:inferStudyMode(submitted);
  views.push({...r,sourceProgram,program:id,programName:name,university,institutionId:institution,submittedProgram:submitted,studyMode,programVerified:!isSourceCollection,isSourceCollection,reviewFlags:[...(r.reviewFlags||[]),...(m?.unavailableIntakes?.includes(r.year)?['Reported intake conflicts with the official admission pause. Source claim is preserved, not authenticated.']:[])]});
 }
 return {programs:[...groups.values()],reports:views};
}
