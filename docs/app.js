"use strict";
const API=IS_LOCAL?"http://localhost:8787":"https://cpbl-reserve-2026-api.cpbl-status.workers.dev";
const GN={P:"投手",C:"捕手",I:"內野手",O:"外野手"}, GEN={P:"Pitchers",C:"Catchers",I:"Infielders",O:"Outfielders"}, GORD="PCIO";
// TEAMS, NEUTRAL, deriveTheme(), themeDecls() come from theme.js (loaded first).
// ageOn(), cornerBadge(), cardNote(), isRookie() come from card.js (loaded first); mineVsFans() from mine.js.
// LIMIT comes from limit.js; FLAGS from flags.js; offAnswer() etc. from official.js (both loaded first).
// statLine(), statTier(), statsShown(), tileTitle(), playerHead(), CAP_MSG come from stats.js; saveState(), needsConfirm(),
// submitError(), sameTally(), statsStale(), hhmm() from status.js; isInAppBrowser() from flags.js (loaded first).
const EXEMPT=[["foreign","洋將"],["training","自主／自行培訓"],["fa","行使自由球員"],["expansion","擴編選秀被選走"],["removed","已非球員"]];
const $=id=>document.getElementById(id);
function el(tag,attrs={},...kids){
  const e=document.createElement(tag);
  for(const[k,v]of Object.entries(attrs)){
    if(k==="class")e.className=v;
    else if(k==="text")e.textContent=v;
    else e.setAttribute(k,v);
  }
  for(const k of kids)if(k!=null)e.append(k);
  return e;
}
// localStorage, never throwing: store(k) reads, store(k,v) writes, store(k,null) removes.
function store(k,v){
  try{
    if(v===undefined)return localStorage.getItem(k);
    if(v===null)localStorage.removeItem(k);
    else localStorage.setItem(k,v);
  }catch(e){return null}
}

