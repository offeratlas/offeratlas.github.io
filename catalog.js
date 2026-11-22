import {officialProgramMap} from './official-programs.js?v=oa50';
// Presentation grouping only. Source records and identities stay unchanged in storage.
const fold=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const common={cs:'Computer Science','comp sci':'Computer Science',compsci:'Computer Science','computer sci':'Computer Science',math:'Mathematics','honours math':'Mathematics',bmos:'Management and Organizational Studies','management organizational studies':'Management and Organizational Studies','med sci':'Medical Sciences',medsci:'Medical Sciences','medical science':'Medical Sciences','health sci':'Health Sciences',healthsci:'Health Sciences','health science':'Health Sciences','life sci':'Life Sciences',lifesci:'Life Sciences','life science':'Life Sciences','biomedical science':'Biomedical Sciences','bio med science':'Biomedical Sciences','business admin':'Business Administration','business administration':'Business Administration','comp eng':'Computer Engineering','computer engineer':'Computer Engineering','computer enginnering':'Computer Engineering','mech eng':'Mechanical Engineering','soft eng':'Software Engineering','eng 1':'Engineering I','engineering 1':'Engineering I','computer science 1':'Computer Science I','rotman':'Rotman Commerce','rotman comm':'Rotman Commerce','rotmans commerce':'Rotman Commerce','rotman commercec':'Rotman Commerce'};
const waterloo={afm:'Accounting and Financial Management','accounting and finance management':'Accounting and Financial Management','accounting finance':'Accounting and Financial Management','accounting and financial management':'Accounting and Financial Management',cfm:'Computing and Financial Management',farm:'Financial Analysis and Risk Management','financial analysis risk management':'Financial Analysis and Risk Management',se:'Software Engineering',ce:'Computer Engineering',syde:'Systems Design Engineering',tron:'Mechatronics Engineering','math cpa':'Mathematics / Chartered Professional Accountancy','mathematics chartered professional accountancy':'Mathematics / Chartered Professional Accountancy','mathematics business administration':'Mathematics + Business Administration','computer science business administration':'Computer Science + Business Administration'};
const ACR=new Set(['llb','bmos','mos','aeo','cs','ai','ml','ece','it','ux','pey','ib','ap','bba','bcom','bsc','ba']);
// Labels that only name a school or campus are not program names.
const PLACE=new Set(['wilfrid','laurier','waterloo','toronto','st','george','university','campus','western','queens','mcmaster','ottawa','york','uoft','scarborough','mississauga','of']);

// ---- Display tidying for applicant-typed names: "occupational health and safety" -> "Occupational Health and Safety",
// "BMOS + IVEY AEO" -> "BMOS + Ivey AEO", "cs coop" -> "CS Co-op". The raw wording stays in the source record.
export const CANON={cs:'CS',bcs:'BCS',bba:'BBA',bsc:'BSc',bscn:'BScN',bsch:'BScH',hbsc:'HBSc',ba:'BA',bah:'BAH',hba:'HBA',bcom:'BCom',bcomm:'BComm',beng:'BEng',basc:'BASc',bmath:'BMath',bhsc:'BHSc',bkin:'BKin',bmos:'BMOS',mos:'MOS',
 bfa:'BFA',bes:'BES',bed:'BEd',llb:'LLB',ma:'MA',aeo:'AEO',afm:'AFM',sfm:'SFM',cfm:'CFM',farm:'FARM',se:'SE',ce:'CE',ee:'EE',ece:'ECE',syde:'SYDE',mse:'MSE',bme:'BME',it:'IT',ai:'AI',ml:'ML',ux:'UX',ib:'IB',ap:'AP',pey:'PEY',dd:'DD',
 utsg:'UTSG',utsc:'UTSC',utm:'UTM',uw:'UW',wlu:'WLU',tmu:'TMU',ubc:'UBC',ubcv:'UBCV',ubco:'UBCO',sfu:'SFU',uvic:'UVic',uoft:'UofT',uottawa:'uOttawa',uwo:'UWO',ocad:'OCAD',mcmaster:'McMaster',mcgill:'McGill',
 iveyaeo:'Ivey AEO',ibiomed:'iBioMed',ibio:'iBio',ivey:'Ivey',coop:'Co-op','co-op':'Co-op',stem:'STEM',pph:'PPH',ppe:'PPE',ppm:'PPM',gis:'GIS',hr:'HR',ii:'II',iii:'III',iv:'IV',
 buisness:'Business',bussiness:'Business',concurent:'Concurrent',enginnering:'Engineering',engineeering:'Engineering',scence:'Science',managment:'Management',psycology:'Psychology',kinesology:'Kinesiology',honors:'Honours',cpa:'CPA',mba:'MBA',rn:'RN',ibh:'IBH',gbda:'GBDA',cam:'CAM',btm:'BTM',msc:'MSc',phd:'PhD',bcomp:'BComp',bmus:'BMus',bjour:'BJour',bsw:'BSW',bpe:'BPE',bph:'BPH',bpharm:'BPharm',hbcomm:'HBComm',lpn:'LPN',arte:'Arts',sante:'Santé',genie:'Génie',etudes:'Études'};