// Colour mode: auto (no data-theme) / light / dark, persisted as "rl-theme" (absent = auto).
const MODE_UI={
  auto:{label:"自動（跟隨系統）",svg:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/></svg>'},
  light:{label:"淺色",svg:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>'},
  dark:{label:"深色",svg:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>'},
};
function setMode(m){
  const r=document.documentElement,b=$("themeBtn");
  if(m==="auto")delete r.dataset.theme;else r.dataset.theme=m;
  const u=MODE_UI[m],txt="配色："+u.label;
  b.innerHTML=u.svg;b.setAttribute("aria-label",txt);b.title=txt;b.dataset.mode=m;
}
function initMode(){
  setMode(normMode(store("rl-theme")));
  $("themeBtn").addEventListener("click",()=>{
    const m=nextMode($("themeBtn").dataset.mode);
    setMode(m);
    store("rl-theme",m==="auto"?null:m);
  });
}

let DATA=null, AVAIL=[], T=null, ROSTER=[], BY={};
// officialList = parsed official list file (flag on and file found); clubKept = this team's Set of ids the club kept
let officialList=null, clubKept=null;
// saved = submitted ids (Set), null while /mine is unknown; mineFailed = the last /mine read failed with saved unknown.
// locked = the Worker says the official lists are out (single source: /mine). statsAt = last successful /stats read.
let sel=new Set(), saved=null, savedAt=null, stats=null, saving=false, statsTimer=0;
let locked=false, mineFailed=false, statsAt=0;
// lockKnown: /mine has answered at least once (until then the hero must not promise that submitting still works).
// mineSeq/statsSeq: only the latest request may write its answer; saveEpoch: a /mine that started before a
// successful submit must not overwrite it. mineRetries: timed retries after a failed /mine (online/visibility also retry).
let lockKnown=false, mineSeq=0, statsSeq=0, saveEpoch=0, mineRetries=0, mineRetryTimer=0;
const MINE_RETRY_MS=10000, MINE_RETRY_MAX=3;
// showFilter = the 顯示 select: all / kept / dropped / new
let pos="all", showFilter="all", q="", tab="pick";
// After our own submit, cached /stats (edge + browser, max-age 60s) is older than what we just wrote; bypass it for a while.
let freshUntil=0;
const FRESH_MS=65000;

function voterId(){
  let v=store("rl-voter");
  if(!v||!/^[0-9a-f-]{36}$/.test(v)){
    v=crypto.randomUUID?crypto.randomUUID()
      :"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
    store("rl-voter",v);
  }
  return v;
}
const VOTER=voterId();

function sortP(a,b){return GORD.indexOf(a.g)-GORD.indexOf(b.g)||(+a.no)-(+b.no)||a.no.length-b.no.length}
function posLabel(p){return p.p||GN[p.g]}
function keptIn(g){let n=0;for(const p of ROSTER)if(p.g===g&&sel.has(p.id))n++;return n}
function photo(p,cls){
  const b=el("span",{class:cls});
  const fail=()=>{b.classList.add("nopic");b.prepend(el("span",{class:"ph-no",text:p.no}))};
  if(p.ph){
    const i=el("img",{src:"photos/"+p.id+".webp",alt:"",loading:"lazy",decoding:"async"});
    i.onerror=()=>{i.remove();fail()};
    b.append(i);
  }else fail();
  return b;
}
function applyTheme(t){
  const th=deriveTheme(t),l=themeDecls(th.light),d=themeDecls(th.dark);
  $("teamTheme").textContent=`:root{${l}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${d}}}
:root[data-theme="dark"]{${d}}`;
  document.querySelector('meta[name="theme-color"]').setAttribute("content",t.band);
}

// ---------- routing ----------
function teamFromHash(){const h=location.hash.replace("#","");return AVAIL.find(t=>t.slug===h||t.code===h)||null}
function route(){
  const t=teamFromHash();
  if(!t){
    if(AVAIL.length===1){location.replace("#"+AVAIL[0].slug);return}
    T=null;showPicker();return;
  }
  T=t;ROSTER=DATA.teams[t.code].players;BY=Object.fromEntries(ROSTER.map(p=>[p.id,p]));
  sel=new Set();
  try{const d=JSON.parse(store("rl-draft-"+t.code)||"null");if(Array.isArray(d))sel=new Set(d.filter(id=>BY[id]))}catch(e){}
  const clubIds=officialList&&officialList.teams[t.code];
  clubKept=Array.isArray(clubIds)?new Set(clubIds):null;
  saved=null;savedAt=null;mineFailed=false;mineRetries=0;clearTimeout(mineRetryTimer);stats=null;statsAt=0;pos="all";showFilter="all";q="";$("q").value="";
  disarmSave();
  applyTheme(t);
  document.title=t.short+"契約保留名簿｜中職 60 人名單模擬";
  $("kicker").textContent=t.en+" · 2027 Reserve List";
  $("h1").textContent="排出你的"+t.name+" 60 人契約保留名單";
  $("teamSw").value=t.code;$("teamSwBox").hidden=AVAIL.length<2;
  renderExempt();
  $("picker").hidden=true;$("app").hidden=false;
  if(store("rl-tab")==="stats")tab="stats";
  setTab(tab);
  showOfficialCopy();
  loadMine();
}
function showPicker(){
  clearInterval(statsTimer);
  $("heroOff").hidden=true;
  applyTheme(NEUTRAL);
  document.title="中職契約保留名簿｜各隊 60 人名單模擬";
  $("kicker").textContent="CPBL · 2027 Reserve List";
  $("h1").textContent="排出你支持球隊的 60 人契約保留名單";
  $("exempt").replaceChildren();$("teamSwBox").hidden=true;
  $("app").hidden=true;$("picker").hidden=false;
  const g=$("tgrid");g.replaceChildren();
  for(const t of AVAIL){
    const n=DATA.teams[t.code].players.length;
    const c=cardColors(t);
    const style=`background:${c.bg};color:${c.fg};box-shadow:inset 0 -4px 0 ${c.stripe}`;
    g.append(el("a",{class:"tcard",href:"#"+t.slug,style},
      el("span",{text:t.en}),el("b",{text:t.name}),el("em",{text:`${n} 名可選球員 · 選出 ${LIMIT} 人`})));
  }
}
function renderExempt(){
  const ex=$("exempt");ex.replaceChildren();
  const e=DATA.teams[T.code].exempt||{};
  const rows=EXEMPT.map(([k,label])=>[label,e[k]||[]]).filter(([,n])=>n.length);
  const n=rows.reduce((a,[,v])=>a+v.length,0);
  if(!n)return;
  ex.append(el("details",{},el("summary",{text:`不需列入 60 人名單：${n} 位球員`}),
    ...rows.map(([label,names])=>el("span",{},el("b",{text:label}),names.join("、")))));
}

// ---------- top bar ----------
function renderRail(){
  const pt=$("posTabs");pt.replaceChildren();
  for(const k of["all",...GORD]){
    const tot=k==="all"?ROSTER.length:ROSTER.filter(p=>p.g===k).length;
    const kept=k==="all"?sel.size:keptIn(k),label=k==="all"?"全部":GN[k];
    const b=el("button",{class:"pc-tab","aria-pressed":String(pos===k),"aria-label":`${label}：已保留 ${kept}，共 ${tot} 人`},
      el("span",{},
        el("span",{class:"l",text:label}),
        el("span",{class:"n"},el("b",{class:"k",text:kept}),el("span",{class:"t",text:"/"+tot}))));
    b.onclick=()=>setPos(k);pt.append(b);
  }
  $("showSel").value=showFilter;
  $("showBox").hidden=$("searchBox").hidden=tab!=="pick";
}
$("showSel").onchange=e=>{showFilter=e.target.value;renderGroups()};
function setPos(k){
  pos=k;renderRail();if(tab==="pick")renderGroups();else renderStats();
  const top=document.querySelector("#app main").getBoundingClientRect().top+window.scrollY-$("top").offsetHeight-4;
  if(window.scrollY>top)window.scrollTo({top,behavior:"smooth"});
}
try{new ResizeObserver(()=>document.documentElement.style.setProperty("--hh",$("top").offsetHeight+"px")).observe($("top"))}catch(e){}

// ---------- picker ----------
function match(p){
  if(pos!=="all"&&p.g!==pos)return false;
  if(showFilter==="kept"&&!sel.has(p.id))return false;
  if(showFilter==="dropped"&&sel.has(p.id))return false;
  if(showFilter==="new"&&!isRookie(p))return false;
  if(q){const s=q.trim();if(s&&!p.n.includes(s)&&p.no!==s&&String(+p.no)!==s)return false}
  return true;
}
function tileIds(box){return[...box.querySelectorAll(".tile")].map(b=>b.dataset.id)}
// One player tile. full = the list is at the limit (unselected tiles are dimmed); show = this team shows stat lines.
function tileEl(p,full,show){
  const on=sel.has(p.id);
  const pic=photo(p,"pic");
  pic.append(el("span",{class:"no",text:p.no}),el("span",{class:"ck","aria-hidden":"true",text:"✓"}));
  const badge=cornerBadge(p),age=ageOn(p.b,DATA.updated),note=cardNote(p,DATA.updated);
  if(badge)pic.append(el("span",{class:"mk-tag "+badge.kind,"aria-hidden":"true",text:badge.text},badge.small?el("small",{text:badge.small}):null));
  if(age!=null)pic.append(el("span",{class:"mk-age","aria-hidden":"true"},el("b",{text:age}),el("small",{text:"歲"})));
  const line=show?statLine(p):null,tier=show?statTier(p):null,capped=full&&!on;
  const title=tileTitle(p,show,capped)+(note?"\n"+note:"");
  const label=`${playerHead(p)} ${posLabel(p)}${note?" "+note:""}${line?" "+line:""}${on?" 已保留":""}`;
  const b=el("button",{class:"tile","data-id":p.id,"aria-pressed":String(on),title,"aria-label":label},pic,
    el("span",{class:"tx"},
      el("span",{class:"nmr"},el("span",{class:"nm",text:p.n})),
      el("span",{class:"sub"},posLabel(p),el("span",{class:"sep",text:"·"}),p.l),
      line&&el("span",{class:"stat"+(tier?" "+tier:""),text:line})));
  // aria-disabled (not disabled) keeps capped tiles focusable and tappable; toggle() explains the limit in a toast.
  if(capped)b.setAttribute("aria-disabled","true");
  b.onclick=()=>toggle(p.id);
  return b;
}
// Group-header 全選／全部取消 for the ids currently shown in group g.
function bulkButton(g,ids){
  const bs=bulkState(ids,sel,LIMIT),add=bs.mode==="add";
  const title=!add?`取消選取目前顯示的 ${ids.length} 位${GN[g]}`
    :bs.disabled&&bs.need?`需要 ${bs.need} 個名額，只剩 ${bs.left} 個，無法全選`
    :bs.need?`選取目前顯示的 ${bs.need} 位${GN[g]}`
    :"目前顯示的球員已全部選取";
  const bulk=el("button",{type:"button",class:"bulk","aria-label":`${add?"全選":"全部取消"}${GN[g]}（${ids.length} 人）`,text:add?"全選":"全部取消",title});
  // aria-disabled (not disabled) keeps it focusable and tappable, so the reason can be shown as a toast.
  if(bs.disabled)bulk.setAttribute("aria-disabled","true");
  bulk.dataset.g=g;
  bulk.onclick=()=>{if(bs.disabled){toast(bulk.title);return}bulkToggle(ids)};
  return bulk;
}
// What held focus inside box before a re-render: a tile (with the tile order then) or a group's bulk button.
function focusBefore(box){
  const ae=document.activeElement;
  if(!box.contains(ae))return null;
  const tileId=ae.classList.contains("tile")?ae.dataset.id:null;
  return{tileId,bulkG:ae.classList.contains("bulk")?ae.dataset.g:null,prevIds:tileId?tileIds(box):[]};
}
function restoreFocus(box,f){
  if(!f)return;
  if(f.tileId){
    const id=nextFocusId(f.prevIds,tileIds(box),f.tileId),t=id&&box.querySelector(`.tile[data-id="${id}"]`);
    if(t)t.focus({preventScroll:true});
  }
  if(f.bulkG){const b=box.querySelector(`.bulk[data-g="${f.bulkG}"]`);if(b)b.focus({preventScroll:true})}
}
// Full rebuild on every change (cheap enough; incremental updates once broke focus and scroll).
function renderGroups(){
  const box=$("groups"),focus=focusBefore(box);
  // Removing a subtree that holds focus makes Chrome lay out the half-empty page at once, clamping scrollY toward 0; drop focus first, restore it below.
  if(focus)document.activeElement.blur();
  box.replaceChildren();
  const full=sel.size>=LIMIT,show=statsShown(DATA.teams[T.code]);
  let any=false;
  for(const g of GORD){
    const all=ROSTER.filter(p=>p.g===g),list=all.filter(match).sort(sortP);
    if(!list.length)continue;
    any=true;
    const grid=el("div",{class:"grid"},...list.map(p=>tileEl(p,full,show)));
    const head=el("div",{class:"gh"},
      el("h2",{},el("span",{class:"en",text:GEN[g]}),GN[g]),
      el("span",{class:"k"},"已保留 ",el("b",{text:keptIn(g)})," / "+all.length),
      bulkButton(g,list.map(p=>p.id)));
    box.append(el("section",{class:"grp",id:"g-"+g},head,grid));
  }
  if(!any)box.append(el("div",{class:"empty"},el("b",{text:"沒有符合條件的球員"}),"試試換個守位、篩選條件或搜尋文字。"));
  restoreFocus(box,focus);
}
// Every selection change goes through keepDraft(), which also cancels a pending 送出 confirmation (the count changed).
function keepDraft(){store("rl-draft-"+T.code,JSON.stringify([...sel]));disarmSave()}
function bulkToggle(ids){
  const bs=bulkState(ids,sel,LIMIT);if(bs.disabled)return;
  const next=new Set(sel);for(const id of ids)bs.mode==="add"?next.add(id):next.delete(id);
  sel=next;keepDraft();renderAll();
}
function toggle(id){
  if(sel.has(id))sel.delete(id);else{if(sel.size>=LIMIT){toast(CAP_MSG);return}sel.add(id)}
  keepDraft();renderAll();
}

// ---------- count + actions ----------
function renderDock(){
  const n=sel.size;
  $("selN").textContent=n;$("selBar").style.width=Math.min(100,n/LIMIT*100)+"%";
  $("top").classList.toggle("over",n>LIMIT);
  $("copyTxt").disabled=$("mkImg").disabled=$("clear").disabled=n===0;
}
function fmt(t){const d=new Date(t);return isNaN(d)?"":`${d.getMonth()+1}/${d.getDate()} ${hhmm(t)}`}
const LOCKED_MSG="官方名單已公布，送出已截止";
function renderStatus(){
  const s=$("status"),btn=$("save");s.replaceChildren();
  const k=saveState({saving,saved,sel,locked,mineFailed}),armed=saveArmed&&!k.disabled;
  btn.disabled=k.disabled;
  btn.classList.toggle("dirty",!armed&&(k.kind==="changed"||k.kind==="unsent"));
  btn.classList.toggle("arm",armed);
  btn.querySelector(".lb").textContent=armed?"確定送出？":k.label;
  if(k.kind==="locked")btn.title=LOCKED_MSG;else btn.removeAttribute("title");
  s.title=k.kind==="locked"?LOCKED_MSG:"";
  if(k.kind==="saving")s.append("送出中…");
  else if(k.kind==="connecting")s.append("連線中…");
  else if(k.kind==="locked")s.append(el("span",{class:"st-long",text:"官方名單已公布，"}),"送出已截止"); // phones show the short half
  else if(k.kind==="unknown")s.append(el("span",{class:"warn",text:"無法確認送出狀態"}));
  else if(k.kind==="empty")s.append("點選球員加入名單");
  else if(k.kind==="sent")s.append("已送出"+(savedAt?" "+fmt(savedAt):""));
  else s.append(el("span",{class:"warn",text:k.kind==="changed"?"有未送出的變更":"尚未送出"}));
}
async function api(path,opts){
  const r=await fetch(API+path,opts);const j=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(j.error||("http_"+r.status));e.code=j.error;e.status=r.status;throw e}
  return j;
}
// Reads this device's submitted list and the lock flag. On failure an unknown saved list stays null (status shows
// 無法確認送出狀態) and is retried when the connection or the page comes back; a known list is kept.
async function loadMine(){
  if(!T)return;
  const code=T.code,seq=++mineSeq,epoch=saveEpoch;
  clearTimeout(mineRetryTimer);
  const stale=()=>!T||T.code!==code||seq!==mineSeq;
  try{
    const j=await api(`/mine?team=${code}&voter=${VOTER}`);
    if(stale())return;
    mineFailed=false;mineRetries=0;locked=j.locked===true;lockKnown=true;
    if(epoch!==saveEpoch){showOfficialCopy();renderAll();return} // a submit finished meanwhile: its list is newer
    if(Array.isArray(j.ids)){
      saved=new Set(j.ids.filter(id=>BY[id]));savedAt=j.at;
      if(!store("rl-draft-"+code)){sel=new Set(saved);keepDraft()}
    }else{saved=new Set();savedAt=null}
  }catch(e){
    if(stale())return;
    if(saved===null){
      mineFailed=true;
      if(mineRetries<MINE_RETRY_MAX){mineRetries++;mineRetryTimer=setTimeout(retryMine,MINE_RETRY_MS*mineRetries)}
    }
  }
  showOfficialCopy();renderAll();
}
const retryMine=()=>{if(T&&saved===null&&mineFailed)loadMine()};
window.addEventListener("online",retryMine);
async function save(){
  if(saving||locked)return;
  const code=T.code,name=T.name,ids=[...sel].sort();
  if(needsConfirm(ids.length,LIMIT)&&!saveArmed){armSave(ids.length);return}
  disarmSave();
  saving=true;renderStatus();
  try{
    const body=JSON.stringify({team:code,voter:VOTER,ids});
    const j=await api("/picks",{method:"POST",headers:{"Content-Type":"application/json"},body});
    // The team may have changed while waiting: never record this answer as the new team's list.
    const here=!!T&&T.code===code;
    if(here){saveEpoch++;saved=new Set(ids);savedAt=j.at;mineFailed=false;stats=null;freshUntil=Date.now()+FRESH_MS}
    // Switched teams while waiting: say which team the result belongs to.
    toast((here?"":name+"：")+(ids.length?"已送出 "+ids.length+" 人名單":"已撤回你的名單"));
  }catch(e){
    toast(submitError(e.code,e.status));
    if(e.code==="locked"){locked=true;lockKnown=true;showOfficialCopy();loadMine()}
  }
  saving=false;renderAll();loadStats(true);
}
// Submitting fewer than LIMIT players needs two presses, like 清空: the first arms the button for 3 s.
let saveArmed=false,saveArmTimer=0;
function armSave(n){
  saveArmed=true;clearTimeout(saveArmTimer);
  saveArmTimer=setTimeout(()=>{saveArmed=false;renderStatus()},3000);
  renderStatus();toast(`只選了 ${n} 人，再按一次送出`);
}
function disarmSave(){clearTimeout(saveArmTimer);if(saveArmed){saveArmed=false;if(T)renderStatus()}}
// 清空 needs two presses: the first arms the button for 3 s.
let clearArmTimer=0;
$("clear").onclick=()=>{
  const b=$("clear"),lb=b.querySelector(".lb");
  const disarm=()=>{b.classList.remove("arm");lb.textContent="清空"};
  clearTimeout(clearArmTimer);
  if(!b.classList.contains("arm")){
    b.classList.add("arm");lb.textContent="確定清空？";toast("再按一次清空名單");
    clearArmTimer=setTimeout(disarm,3000);
    return;
  }
  disarm();
  sel.clear();keepDraft();renderAll();toast("已清空名單（尚未送出）");
};
$("save").onclick=save;

// ---------- official list (flag) ----------
// Club decision pill for the stats-tab ranking rows only (picker tiles intentionally omit it). null without an official list.
function clubMark(id){
  if(!clubKept)return null;
  const keep=clubKept.has(id),label=keep?"保留":"放生",g=keep?"✓":"✗";
  const node=el("span",{class:"cd "+(keep?"keep":"drop"),title:"球團"+label},
    el("span",{"aria-hidden":"true",text:g+" "+label}),el("span",{class:"sr",text:"球團"+label}));
  return{keep,label,node};
}
function plist(items,rate){ // [{p,r}] -> inline chips
  return el("span",{class:"pl"},...items.map(x=>
    el("span",{class:"pi"},el("b",{text:x.p.no}),x.p.n,rate?el("small",{text:Math.round(x.r*100)+"%"}):null)));
}
function group(title,items,rate){
  if(!items.length)return el("div",{class:"ag none"},el("b",{text:title}),el("span",{text:"沒有"}));
  return el("div",{class:"ag"},el("b",{text:title+" "+items.length+" 人"}),plist(items,rate));
}
// Why there is no hit rate: nothing submitted (before the lock, or still possible to submit), or /mine unknown.
function mineHint(state){
  if(state==="unknown")return mineFailed?"無法確認你送出的名單，恢復連線後會自動重試。":"讀取你送出的名單中…";
  return locked?"公布前沒有送出名單，無法計算命中率。":"送出名單後，就能看你和球團重疊幾人。";
}
function answerBlock(a,N){
  const box=el("section",{class:"ans","aria-label":"對答案"});
  const d=offDate(officialList.updated);
  box.append(el("div",{class:"ans-h"},el("h2",{text:"對答案"}),el("span",{text:(d?`球團名單 ${d} 公布`:"球團名單已公布")+"；依你送出的名單計算"})));
  const hit=el("div",{class:"hit"});
  if(a.mine)hit.append(el("div",{class:"big"},"你的名單和球團重疊 ",el("b",{text:a.mine.x}),el("small",{text:" / "+a.mine.denom})," 人"));
  else hit.append(el("div",{class:"hint",text:mineHint(a.mineState)}));
  if(a.fanAvg!=null)hit.append(el("div",{class:"big"},"球迷平均重疊 ",el("b",{text:a.fanAvg.toFixed(1)})," 人"));
  box.append(hit);
  if(a.mine){
    const by=ids=>ids.map(id=>({p:BY[id]})).filter(x=>x.p).sort((x,y)=>sortP(x.p,y.p));
    box.append(el("div",{class:"ags"},group("你保留、球團放生",by(a.mine.mineOnly)),group("你放生、球團保留",by(a.mine.officialOnly))));
  }
  if(!a.diff){box.append(el("p",{class:"hint",text:"這隊至少要有 10 份名單，才會顯示球迷共識與爆冷（目前 "+N+" 份）。"}));return box}
  const u=a.upsets;
  if(u.dropped.length||u.kept.length){
    const row=(x,k)=>el("li",{},el("span",{class:"pct",text:Math.round(x.r*100)+"%"}),
      k===0?"球迷保留、球團放生 ":"球迷放生、球團保留 ",el("b",{text:x.p.no+" "+x.p.n}));
    box.append(el("div",{class:"upset"},el("h3",{},"爆冷"),el("ul",{},...u.dropped.map(x=>row(x,0)),...u.kept.map(x=>row(x,1)))));
  }
  const li=x=>el("li",{},el("span",{class:"n2",text:x.p.no}),x.p.n,el("small",{text:Math.round(x.r*100)+"%"}));
  const col=(title,items)=>el("div",{class:"dc"},el("h3",{text:title+" "+items.length+" 人"}),
    items.length?el("ol",{},...items.map(li)):el("p",{class:"hint",text:"沒有"}));
  box.append(
    el("div",{class:"dcs"},col("球迷保留、球團放生",a.diff.fanKeepClubDrop),col("球迷放生、球團保留",a.diff.fanDropClubKeep)),
    el("p",{class:"hint",text:`球迷保留 = 保留率排在全隊前 ${LIMIT} 名；百分比為球迷保留率。`}));
  return box;
}

// ---------- you vs most fans (P2-2) ----------
function mineBlock(m){
  const box=el("section",{class:"ans mvf","aria-label":"你和多數球迷不同的決定"});
  box.append(el("div",{class:"ans-h"},el("h2",{text:"你和多數球迷不同"}),el("span",{text:"依你已送出的名單；百分比為其他球迷的保留率"})));
  if(m.state==="unsent"){box.append(el("p",{class:"hint",text:"送出名單後，這裡會列出你和多數球迷意見不同的球員。"}));return box}
  if(m.state==="few"){box.append(el("p",{class:"hint",text:"其他球迷的名單滿 "+MINE_MIN_OTHERS+" 份後才會顯示（目前 "+m.others+" 份）。"}));return box}
  if(!m.keptLow.length&&!m.droppedHigh.length){box.append(el("p",{class:"hint",text:"你的名單和多數球迷沒有明顯不同。"}));return box}
  box.append(el("div",{class:"ags"},group("你保留、球迷多半放生",m.keptLow,true),group("你放生、球迷多半保留",m.droppedHigh,true)));
  box.append(el("p",{class:"hint",text:"球迷多半 = 其他球迷保留率 "+Math.round(MINE_LOW*100)+"% 以下或 "+Math.round(MINE_HIGH*100)+"% 以上。"}));
  return box;
}

// ---------- stats ----------
async function loadStats(fresh){
  if(!T)return;
  const code=T.code,seq=++statsSeq;fresh=fresh||Date.now()<freshUntil;
  const stale=()=>!T||T.code!==code||seq!==statsSeq; // an older request (poll, visibility, tab) answered late
  // fresh: also skip the browser HTTP cache, or a second fresh read within max-age=60 returns the first response.
  // Polling usually returns the same totals; skip rebuilding the ranking then (first load, team change and errors still render).
  let changed=true;
  try{
    const j=await api("/stats?team="+code+(fresh?"&fresh=1":""),fresh?{cache:"no-store"}:undefined);
    if(stale())return;
    changed=!sameTally(stats,j);
    stats=j;statsAt=Date.now();
  }catch(e){if(stale())return;if(!stats)stats={error:true}}
  if(tab==="stats"&&changed)renderStats();
  else{const at=$("statsAt");if(at)at.textContent=statsAtText()}
  subCount();
}
function renderStats(){
  const box=$("statsBody");box.replaceChildren();
  if(!stats){box.append(el("div",{class:"empty"},el("b",{text:"載入中…"})));return}
  if(stats.error){box.append(el("div",{class:"empty"},el("b",{text:"暫時讀不到統計"}),"請檢查網路，稍後會自動重新讀取。"));return}
  const N=stats.n||0,cnt=stats.counts||{};
  // Hit rate from the submitted list only (P1-6); fan average, consensus and upsets from the (frozen once locked) stats.
  const ans=clubKept?offAnswer({roster:ROSTER,counts:cnt,N,saved,official:[...clubKept],cmp:sortP}):null;
  if(ans)box.append(answerBlock(ans,N));
  if(!N){
    box.append(el("div",{class:"empty"},el("b",{text:"還沒有人送出"+T.name+"的名單"}),"在「我的名單」選好球員後按「送出名單」，你的選擇就會出現在這裡。"));
    return;
  }
  let tot=0;for(const v of Object.values(cnt))tot+=v;
  const rows=ROSTER.map(p=>({p,c:cnt[p.id]||0})).map(x=>({...x,r:x.c/N}))
    .sort((a,b)=>b.c-a.c||sortP(a.p,b.p));
  rows.forEach((x,i)=>x.rank=i+1);
  const split=rows.filter(x=>N>=3&&x.r>=.35&&x.r<=.65).length;
  const kp=el("div",{class:"kpis"});
  const kpis=[
    [N,"份名單已送出"],
    [(tot/N).toFixed(1),"平均保留人數"],
    [rows.filter(x=>x.r===1).length,"全票保留"],
    [N>=3?split:"—","意見分歧（35–65%）"],
  ];
  for(const[v,k]of kpis)kp.append(el("div",{class:"kpi"},el("div",{class:"v",text:v}),el("div",{class:"k",text:k})));
  box.append(kp);
  box.append(mineBlock(mineVsFans({roster:ROSTER,counts:cnt,N,saved,cmp:sortP})));
  const list=el("div",{class:"rank"+(clubKept?" club":""),style:"--cd:"+String(N).length}); // --cd = digits of N, sizes the count column
  for(const x of rows.filter(x=>pos==="all"||x.p.g===pos)){
    if(pos==="all"&&x.rank===LIMIT+1)list.append(el("div",{class:"cut"},`▲ 共識 ${LIMIT} 人保留線`,el("span",{text:"以下未進共識名單"})));
    const cls=["rk"];if(sel.has(x.p.id))cls.push("mine");if(N>=3&&x.r>=.35&&x.r<=.65)cls.push("split");
    list.append(el("div",{class:cls.join(" ")},el("div",{class:"r",text:x.rank}),photo(x.p,"av"),
      el("div",{class:"nm"},el("span",{class:"n2",text:x.p.no}),x.p.n,clubMark(x.p.id)?.node,el("small",{text:posLabel(x.p)})),
      el("div",{class:"track"},el("i",{style:`width:${(x.r*100).toFixed(1)}%`})),
      el("div",{class:"pc"},el("span",{text:Math.round(x.r*100)+"%"}),el("small",{text:`${x.c}/${N}`}))));
  }
  box.append(list);
  box.append(el("p",{class:"note"},"依保留率排序，名次為全隊排名。● 為你目前名單中保留的球員；虛線為 50%；橘色百分比代表意見分歧（至少 3 份名單時才標示）。每台裝置每隊計一份，重新送出會覆蓋舊的名單。"+(clubKept?"✓／✗ 為球團公布的決定。":""),
    el("span",{id:"statsAt",text:statsAtText()})));
}
function statsAtText(){return statsAt?"更新於 "+hhmm(statsAt)+"。":""}
function subCount(){$("subN").textContent=stats&&stats.n?stats.n:""}

function renderAll(){if(!T)return;renderDock();renderStatus();renderRail();subCount();if(tab==="pick")renderGroups();else renderStats()}
function setTab(t){
  tab=t;
  for(const k of["pick","stats"]){const b=$("tab-"+k);b.setAttribute("aria-selected",String(k===t));b.tabIndex=k===t?0:-1;$("view-"+k).hidden=k!==t}
  renderAll();store("rl-tab",t);
  clearInterval(statsTimer);
  if(t==="stats"){loadStats();statsTimer=setInterval(()=>{if(!document.hidden)loadStats()},120000)}
  else if(!stats)loadStats();
}
$("tab-pick").onclick=()=>setTab("pick");$("tab-stats").onclick=()=>setTab("stats");
// WAI-ARIA tabs: Left/Right (and Home/End) move between the two tabs and select them; only the selected one is in the Tab order.
document.querySelector(".views").addEventListener("keydown",e=>{
  const order=["pick","stats"],i=order.indexOf(tab);
  const n=order.length,j=e.key==="ArrowRight"?(i+1)%n:e.key==="ArrowLeft"?(i+n-1)%n:e.key==="Home"?0:e.key==="End"?n-1:-1;
  if(j<0)return;
  e.preventDefault();setTab(order[j]);$("tab-"+order[j]).focus();
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden||!T)return;
  retryMine();
  if(statsStale(statsAt,Date.now()))loadStats();
});
// Another tab edited this team's draft: follow it.
window.addEventListener("storage",e=>{
  if(!T||e.key!=="rl-draft-"+T.code)return;
  let ids=[];try{const d=JSON.parse(e.newValue||"[]");if(Array.isArray(d))ids=d}catch(err){}
  sel=new Set(ids.filter(id=>BY[id]));disarmSave();renderAll();
});
$("q").oninput=e=>{q=e.target.value;renderGroups()};

// ---------- export ----------
function groupsOf(){return GORD.split("").map(g=>({g,on:ROSTER.filter(p=>p.g===g&&sel.has(p.id)).sort(sortP)}))}
function droppedPlayers(){return ROSTER.filter(p=>!sel.has(p.id)).sort(sortP)}
function listText(){
  const gs=groupsOf(),dropped=droppedPlayers();
  const L=[T.name+" 2027 年度契約保留球員名單（我的版本）","保留 "+sel.size+" / "+LIMIT+" 人｜"+gs.map(x=>GN[x.g]+" "+x.on.length).join("、"),""];
  for(const x of gs){if(!x.on.length)continue;L.push("【"+GN[x.g]+" "+x.on.length+"】",x.on.map(p=>p.no+" "+p.n).join("、"),"")}
  if(dropped.length)L.push("【未列入 "+dropped.length+"】",dropped.map(p=>p.no+" "+p.n).join("、"),"");
  L.push("— 排你的名單："+location.origin+location.pathname+"#"+T.slug); // no query string (fbclid etc.)
  return L.join("\n");
}
let toastT=0;
// Longer messages stay up longer.
function toast(msg){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},Math.max(2400,msg.length*90))}
// Modal sheet: focus moves in on open, Tab stays inside, and closing returns focus to the button that opened it.
let sheetUrl=null,sheetOpener=null;
function openSheet(title,kids,opener){
  sheetOpener=opener||null;
  $("sheetT").textContent=title;$("sheetBody").replaceChildren(...kids);$("sheet").hidden=false;$("sheetX").focus();
}
function closeSheet(){
  $("sheet").hidden=true;$("sheetBody").replaceChildren();if(sheetUrl){URL.revokeObjectURL(sheetUrl);sheetUrl=null}
  const o=sheetOpener;sheetOpener=null;
  if(o&&o.isConnected&&!o.disabled)o.focus();
}
function sheetFocusables(){return[...$("sheet").querySelectorAll('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null)}
$("sheetX").onclick=closeSheet;
$("sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closeSheet()});
document.addEventListener("keydown",e=>{
  if($("sheet").hidden)return;
  if(e.key==="Escape"){closeSheet();return}
  if(e.key!=="Tab")return;
  const f=sheetFocusables();if(!f.length)return;
  const first=f[0],last=f[f.length-1],inside=$("sheet").contains(document.activeElement);
  if(e.shiftKey&&(!inside||document.activeElement===first)){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&(!inside||document.activeElement===last)){e.preventDefault();first.focus()}
});
$("copyTxt").onclick=()=>{
  const t=listText();
  const fb=()=>{const ta=el("textarea",{class:"ta",readonly:"","aria-label":"名單文字"});ta.value=t;
    openSheet("複製名單文字",[el("p",{class:"hint",text:"無法自動複製。文字已全選，請按 Ctrl+C（Mac 按 ⌘C），手機請長按後選「複製」。"}),ta],$("copyTxt"));
    setTimeout(()=>{ta.focus();ta.select()},0)};
  try{navigator.clipboard.writeText(t).then(()=>toast("已複製 "+sel.size+" 人名單到剪貼簿"),fb)}catch(e){fb()}
};
async function drawCard(){
  const W=1080,P=64,IW=W-P*2,RH=52,ORH=38,COLS=4,OCOLS=5;
  const gs=groupsOf().filter(x=>x.on.length),dropped=droppedPlayers();
  const TH=deriveTheme(T).light;
  const C={bg:TH["--page"],band:T.band,ink:TH["--ink"],muted:TH["--muted"],line:TH["--line"],white:"#FFFFFF",soft:"rgba(255,255,255,.72)",acc:TH["--acc-ink"]};
  const SANS='"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif',NUM='"Rajdhani","Arial Narrow",sans-serif';
  const all=T.name+T.short+"年度契約保留球員我的人名單未列入依中職聯盟規章第章條簿投手捕手內野外・｜/"+ROSTER.map(p=>p.n).join("");
  try{
    await Promise.all([
      document.fonts.load("700 60px "+SANS,all),document.fonts.load("500 24px "+SANS,all),
      document.fonts.load("400 22px "+SANS,all),document.fonts.load("700 30px "+NUM,"0123456789/"),
    ]);
  }catch(e){}
  const HEAD=250;let H=HEAD+40;
  for(const x of gs)H+=60+Math.ceil(x.on.length/COLS)*RH+28;
  if(dropped.length)H+=56+Math.ceil(dropped.length/OCOLS)*ORH+28;
  H+=70;
  const cv=document.createElement("canvas");cv.width=W;cv.height=H;const c=cv.getContext("2d");
  c.fillStyle=C.bg;c.fillRect(0,0,W,H);
  c.fillStyle=C.band;c.fillRect(0,0,W,HEAD);
  c.fillStyle=T.acc;c.fillRect(0,HEAD-8,W,8);
  c.fillStyle=C.soft;c.font="500 24px "+SANS;c.fillText(T.name+" · 2027 年度契約保留球員",P,84);
  c.fillStyle=C.white;c.font="700 64px "+SANS;c.fillText("我的 60 人名單",P,164);
  c.font="400 24px "+SANS;c.fillStyle=C.soft;
  c.fillText(GORD.split("").map(g=>GN[g]+" "+keptIn(g)).join("　")+"　未列入 "+dropped.length,P,214);
  c.textAlign="right";c.font="500 48px "+NUM;c.fillStyle=C.soft;c.fillText("/ "+LIMIT,W-P,164);const sW=c.measureText("/ "+LIMIT).width;
  c.font="700 132px "+NUM;c.fillStyle=C.white;c.fillText(String(sel.size),W-P-sW-10,164);
  c.textAlign="left";
  let y=HEAD+40;const cw=IW/COLS;
  for(const x of gs){
    c.fillStyle=C.ink;c.font="700 32px "+SANS;c.fillText(GN[x.g],P,y+34);
    const tw=c.measureText(GN[x.g]).width;c.fillStyle=C.muted;c.font="400 22px "+SANS;c.fillText(x.on.length+" 人",P+tw+14,y+34);
    c.fillStyle=C.line;c.fillRect(P,y+48,IW,2);y+=60;
    x.on.forEach((p,i)=>{const cx=P+(i%COLS)*cw,cy=y+Math.floor(i/COLS)*RH+34;
      c.textAlign="right";c.fillStyle=C.acc;c.font="700 30px "+NUM;c.fillText(p.no,cx+50,cy);
      c.textAlign="left";c.fillStyle=C.ink;c.font="700 27px "+SANS;c.fillText(p.n,cx+62,cy,cw-72)});
    y+=Math.ceil(x.on.length/COLS)*RH+28;
  }
  if(dropped.length){
    c.fillStyle=C.muted;c.font="700 26px "+SANS;c.fillText("未列入（"+dropped.length+" 人）",P,y+28);
    c.fillStyle=C.line;c.fillRect(P,y+42,IW,1);y+=56;const ow=IW/OCOLS;
    dropped.forEach((p,i)=>{const cx=P+(i%OCOLS)*ow,cy=y+Math.floor(i/OCOLS)*ORH+26;
      c.fillStyle=C.muted;c.font="400 21px "+SANS;c.fillText(p.no+" "+p.n,cx,cy,ow-12)});
  }
  c.fillStyle=C.line;c.fillRect(P,H-70,IW,1);
  c.fillStyle=C.muted;c.font="400 20px "+SANS;c.fillText("依中職聯盟規章第 8 章第 10 條 · "+location.host+location.pathname,P,H-34,IW);
  return cv;
}
$("mkImg").onclick=async()=>{
  const b=$("mkImg"),lb=b.querySelector(".lb");b.disabled=true;lb.textContent="產生中…";
  try{
    const cv=await drawCard();
    const blob=await new Promise(r=>cv.toBlob(r,"image/png"));if(!blob)throw 0;
    if(sheetUrl)URL.revokeObjectURL(sheetUrl);sheetUrl=URL.createObjectURL(blob);
    const fname=T.short+"契約保留名單.png";
    const row=el("div",{class:"sheet-a"});
    const dla=el("a",{class:"btn",href:sheetUrl,download:fname},el("span",{text:"下載 PNG"}));row.append(dla);
    const file=new File([blob],fname,{type:"image/png"});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      const sh=el("button",{class:"btn"},el("span",{text:"分享"}));
      sh.onclick=async()=>{try{await navigator.share({files:[file],title:T.name+"契約保留名單"})}catch(e){}};row.append(sh);
    }
    row.append(el("span",{class:"hint",text:"也可以右鍵或長按圖片另存。"}));
    // The preview is a data: URL (not the blob URL): some in-app browsers cannot long-press-save blob images.
    const kids=[el("img",{class:"shot",src:cv.toDataURL("image/png"),alt:"我的契約保留球員名單"}),row];
    if(isInAppBrowser(navigator.userAgent))kids.push(el("p",{class:"hint inapp",text:"若無法儲存，請從右上角選單改用 Safari／Chrome 開啟。"}));
    openSheet("名單圖片",kids,b);
  }catch(e){toast("圖片產生失敗，請再試一次")}
  b.disabled=sel.size===0;lb.textContent="存成圖片";
};

function showOfficialCopy(){
  const h=$("heroOff"),club=!!(officialList&&clubKept);
  if(!T||(!club&&!locked)){h.hidden=true;return}
  const d=club?offDate(officialList.updated):"";
  const what=club?`球團的 ${officialList.season||2027} 年度保留名單${d?"（"+d+"）":""}已公布`:"官方名單已公布";
  h.textContent=locked
    ?`${what}，送出已截止。你仍可排自己的版本、複製文字或存成圖片${club?"，也可以到「大家的統計」對答案":""}。`
    :lockKnown?`${what}，現在送出的名單代表你的意見，不再是預測。到「大家的統計」對答案，看看你和球團、其他球迷差在哪。`
    :`${what}。到「大家的統計」對答案，看看你和球團、其他球迷差在哪。`; // lock state not known yet
  h.hidden=false;
}

// ---------- boot ----------
initMode();
(async()=>{
  try{DATA=await (await fetch("data/teams.json",{cache:"no-cache"})).json()}catch(e){document.body.append(el("p",{class:"in",text:"名單載入失敗，請重新整理頁面。"}));return}
  const [yy,mm,dd]=String(DATA.updated||"").split("-");
  if(dd)$("srcDate").textContent=`${yy} 年 ${+mm} 月 ${+dd} 日`;
  if(FLAGS.official){
    // dev (localhost) reads the sample list; a missing file just leaves the feature hidden
    try{
      const r=await fetch(IS_LOCAL?"data/official.sample.json":"data/official.json",{cache:"no-cache"});
      if(r.ok){const j=await r.json();if(j&&j.teams)officialList=j}
    }catch(e){}
    if(officialList)$("disclaimer").textContent="對答案的球團名單依中華職棒公告整理；球迷排出的名單僅為模擬。";
  }
  AVAIL=TEAMS.filter(t=>DATA.teams[t.code]);
  for(const t of AVAIL)$("teamSw").append(el("option",{value:t.code,text:t.name}));
  $("teamSw").onchange=e=>{const t=AVAIL.find(x=>x.code===e.target.value);location.hash=t.slug};
  window.addEventListener("hashchange",()=>{route();window.scrollTo(0,0)});
  route();
})();