export const SMALL=new Set(['and','or','of','in','the','for','with','at','to','a','an','on','by','vs','via','from','into','w/','de','la','le','les','du','des','et','en']);
export function tidyName(raw){
 let s=String(raw??'').replace(/:[A-Za-z0-9_]+:/g,' ').replace(/\bw\s?\/\s?/gi,'with ').replace(/\s+/g,' ').replace(/\(\s+/g,'(').replace(/\s+\)/g,')').replace(/\s+([,;:.])/g,'$1').replace(/([a-z])\(/gi,'$1 (').replace(/(\w)-\s*\(/g,'$1 (').replace(/\s+[-–]\s+/g,' – ').trim().replace(/^[\W_]+(?=\w)/,'').replace(/[\s,;:\-–]+$/,'');
 if(!s||!/[a-z]/i.test(s))return s;
 const letters=s.replace(/[^A-Za-z]/g,''),shouting=letters.length>6&&letters===letters.toUpperCase();
 let first=true;
 return s.replace(/[A-Za-z][A-Za-z'’.\-]*/g,w=>{
  const low=w.toLowerCase(),bare=low.replace(/[.'’]+$/,'');
  let out;
  if(CANON[bare]!==undefined)out=CANON[bare]+w.slice(bare.length);
  else if(w===low||(shouting&&w===w.toUpperCase()&&(w.length>3||SMALL.has(low))))out=(!first&&SMALL.has(low))?low:low.split('-').map(p=>p?p[0].toUpperCase()+p.slice(1):p).join('-');
  else out=w;                                   // mixed case typed on purpose (e.g. "McMaster") is kept
  first=false;return out;});
}
// Drop a leading school name the applicant repeated, e.g. 'University of Guelph - Food Science'.
export function tidySubmitted(raw,university){let s=tidyName(raw);const u=String(university||'').split(/\s*[·(]/)[0].trim();if(u&&s.toLowerCase().startsWith(u.toLowerCase())){const rest=s.slice(u.length).replace(/^[\s–:,-]+/,'');if(rest.length>2)s=rest;}return s;}
export function tidyLabel(raw){const s=String(raw??'').replace(/\s+/g,' ').trim();return /^[a-z]/.test(s)?s[0].toUpperCase()+s.slice(1):s;}
// Official names corrected after checking OUInfo (the OUAC listing students apply through) and university pages.
// Keyed by official program id. Only the displayed name changes; ids and page addresses stay the same.
export const NAME_FIX={"UTSG__85128c3d820a085e":"Mathematical & Physical Sciences","Toronto__85128c3d820a085e":"Mathematical & Physical Sciences","UTSG__062cef1d819fdf6b":"Life Sciences (including Psychology)","UTSG__4252a6211518468e":"TrackOne, Undeclared","Toronto__4252a6211518468e":"TrackOne, Undeclared","UTM__02d0779148771712":"Forensic Sciences","Toronto__02d0779148771712":"Forensic Sciences","UTM__f054cfcb3f1cdb5c":"Psychological and Brain Sciences","Toronto__f054cfcb3f1cdb5c":"Psychological and Brain Sciences","Brock__9a2a5415a3b81a5c":"Business Administration Co-op International Dual Degree","Western__53359464729b35b8":"Media & Communications Studies","KingsWestern__958370d5cf908e62":"Social Sciences","York__dc3d37ad2c3721a0":"Human Resources Management","York__184782d1c37ac1ca":"Nursing (Direct Entry)","Queens__9a21f2be04a26ef5":"Commerce","McMaster__8896ff85d99044c3":"Economics I","Carleton__0729b81afda020e9":"Nursing with RN Prescribing","Guelph__df166014d3a3324b":"Biosystems Engineering","Ottawa__a3d8ad64e4b4cdb9":"Biopharmaceutical Sciences","Ottawa__c29d57b2fd24ee6e":"Commerce – Accounting","Ottawa__2ddced71127dfc6c":"Commerce – Finance","Ottawa__e47d775119699f43":"Civil Engineering and Computing Technology","Ottawa__4a32474a7589d3bc":"Mechanical Engineering and Computing Technology","Ottawa__fc4c93fb9fab162d":"Chemical Engineering and Computing Technology","Ottawa__d050e2e1e33b8a8a":"Electrical Engineering and Computing Technology","Ottawa__fce37b2c8291935e":"Biomedical Mechanical Engineering and Computing Technology","Ottawa__624ab8ad78a771e1":"Physics and Electrical Engineering","Ottawa__b3e23a5dce1dae0d":"Data Science – Computer Science and Mathematics","Ottawa__86909aaaa3b46b53":"Second Language Teaching (FLS)","Ottawa__c3d8e3226e37a234":"Human Kinetics – Bachelor of Science","Ottawa__3b5ad77321f08366":"Computer Science and Mathematics","Ottawa__79cc543e644ae442":"Communication and Political Science","Ottawa__df21f8eb03371449":"Economics and Political Science","Ottawa__d5a49c61fe6e9d89":"History and Political Science","Ottawa__49c251de30fb1f64":"Mathematics and Economics","Ottawa__f28ff5f82f5cca2c":"Public Administration and Political Science"};
export function normalizeProgram(raw,institution=''){
 let s=String(raw||'Program unstated').trim();
 s=s.replace(/^(?:university of waterloo|uwaterloo|waterloo|university of toronto|uoft|mcmaster university|mcmaster|university of ottawa|uottawa|western university|western|wilfrid laurier university|laurier|york university|queen[’']?s university|queen[’']?s|mcgill university|mcgill|ubc|tmu|carleton university|carleton)\s*[-–:]*\s+(?=\S+\s*\S)/i,'');
 s=s.replace(/^(?:bachelor|honours?|hon\.?)[^(]*\((?:major|majoring)(?: in)?\s+([^)]+)\)\s*$/i,'$1').replace(/\((?:major|majoring)(?: in)?\s+([^)]+)\)/i,' $1 ').replace(/\b(?:major|majoring) in\b/i,' ');
 let initial=fold(s);if(institution==='Waterloo'&&waterloo[initial])return waterloo[initial];if(common[initial])return common[initial];
 s=s.replace(/\b(?:including|with)?\s*(?:an? )?(?:optional )?internship(?: option| year)?\b/gi,' ');
 s=s.replace(/\b(?:with|and)?\s*(?:non[- ]?co[- ]?op|no co[- ]?op|co[- ]?op(?:erative)?(?: program)?(?: only| available| option| optional)?|regular(?: stream| program| option)?|optional|honou?rs?)\b/gi,' ')
 .replace(/\b(?:bachelor(?:s|'s)? of|bachelor|bsc|hbsc|basc|bcs|bmath|ba|hba|bba|bcom|bcomm|beng|bengm|bafm|bacc|bkin|bscn|bcmph|bcmp|bhsc|bmsc|bes|bas|bfa|bmus|bed|bsch|bhsch|degree|program only|direct entry)\b/gi,' ')
 .replace(/\([^a-z0-9]*\)/gi,' ');
 let k=fold(s).replace(/\bscence\b/g,'science').replace(/\bbachlors of\b/g,'').replace(/\benginnering\b/g,'engineering').replace(/\barte\b/g,'arts').replace(/\bengineering l\b/g,'engineering i').replace(/^eng(?:ineering)? 1$/,'engineering i').replace(/\b(and|or|with)\s*$/,'').replace(/^and\s+/,'').trim();
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
 if(/^UBC/.test(institution)){if(/\bsauder\b/.test(k)||k==='commerce')return 'Commerce';if(/^applied science(?: engineering)?$/.test(k))return 'Engineering';}
 if(institution==='Queens'){k=k.replace(/^smith engineering (?=\S+ \S)/,'');if(k==='ece')return 'Electrical and Computer Engineering';}
 if(institution==='Queens'&&['smith engineering common first year','smith engineering','engineering common first year'].includes(k))return 'Engineering';
 if(institution==='Western'&&['ivey','aeo','ivey aeo','ivey advanced entry opportunity'].includes(k))return 'Ivey AEO';
 if(common[k])return common[k];
 k=k.replace(/^in /,'');
 return k? k.split(' ').map(x=>ACR.has(x)?x.toUpperCase():['and','of','in','at','for','with','or'].includes(x)?x:x.length===1?x.toUpperCase():x[0].toUpperCase()+x.slice(1)).join(' '):'Program unstated';
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
// Word-set key: 'Science, Computer' and 'Computer Science' match; filler words are ignored.
const STOP=new Set(['and','of','in','the','major','with','for','a','at','on','program','studies','general','honours','honors']);
const SYN={'1':'i',biochem:'biochemistry',aeo:'advanced entry opportunity',comp:'computer',sci:'science',eng:'engineering',w:'',including:'',internship:'',smith:'',option:'',optional:'',bsch:'',bhsch:'',school:''};
const tokKey=s=>[...new Set(fold(s).split(' ').flatMap(w=>(w in SYN?SYN[w]:w).split(' ')).filter(w=>w&&!STOP.has(w)))].sort().join(' ');
// A name written the same way by at least this many reports at one school becomes a browsable "reported name" program.
export const REPORTED_MIN=3;
export function buildProgramCatalog(rawPrograms,rawReports,sources){
 const original=new Map(rawPrograms.map(p=>[p.id,p])),groups=new Map(),views=[];
 // Only names with official evidence enter the catalog. A new source label can
 // reuse an unambiguous previously audited alias; it cannot invent a program.
 const aliases=new Map();
 const addAlias=(inst,label,m)=>{const k=inst+'|'+fold(normalizeProgram(label,inst));const old=aliases.get(k);if(old===undefined)aliases.set(k,m);else if(old&&old.id!==m.id)aliases.set(k,null);};
 for(const p of rawPrograms){const m=officialProgramMap[p.id]||p.officialProgramMapping;if(m){addAlias(p.institutionId||'Waterloo',p.name,m);addAlias(p.institutionId||'Waterloo',m.name,m);}}
 const tokMap=new Map();for(const [k,m] of aliases){if(!m)continue;const i=k.indexOf('|'),t=k.slice(0,i)+'|'+tokKey(k.slice(i+1));const old=tokMap.get(t);if(old===undefined)tokMap.set(t,m);else if(old&&old.id!==m.id)tokMap.set(t,null);}
 const resolve=r=>{const sourceProgram=r.sourceProgram||r.program,p=original.get(sourceProgram);if(!p)throw new Error('Source program is missing for '+r.id);
  const institution=r.institutionId||p.institutionId||'Waterloo',submitted=sources[r.source]?.rawProgram||p.name;
  const audited=p.officialProgramMapping||officialProgramMap[sourceProgram];
  let m=audited===undefined?aliases.get(institution+'|'+fold(normalizeProgram(p.name,institution))):audited,clean=null;
  if(!m){for(const label of [p.name,submitted]){const hit=tokMap.get(institution+'|'+tokKey(normalizeProgram(label,institution)));if(hit){m=hit;break;}}}
  if(!m){clean=normalizeProgram(submitted,institution);const tk=tokKey(clean);if(!tk||clean==='Program unstated'||tk.length<3||tk.split(' ').every(w=>PLACE.has(w)))clean=null;}
  return {sourceProgram,p,institution,submitted,m,clean};};
 const resolved=rawReports.map(resolve),cleanCount=new Map();
 for(const x of resolved)if(x.clean){const k=x.institution+'|'+tokKey(x.clean);cleanCount.set(k,(cleanCount.get(k)||0)+1);}
 rawReports.forEach((r,i)=>{const {sourceProgram,p,institution,submitted,m,clean}=resolved[i];
  const university=r.university||p.university||'University of Waterloo';
  const reported=!m&&!!clean&&cleanCount.get(institution+'|'+tokKey(clean))>=REPORTED_MIN;
  const isSourceCollection=!m&&!reported;
  const name=m?(NAME_FIX[m.id]||m.name):reported?tidyName(clean):'Source reports without a single program assignment';
  const id=m?'OFFICIAL_'+institution+'__'+fold(m.name).replaceAll(' ','_'):reported?'REPORTED_'+institution+'__'+tokKey(clean).replaceAll(' ','_'):'SOURCE_'+institution;
  if(!groups.has(id))groups.set(id,{...p,id,name,displayName:name,slugName:m?m.name:name,university,institutionId:institution,aliases:[],sourcePrograms:[],isSourceCollection,url:m?.url||p.url,reportedName:reported,verification:m?'Official catalog match':reported?'Reported program name':'Source records',verificationNote:m?'Mapped to the official university program name. '+m.reason+'. Source wording is preserved in evidence.':reported?'Grouped from how applicants wrote the program name. It is not matched to an official university program yet, so the name may be informal or combine related programs.':'The source does not yet identify one official program confidently. These records remain searchable and browsable without becoming invented program names.',officialCatalog:m?.catalog,officialChecked:m?.checked,admissionNote:m?.admissionNote,unavailableIntakes:m?.unavailableIntakes});
  const g=groups.get(id);if(!g.sourcePrograms.includes(sourceProgram)){g.sourcePrograms.push(sourceProgram);g.aliases.push(p.name);}if(m&&NAME_FIX[m.id]&&!g.aliases.includes(m.name))g.aliases.push(m.name);
  const studyMode=r.studyMode&&['Co-op','Non-co-op','Unstated'].includes(r.studyMode)?r.studyMode:inferStudyMode(submitted);
  views.push({...r,sourceProgram,program:id,programName:name,university,institutionId:institution,submittedProgram:tidySubmitted(submitted,university),rawSubmittedProgram:submitted,averageLabel:tidyLabel(r.averageLabel),studyMode,programVerified:!!m,isSourceCollection,reviewFlags:[...(r.reviewFlags||[]),...(m?.unavailableIntakes?.includes(r.year)?['Reported intake conflicts with the official admission pause. Source claim is preserved, not authenticated.']:[])]});
 });
 return {programs:[...groups.values()],reports:views};
}
