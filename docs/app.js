"use strict";
const API=IS_LOCAL?"http://localhost:8787":"https://cpbl-reserve-2026-api.cpbl-status.workers.dev";
const GN={P:"投手",C:"捕手",I:"內野手",O:"外野手"}, GEN={P:"Pitchers",C:"Catchers",I:"Infielders",O:"Outfielders"}, GORD="PCIO";
// TEAMS, NEUTRAL, deriveTheme(), themeDecls() come from theme.js (loaded first).
// ageOn(), cornerBadge(), cardNote(), isRookie() come from card.js (loaded first); mineVsFans() from mine.js.
// posMatch(), filterMatch(), railCounts() from filter.js; RANK_PREVIEW, rankParts(), rankToggleText() from rank.js. LIMIT comes from limit.js; FLAGS from flags.js; offAnswer() etc. from official.js (both loaded first).
// statLine(), statTier(), statsShown(), tileTitle(), playerHead(), CAP_MSG come from stats.js; saveState(), needsConfirm(),
// submitError(), sameTally(), statsStale(), hhmm() from status.js; isInAppBrowser(), isLineBrowser() from flags.js (loaded first).
const EXEMPT=[["foreign","洋將"],["training","自主／自行培訓"],["fa","行使國內 FA"],["expansion","擴編選秀被選走"],["removed","已非球員"]];
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
    toast("配色："+MODE_UI[m].label,"ok");
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
// listMode = 刪減 "cut" (starts with the whole team) or 挑選 "pick" (starts empty), per team in "rl-mode-<code>".
// listModeArmed: an edited list needs a second press within 3 s to switch (switching replaces the list).
let listMode="cut", listModeArmed=false, listModeTimer=0;
// showFilter = the 顯示 select: all / kept / dropped / new
let pos="all", showFilter="all", q="", tab="pick";
// rankOpen = the stats ranking shows ranks RANK_PREVIEW+1..LIMIT too; kept across re-renders, reset per team.
let rankOpen=false;
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
// Every selection change rebuilds all tiles (see renderGroups); a re-created <img decoding="async"> paints one blank
// frame before it decodes, so photos flashed on each click. Decoded <img> nodes are kept per slot and moved into the
// new wrapper instead. slot defaults to cls; views that can be in the DOM at the same time need different slots
// (one node can only sit in one place). A photo that failed to load is remembered so later renders go straight to
// the number fallback.
const photoNodes=new Map(),photoFailed=new Set();
function photo(p,cls,slot=cls){
  const b=el("span",{class:cls});
  const fail=()=>{b.classList.add("nopic");b.prepend(el("span",{class:"ph-no",text:p.no}))};
  if(p.ph&&!photoFailed.has(p.id)){
    const k=slot+":"+p.id;let i=photoNodes.get(k);
    if(!i){i=el("img",{src:"photos/"+p.id+".webp",alt:"",loading:"lazy",decoding:"async"});photoNodes.set(k,i)}
    i.onerror=()=>{photoFailed.add(p.id);photoNodes.delete(k);i.remove();fail()}; // re-bound: fail() closes over this wrapper
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
  closeTeamMenu($("teamMenu").contains(document.activeElement)); // e.g. the back button while it is open
  const t=teamFromHash();
  if(!t){
    if(AVAIL.length===1){location.replace("#"+AVAIL[0].slug);return}
    T=null;showPicker();return;
  }
  T=t;ROSTER=DATA.teams[t.code].players;BY=Object.fromEntries(ROSTER.map(p=>[p.id,p]));
  listMode=normListMode(store("rl-mode-"+t.code));clearTimeout(listModeTimer);listModeArmed=false; // a new team never inherits a pending switch
  sel=draftOrStart(store("rl-draft-"+t.code));
  const clubIds=officialList&&officialList.teams[t.code];
  clubKept=Array.isArray(clubIds)?new Set(clubIds):null;
  saved=null;savedAt=null;mineFailed=false;mineRetries=0;clearTimeout(mineRetryTimer);stats=null;statsAt=0;rankOpen=false;pos="all";showFilter="all";q="";$("q").value="";
  disarmSave();
  applyTheme(t);
  $("kicker").textContent=t.en+" · 2027 Reserve List";
  $("h1").textContent="排出你的"+t.name+" 60 人契約保留名單";
  markTeam(t);$("teamSwBox").hidden=AVAIL.length<2;
  renderExempt();$("heroEx").hidden=true; // the 不需列入 details below list these kinds by name
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
  $("kicker").textContent="CPBL · 2027 Reserve List";
  $("h1").textContent="排出你支持球隊的 60 人契約保留名單";
  $("exempt").replaceChildren();$("teamSwBox").hidden=true;$("heroEx").hidden=false;
  $("app").hidden=true;$("picker").hidden=false;
  const g=$("tgrid");g.replaceChildren();
  for(const t of AVAIL){
    const c=cardColors(t);
    const style=`background:${c.bg};color:${c.fg};box-shadow:inset 0 -3px 0 ${c.stripe}`;
    g.append(el("a",{class:"tcard",href:"#"+t.slug,style},
      el("i",{class:"wm","aria-hidden":"true",text:t.en.split(" ").pop()}),el("span",{text:t.en}),el("b",{text:t.name})));
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

// ---------- team switch menu ----------
// Our own popup, not a <select>: Chrome keeps the native list painted until route()'s blocking re-render is done.
// The list lives outside the hero (which clips, and sits under the sticky top bar), positioned under the button.
const teamItems=()=>[...$("teamMenu").querySelectorAll("a")];
function buildTeamMenu(){
  $("teamMenu").replaceChildren(...AVAIL.map(t=>{
    const a=el("a",{role:"menuitemradio","aria-checked":"false",href:"#"+t.slug,tabindex:"-1","data-code":t.code,text:t.name});
    a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();pickTeam(t)}; // modified clicks open a tab
    return a;
  }));
}
function markTeam(t){
  const b=$("teamSw");b.textContent=t.name;b.setAttribute("aria-label","切換球隊，目前："+t.name);
  for(const a of teamItems())a.setAttribute("aria-checked",String(a.dataset.code===t.code));
}
function placeTeamMenu(){
  const r=$("teamSw").getBoundingClientRect(),s=$("teamMenu").style;
  s.top=Math.round(r.bottom+scrollY+4)+"px";s.left=Math.round(r.left+scrollX)+"px";s.minWidth=Math.max(150,Math.round(r.width))+"px";
}
let menuY=0; // scrollY when the menu opened
function openTeamMenu(focusCurrent){
  $("teamMenu").hidden=false;placeTeamMenu();menuY=scrollY;
  $("teamSw").setAttribute("aria-expanded","true");$("teamSwBox").classList.add("open");
  if(focusCurrent){const it=teamItems();(it.find(a=>a.getAttribute("aria-checked")==="true")||it[0])?.focus({preventScroll:true})}
}
function closeTeamMenu(refocus){
  if($("teamMenu").hidden)return;
  if(refocus)$("teamSw").focus({preventScroll:true}); // before hiding, so focus never drops to <body>
  $("teamMenu").hidden=true;$("teamSw").setAttribute("aria-expanded","false");$("teamSwBox").classList.remove("open");
}
// Close first, then switch a frame later: route() re-themes :root and rebuilds every tile in one blocking task.
function pickTeam(t){
  closeTeamMenu(true);
  if(T&&T.code===t.code)return;
  requestAnimationFrame(()=>setTimeout(()=>{location.hash=t.slug},0));
}
// Keyboard clicks (detail 0: Enter/Space) open on the current team's item; mouse opens keep focus on the button.
$("teamSw").onclick=e=>{if($("teamMenu").hidden)openTeamMenu(e.detail===0);else closeTeamMenu(false)};
$("teamSw").addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!$("teamMenu").hidden){e.preventDefault();closeTeamMenu(false);return}
  if(e.key==="Tab"){closeTeamMenu(false);return} // a mouse-opened menu keeps focus on the button
  if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
  e.preventDefault();if($("teamMenu").hidden)openTeamMenu(true);else teamItems().find(a=>a.getAttribute("aria-checked")==="true")?.focus({preventScroll:true});
});
$("teamMenu").addEventListener("keydown",e=>{
  const it=teamItems(),n=it.length,i=it.indexOf(document.activeElement);
  if(e.key==="Escape"){e.preventDefault();closeTeamMenu(true);return}
  if(e.key==="Tab"){closeTeamMenu(true);return} // the default Tab then moves on from the button
  if(e.key==="Enter"||e.key===" "){e.preventDefault();if(i>=0)it[i].click();return}
  const j=e.key==="ArrowDown"?(i+1)%n:e.key==="ArrowUp"?(i+n-1)%n:e.key==="Home"?0:e.key==="End"?n-1:-1;
  if(j<0)return;
  e.preventDefault();it[j].focus({preventScroll:true});
});
$("teamMenu").addEventListener("focusout",e=>{
  const to=e.relatedTarget;if(to&&!$("teamMenu").contains(to)&&to!==$("teamSw"))closeTeamMenu(false);
});
document.addEventListener("pointerdown",e=>{
  if(!$("teamMenu").hidden&&!$("teamMenu").contains(e.target)&&!$("teamSwBox").contains(e.target))closeTeamMenu(false);
});
window.addEventListener("resize",()=>{if(!$("teamMenu").hidden)placeTeamMenu()});
// The menu lives in the document (not the sticky top bar): scrolling would carry it over the top bar, so close it.
// Small shifts (mobile address bar) are ignored.
window.addEventListener("scroll",()=>{if(Math.abs(scrollY-menuY)>40)closeTeamMenu($("teamMenu").contains(document.activeElement))},{passive:true});

// ---------- top bar ----------
// Pick tab: counts follow the 顯示 select and search (like the groups below); the stats tab counts the whole roster.
// Stats ranks the whole team, so there the row is plain counts (not buttons); pos is kept for the pick tab.
function renderRail(){
  const pt=$("posTabs"),pick=tab==="pick";pt.replaceChildren();
  pt.setAttribute("aria-label",pick?"守備位置":"各守位已保留人數");
  const cnt=railCounts(pick?ROSTER.filter(shown):ROSTER,sel,GORD);
  for(const k of["all",...GORD]){
    const{kept,tot}=cnt[k],label=k==="all"?"全部":GN[k],desc=`${label}：已保留 ${kept}，共 ${tot} 人`;
    const face=el("span",pick?{}:{"aria-hidden":"true"},
      el("span",{class:"l",text:label}),
      el("span",{class:"n"},el("b",{class:"k",text:kept}),el("span",{class:"t",text:"/"+tot})));
    if(!pick){pt.append(el("div",{class:"pc-tab ro"},face,el("span",{class:"sr",text:desc})));continue}
    const b=el("button",{class:"pc-tab","aria-pressed":String(pos===k),"aria-label":desc},face);
    b.onclick=()=>setPos(k);pt.append(b);
  }
  $("showSel").value=showFilter;
  $("showBox").hidden=$("searchBox").hidden=tab!=="pick";
}
$("showSel").onchange=e=>{showFilter=e.target.value;renderRail();renderGroups()};
function setPos(k){
  pos=k;renderRail();renderGroups();
  const top=document.querySelector("#app main").getBoundingClientRect().top+window.scrollY-$("top").offsetHeight-4;
  if(window.scrollY>top)window.scrollTo({top,behavior:"smooth"});
}
try{new ResizeObserver(()=>document.documentElement.style.setProperty("--hh",$("top").offsetHeight+"px")).observe($("top"))}catch(e){}

// ---------- picker ----------
// shown = every filter but the position (also what the rail counts); match = shown at the current position.
function shown(p){return filterMatch(p,showFilter,q,sel,isRookie)}
function match(p){return posMatch(p,pos)&&shown(p)}
function tileIds(box){return[...box.querySelectorAll(".tile")].map(b=>b.dataset.id)}
// One player tile. full = the list is at the limit (unselected tiles are dimmed); show = this team shows stat lines.
function tileEl(p,full,show){
  const on=sel.has(p.id);
  const pic=photo(p,"pic");
  pic.append(el("span",{class:"no",text:p.no}));
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
  const info=el("button",{type:"button",class:"info","data-id":p.id,"aria-label":p.n+" 詳細資料"});
  info.innerHTML='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 5.2v4.6"/><path d="M6 2.4v.1"/></svg>';
  info.onclick=()=>openDetail(p,info);
  longPress(b,()=>openDetail(p,info,true));
  const big=el("span",{class:"big","aria-hidden":"true"});
  big.innerHTML='<svg viewBox="0 0 24 24"><path d="M2.8 13.4l2.6-2.2 4.2 3.6C12.6 10.4 16.4 6.6 21.4 3.6l.9 1.3C17.4 9 13.6 13.6 10.6 20z"/></svg>';
  return el("div",{class:"tw"+(on?" on":"")},b,info,big);
}
// Group-header 全選／全部取消 for the ids currently shown in group g.
function bulkButton(g,ids){
  const bs=bulkState(ids,sel,LIMIT,listMode==="pick"),add=bs.mode==="add";
  const title=!add?`移出 ${ids.length} 位${GN[g]}`
    :bs.disabled&&bs.need?`名額不足（需 ${bs.need}，剩 ${bs.left}）`
    :bs.need?`保留 ${bs.need} 位${GN[g]}`
    :"已全部保留";
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
  const tileId=ae.classList.contains("tile")||ae.classList.contains("info")?ae.dataset.id:null,infoFocus=ae.classList.contains("info");
  return{tileId,infoFocus,bulkG:ae.classList.contains("bulk")?ae.dataset.g:null,prevIds:tileId?tileIds(box):[]};
}
function restoreFocus(box,f){
  if(!f)return;
  if(f.tileId){
    const id=nextFocusId(f.prevIds,tileIds(box),f.tileId),t=id&&box.querySelector(`.${f.infoFocus?"info":"tile"}[data-id="${id}"]`);
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
  const full=listMode==="pick"&&sel.size>=LIMIT,show=statsShown(DATA.teams[T.code]); // cut mode is not capped
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
  if(!any)box.append(el("div",{class:"empty"},el("b",{text:"沒有符合條件的球員"}),"換個篩選條件試試。"));
  restoreFocus(box,focus);
}
// Every selection change goes through keepDraft(), which also cancels a pending 送出 confirmation (the count changed).
// It also cancels a pending mode switch: the second press must not throw away an edit made after the first.
function keepDraft(){store("rl-draft-"+T.code,JSON.stringify([...sel]));disarmSave();disarmListMode()}
function rosterIds(){return ROSTER.map(p=>p.id)}
// The selection when entering a team or following another tab: the stored draft, else the mode's start (not saved as a draft).
function draftOrStart(raw){
  try{const d=JSON.parse(raw||"null");if(Array.isArray(d))return new Set(d.filter(id=>BY[id]))}catch(e){}
  return listModeStart(listMode,rosterIds());
}
function bulkToggle(ids){
  const bs=bulkState(ids,sel,LIMIT,listMode==="pick");if(bs.disabled)return;
  const next=new Set(sel);for(const id of ids)bs.mode==="add"?next.add(id):next.delete(id);
  sel=next;keepDraft();renderAll();
}
function toggle(id){
  if(sel.has(id))sel.delete(id);else{if(listMode==="pick"&&sel.size>=LIMIT){toast(CAP_MSG);return}sel.add(id)}
  keepDraft();renderAll();
}

// ---------- count + actions ----------
function renderDock(){
  const n=sel.size;
  $("selN").textContent=n;$("selBar").style.width=Math.min(100,n/LIMIT*100)+"%";
  const why=shareBlockReason(n,LIMIT); // aria-disabled, not disabled: a tap still explains why (over the limit is not a list to share)
  for(const id of["copyTxt","mkImg"]){const b=$(id);b.disabled=false;if(why)b.setAttribute("aria-disabled","true");else b.removeAttribute("aria-disabled")}
  $("clear").disabled=n===0;
  renderListMode();
}
// ---------- list mode (挑選／刪減) ----------
const LIST_MODE_NAME={cut:"刪減",pick:"挑選"}, LIST_MODE_DESC={cut:"點擊欲釋出的球員",pick:"點選要保留的球員"};
// Keyed by the mode being switched to: pick empties the list, cut keeps the whole team.
const LIST_MODE_ARM_MSG={pick:"再按一次切換，名單會清空",cut:"再按一次切換，改為整隊保留"};
function renderListMode(){
  const n=sel.size,over=listModeOver(n,LIMIT),name=LIST_MODE_NAME[listMode],other=LIST_MODE_NAME[otherListMode(listMode)];
  const b=$("modeBtn"),h=$("modeHint"),t=h.querySelector(".t");
  b.classList.toggle("arm",listModeArmed);h.classList.toggle("arm",listModeArmed);
  if(listModeArmed)$("modeName").textContent="確定？";else $("modeName").replaceChildren(name,el("span",{class:"md",text:"模式"}));
  $("moveN").textContent=`移出 ${over} 人`;$("moveN").hidden=!over||listModeArmed;
  b.setAttribute("aria-label",listModeArmed?"確定？"+LIST_MODE_ARM_MSG[otherListMode(listMode)]:`${name}模式，已保留 ${n} / ${LIMIT}${over?`，需移出 ${over} 人`:""}。按下改用${other}模式`);
  h.title=`按下改用${other}模式`;
  if(listModeArmed)t.textContent=LIST_MODE_ARM_MSG[otherListMode(listMode)];else t.replaceChildren(el("b",{text:name+"模式"}),"："+LIST_MODE_DESC[listMode]);
  h.hidden=tab!=="pick";
}
// Unedited (the mode's start list): switch at once. Edited: the first press arms both controls for 3 s, the second switches.
function pressListMode(){
  if(!T)return;
  if(listModeArmed||listModePristine(listMode,sel,rosterIds())){switchListMode();return}
  listModeArmed=true;clearTimeout(listModeTimer);
  listModeTimer=setTimeout(()=>{listModeArmed=false;renderListMode()},3000);
  renderListMode();toast(LIST_MODE_ARM_MSG[otherListMode(listMode)]);
}
function disarmListMode(){clearTimeout(listModeTimer);if(listModeArmed){listModeArmed=false;if(T)renderListMode()}}
function switchListMode(){
  disarmListMode();
  listMode=otherListMode(listMode);store("rl-mode-"+T.code,listMode);
  sel=listModeStart(listMode,rosterIds());keepDraft();renderAll();
}
$("modeBtn").onclick=$("modeHint").onclick=pressListMode;
function fmt(t){const d=new Date(t);return isNaN(d)?"":`${d.getMonth()+1}/${d.getDate()} ${hhmm(t)}`}
const LOCKED_MSG="球團名單已公布，送出已截止";
const curSaveState=()=>saveState({saving,saved,sel,locked,mineFailed,limit:LIMIT});
function renderStatus(){
  const s=$("status"),btn=$("save");s.replaceChildren();
  const k=curSaveState(),armed=saveArmed&&!k.disabled,why=saveBlockReason(k);
  btn.disabled=k.disabled&&!why;
  if(why)btn.setAttribute("aria-disabled","true");else btn.removeAttribute("aria-disabled");
  btn.classList.toggle("dirty",!armed&&!k.disabled&&(k.kind==="changed"||k.kind==="unsent")); // no dot on a button that cannot be pressed (over the limit)
  btn.classList.toggle("arm",armed);
  btn.querySelector(".lb").textContent=armed?"確定送出？":k.label;
  if(k.kind==="locked")btn.title=LOCKED_MSG;else if(k.over)btn.title=`移出 ${k.over} 人後才能送出`;else btn.removeAttribute("title");
  s.title=k.kind==="locked"?LOCKED_MSG:"";
  if(k.kind==="saving")s.append("送出中…");
  else if(k.kind==="connecting")s.append("連線中…");
  else if(k.kind==="locked")s.append(el("span",{class:"st-long",text:"球團名單已公布，"}),"送出已截止"); // phones show the short half
  else if(k.kind==="unknown")s.append(el("span",{class:"warn",text:"無法確認送出狀態"}));
  else if(k.kind==="empty")s.append("點選球員加入名單");
  else if(k.kind==="sent")s.append("已送出"+(savedAt?" "+fmt(savedAt):""));
  else s.append(el("span",{class:"pend",text:k.kind==="changed"?"有未送出的變更":"尚未送出"})); // unsent is the normal state, not a warning
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
  const why=saveBlockReason(curSaveState());if(why){toast(why);return}
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
    toast((here?"":name+"：")+(ids.length?"已送出 "+ids.length+" 人名單":"已撤回你的名單"),"ok");
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
  renderStatus();toast(`名單未滿 ${LIMIT} 人，再按一次送出`);
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
  sel.clear();keepDraft();renderAll();toast("已清空名單（尚未送出）","ok");
};
$("save").onclick=save;

// ---------- official list (flag) ----------
// Club decision pill for the stats-tab ranking rows only (picker tiles intentionally omit it). null without an official list.
function clubMark(id){
  if(!clubKept)return null;
  const keep=clubKept.has(id),label=keep?"保留":"未保留",g=keep?"✓":"✗";
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
// Why there is no hit rate yet: /mine is still loading or failed. (Nothing submitted shows no line at all.)
function mineHint(){return mineFailed?"讀取失敗，連線恢復後重試。":"讀取你送出的名單中…"}
// D3 section rule: ── title ── with an optional centred sub line.
function secHead(title,sub){
  return el("div",{class:"ans-h"},el("h2",{text:title}),sub?el("span",{text:sub}):null);
}
function answerBlock(a,N){
  const box=el("section",{class:"ans","aria-label":"對答案"});
  const d=offDate(officialList.updated);
  box.append(secHead("對答案",d?`球團名單 ${d} 公布`:"球團名單已公布"));
  const hit=el("div",{class:"hit"});
  if(a.mine)hit.append(el("div",{class:"big"},"你的名單和球團重疊 ",el("b",{text:a.mine.x}),el("small",{text:" / "+a.mine.denom})," 人"));
  else if(a.mineState==="unknown")hit.append(el("div",{class:"hint",text:mineHint()})); // nothing submitted: no line
  if(a.fanAvg!=null)hit.append(el("div",{class:"big"},"球迷平均重疊 ",el("b",{text:a.fanAvg.toFixed(1)})," 人"));
  if(hit.childNodes.length)box.append(hit);
  if(a.mine){
    const by=ids=>ids.map(id=>({p:BY[id]})).filter(x=>x.p).sort((x,y)=>sortP(x.p,y.p));
    box.append(el("div",{class:"ags"},group("你保留、球團未保留",by(a.mine.mineOnly)),group("你未保留、球團保留",by(a.mine.officialOnly))));
  }
  if(!a.diff){box.append(el("p",{class:"hint",text:"樣本數不足。"}));return box}
  const hot=new Set([...a.upsets.dropped,...a.upsets.kept].map(x=>x.p.id)); // most extreme 3 each side
  const li=x=>el("li",{class:hot.has(x.p.id)?"hot":""},el("span",{class:"n2",text:x.p.no}),x.p.n,el("small",{text:Math.round(x.r*100)+"%"}));
  const col=(title,items)=>el("div",{class:"dc"},el("h3",{text:title+" "+items.length+" 人"}),
    items.length?el("ol",{},...items.map(li)):el("p",{class:"hint",text:"沒有"}));
  box.append(
    el("div",{class:"dcs"},col("球迷保留、球團未保留",a.diff.fanKeepClubDrop),col("球迷未保留、球團保留",a.diff.fanDropClubKeep)),
    el("p",{class:"hint",text:`球迷保留 = 保留率前 ${LIMIT} 名；${warnWord(T)}為爆冷（球迷 ${Math.round(OFF_UPSET*100)}% 以上保留、球團卻未保留，或 ${Math.round((1-OFF_UPSET)*100)}% 以下保留、球團卻保留）。`}));
  return box;
}

// ---------- you vs most fans (P2-2) ----------
function mineBlock(m){
  const box=el("section",{class:"ans mvf","aria-label":"你和多數球迷不同的決定"});
  box.append(secHead("你和多數球迷不同","百分比為其他球迷保留率"));
  if(m.state==="unsent"){box.append(el("p",{class:"hint",text:"送出名單後顯示結果。"}));return box}
  if(m.state==="few"){box.append(el("p",{class:"hint",text:"樣本數不足。"}));return box}
  if(!m.keptLow.length&&!m.droppedHigh.length){box.append(el("p",{class:"hint",text:"沒有明顯不同。"}));return box}
  box.append(el("div",{class:"ags"},group("你保留、球迷多半未保留",m.keptLow,true),group("你未保留、球迷多半保留",m.droppedHigh,true)));
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
  const box=$("statsBody"),refocus=document.activeElement?.id==="rankMore";
  if(refocus)document.activeElement.blur(); // see renderGroups: drop focus before removing its subtree
  box.replaceChildren();
  if(!stats){box.append(el("div",{class:"empty"},el("b",{text:"載入中…"})));return}
  if(stats.error){box.append(el("div",{class:"empty"},el("b",{text:"暫時讀不到統計"}),"結果異常，將自動重試。"));return}
  const N=stats.n||0,cnt=stats.counts||{};
  // Hit rate from the submitted list only (P1-6); fan average, consensus and upsets from the (frozen once locked) stats.
  const ans=clubKept?offAnswer({roster:ROSTER,counts:cnt,N,saved,official:[...clubKept],cmp:sortP}):null;
  if(ans)box.append(answerBlock(ans,N));
  if(!N){
    box.append(el("div",{class:"empty"},el("b",{text:"還沒有人送出"+T.name+"的名單"}),"送出名單後顯示結果。"));
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
    [N>=3?split:NO_VALUE,"意見分歧"],
  ];
  for(const[v,k]of kpis)kp.append(el("div",{class:"kpi"},el("div",{class:"v",text:v}),el("div",{class:"k",text:k})));
  box.append(kp);
  const mvf=mineVsFans({roster:ROSTER,counts:cnt,N,saved,cmp:sortP});
  if(!(ans&&mvf.state==="unsent"))box.append(mineBlock(mvf)); // with the answer block shown, nothing submitted means no mvf box (no "submit first" hint)
  const list=el("div",{class:"rank"+(clubKept?" club":""),style:"--cd:"+String(N).length}); // --cd = digits of N, sizes the count column
  const row=x=>{
    const cls=["rk"];if(sel.has(x.p.id))cls.push("mine");if(N>=3&&x.r>=.35&&x.r<=.65)cls.push("split");
    return el("div",{class:cls.join(" ")},el("div",{class:"r",text:x.rank}),photo(x.p,"av"),
      el("div",{class:"nm"},el("span",{class:"n2",text:x.p.no}),x.p.n,clubOff(x),el("small",{text:posLabel(x.p)})),
      el("div",{class:"track"},el("i",{style:`width:${(x.r*100).toFixed(1)}%`})),
      el("div",{class:"pc"},el("span",{text:Math.round(x.r*100)+"%"}),el("small",{text:`${x.c}/${N}`})));
  };
  // Club pill only where the club went against the consensus line (dropped above it / kept below it).
  // Shown only with the answer columns (enough lists, OFF_MIN_N): the pills are exactly those players.
  const clubOff=x=>{const m=ans&&ans.diff&&clubMark(x.p.id);return m&&m.keep!==(x.rank<=LIMIT)?m.node:null};
  // ranks 1–20, toggle, (open) 21–LIMIT, cut row, LIMIT+1… — the toggle stays put, only rows below it appear.
  const part=rankParts(rows,RANK_PREVIEW,LIMIT);
  list.append(...part.head.map(row));
  if(part.more){
    const b=el("button",{type:"button",class:"rank-more",id:"rankMore","aria-expanded":String(rankOpen),"aria-controls":"rankMid",
      "data-n":rows.length,text:rankToggleText(rows.length,rankOpen,LIMIT,RANK_PREVIEW)});
    b.onclick=toggleRank;
    const mid=el("div",{id:"rankMid"},...part.mid.map(row));mid.hidden=!rankOpen;
    list.append(b,mid);
  }
  if(part.tail.length)list.append(el("div",{class:"cut"},`▲ 共識 ${LIMIT} 人保留線`,el("span",{text:"以下未進共識名單"})),...part.tail.map(row));
  box.append(list);
  if(refocus&&part.more)$("rankMore").focus({preventScroll:true});
  box.append(el("p",{class:"note"},
    el("span",{text:`● 為你保留的球員；虛線為 50%；${warnWord(T)}為意見分歧。`+(clubKept?`✗ 未保留 = 共識 ${LIMIT} 人內但球團未保留；✓ 保留 = 共識外但球團保留。`:"")}),
    el("span",{},"重新送出會覆蓋舊名單。",el("span",{id:"statsAt",text:statsAtText()}))));
}
// Only the rows below the toggle change, so it is updated in place (no rebuild, nothing above it moves).
function toggleRank(){
  rankOpen=!rankOpen;
  const b=$("rankMore");$("rankMid").hidden=!rankOpen;
  b.setAttribute("aria-expanded",String(rankOpen));b.textContent=rankToggleText(+b.dataset.n,rankOpen,LIMIT,RANK_PREVIEW);
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
// Another tab edited this team's draft or switched its list mode: follow it (and drop any pending confirmation here).
window.addEventListener("storage",e=>{
  if(!T)return;
  if(e.key==="rl-mode-"+T.code){listMode=normListMode(e.newValue);sel=draftOrStart(store("rl-draft-"+T.code))}
  else if(e.key==="rl-draft-"+T.code)sel=draftOrStart(e.newValue);
  else return;
  disarmSave();disarmListMode();renderAll();
});
$("q").oninput=e=>{q=e.target.value;renderRail();renderGroups()};

// ---------- export ----------
function groupsOf(){return GORD.split("").map(g=>({g,on:ROSTER.filter(p=>p.g===g&&sel.has(p.id)).sort(sortP)}))}
function droppedPlayers(){return ROSTER.filter(p=>!sel.has(p.id)).sort(sortP)}
function listText(){
  const gs=groupsOf(),dropped=droppedPlayers();
  const L=["我的"+T.name+" 2027 "+LIMIT+" 人契約保留名單","保留 "+sel.size+" / "+LIMIT+" 人｜"+gs.map(x=>GN[x.g]+" "+x.on.length).join("、"),""];
  for(const x of gs){if(!x.on.length)continue;L.push("【"+GN[x.g]+" "+x.on.length+"】",x.on.map(p=>p.n).join("、"),"")}
  if(dropped.length)L.push("【未保留 "+dropped.length+"】",dropped.map(p=>p.n).join("、"),"");
  L.push(location.origin+location.pathname+"#"+T.slug); // no query string (fbclid etc.)
  return L.join("\n");
}
let toastT=0;
const TOAST_ICON={
  ok:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.3l3 3 6-6.3"/></svg>',
  warn:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.4v.1"/></svg>',
};
// kind "ok" = something finished (check icon); anything else is a warning. Longer messages stay up longer.
// Desktop CSS places it under the top bar (--tt), which sits lower until the hero scrolls away.
function toast(msg,kind){
  const t=$("toast");
  t.hidden=true;void t.offsetWidth; // a toast replacing a visible one replays the entry animation
  t.innerHTML=TOAST_ICON[kind==="ok"?"ok":"warn"];t.append(msg);
  placeToast();t.hidden=false;
  clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},Math.max(2400,msg.length*90));
}
function placeToast(){
  const b=$("top").getBoundingClientRect().bottom; // 0 while the app is hidden
  $("toast").style.setProperty("--tt",Math.round(Math.min(Math.max(b,0),innerHeight-80))+10+"px");
}
for(const ev of["scroll","resize"])window.addEventListener(ev,()=>{if(!$("toast").hidden)placeToast()},{passive:true});
// Modals (#sheet, #detail): focus moves in on open, Tab stays inside, and closing returns focus to the button that opened it.
let sheetUrl=null,modalOpener=null;
function activeModal(){return["sheet","detail"].map($).find(m=>!m.hidden)||null}
// A re-render while a modal was open replaces the tiles: find the same player's ⓘ again.
function restoreModalFocus(){
  let o=modalOpener;modalOpener=null;
  if(o&&!o.isConnected&&o.classList.contains("info"))o=document.querySelector(`.info[data-id="${o.dataset.id}"]`);
  if(o&&o.isConnected&&!o.disabled)o.focus();
}
function openSheet(label,kids,opener,acts=[]){
  if(!$("detail").hidden)closeDetail(); // one modal at a time, so Esc closes the one on screen
  modalOpener=opener||null;
  $("sheet").setAttribute("aria-label",label);$("sheetA").replaceChildren(...acts);$("sheetBody").replaceChildren(...kids);$("sheet").hidden=false;$("sheetX").focus();
}
function closeSheet(){
  $("sheet").hidden=true;$("sheetA").replaceChildren();$("sheetBody").replaceChildren();if(sheetUrl){URL.revokeObjectURL(sheetUrl);sheetUrl=null}
  restoreModalFocus();
}
const SVG_X='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const SVG_EXT='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
function withSvg(e,svg){e.insertAdjacentHTML("beforeend",svg);return e}
// Player detail dialog (the tile title, reachable on phones): opened by the tile's ⓘ or a long-press on the tile.
// iOS ghost click: a long-press opens the dialog under the finger, and the lift may click the scrim or a control in it.
// So the scrim closes only when the press also started on it, and after a long-press the first click inside is dropped
// (a new press inside clears that).
let detailDown=null,detailEat=false;
function openDetail(p,opener,byPress){
  modalOpener=opener||null;detailDown=null;detailEat=!!byPress;
  const shown=l=>l.shown?{class:"shown"}:{},tb=detailTable(p),tier=tierNote(p);
  const x=withSvg(el("button",{type:"button",class:"detail-x","aria-label":"關閉"}),SVG_X);x.onclick=closeDetail;
  const table=tb&&el("table",{},
    el("thead",{},el("tr",{},el("th"),...tb.levels.map(l=>el("th",{scope:"col",...shown(l),text:l.name})))),
    el("tbody",{},...tb.rows.map(r=>el("tr",{},el("th",{scope:"row",text:r.label}),...r.values.map((v,i)=>el("td",{...shown(tb.levels[i]),text:v}))))));
  $("detailBody").replaceChildren(x,
    el("div",{class:"hd"},el("span",{class:"wm","aria-hidden":"true",text:p.no}),photo(p,"av","detail"), // own slot: the tile behind the dialog (pic) and the kept stats ranking (av) hold their own nodes
      el("div",{class:"hc"},el("span",{class:"tm","aria-hidden":"true",text:T.en}),
        el("h3",{id:"detailT",class:isLongName(p.n)?"long":""},el("span",{class:"n",text:p.no})," ",p.n),
        el("ul",{class:"meta"},...detailChips(p,DATA.updated,posLabel(p)).map(c=>el("li",c.kind?{class:c.kind,text:c.text}:{text:c.text}))))),
    el("div",{class:"bd"},el("div",{class:"sec",text:DATA.updated.slice(0,4)+" SEASON"}),
      table||el("p",{class:"none",text:NO_GAMES}),tier&&el("p",{class:"tier",text:tier}),
      withSvg(el("a",{class:"ext",href:playerUrl(p),target:"_blank",rel:"noopener"},"中職官網球員頁"),SVG_EXT)));
  $("detail").hidden=false;x.focus();
}
function closeDetail(){$("detail").hidden=true;$("detailBody").replaceChildren();restoreModalFocus()}
function modalFocusables(m){return[...m.querySelectorAll('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null)}
$("sheetX").onclick=closeSheet;
$("sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closeSheet()});
$("detail").addEventListener("pointerdown",e=>{detailDown=e.target;detailEat=false},true);
$("detail").addEventListener("click",e=>{if(!detailEat)return;detailEat=false;e.preventDefault();e.stopImmediatePropagation()},true);
$("detail").addEventListener("click",e=>{if(e.target.id==="detail"&&detailDown===e.target)closeDetail()});
document.addEventListener("keydown",e=>{
  const m=activeModal();if(!m)return;
  if(e.key==="Escape"){if(m.id==="sheet")closeSheet();else closeDetail();return}
  if(e.key!=="Tab")return;
  const f=modalFocusables(m);if(!f.length)return;
  const first=f[0],last=f[f.length-1],inside=m.contains(document.activeElement);
  if(e.shiftKey&&(!inside||document.activeElement===first)){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&(!inside||document.activeElement===last)){e.preventDefault();first.focus()}
});
$("copyTxt").onclick=()=>{
  const why=shareBlockReason(sel.size,LIMIT);if(why){toast(why);return}
  const t=listText();
  const fb=()=>{const ta=el("textarea",{class:"ta",readonly:"","aria-label":"名單文字"});ta.value=t;
    openSheet("名單文字",[el("p",{class:"hint",text:"複製失敗，請手動複製。"}),ta],$("copyTxt"));
    setTimeout(()=>{ta.focus();ta.select()},0)};
  try{navigator.clipboard.writeText(t).then(()=>toast("已複製 "+sel.size+" 人名單到剪貼簿","ok"),fb)}catch(e){fb()}
};
async function drawCard(){
  const W=1080,H=1350,P=72,LW=150,IW=W-2*P-LW,FS=34,BOT=1314;
  const gs=groupsOf().filter(x=>x.on.length),dropped=droppedPlayers();
  const TH=deriveTheme(T).light;
  const ink=TH["--ink"],muted=TH["--muted"],line=TH["--line"];
  const SANS='"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif',NUM='"Rajdhani","Arial Narrow",sans-serif';
  const title="我的"+T.name+" 60 人保留名單";
  const all=title+"未保留人0123456789"+GORD.split("").map(g=>GN[g]).join("")+ROSTER.map(p=>p.n).join("");
  try{
    await Promise.all([
      document.fonts.load("400 28px "+SANS,all),document.fonts.load("500 34px "+SANS,all),
      document.fonts.load("700 34px "+SANS,all),
      document.fonts.load("700 28px "+NUM,"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·"),
    ]);
  }catch(e){}
  const cv=document.createElement("canvas");cv.width=W;cv.height=H;const c=cv.getContext("2d");
  const bandFill=(y,h)=>{
    const g=c.createLinearGradient(0,y,W*.35,y+h);g.addColorStop(0,T.band);g.addColorStop(1,mixHex(T.band,T.acc,.3));
    c.fillStyle=g;c.fillRect(0,y,W,h);
    c.save();c.beginPath();c.rect(0,y,W,h);c.clip();c.strokeStyle="rgba(255,255,255,.06)";c.lineWidth=6;
    for(let i=-h;i<W+h;i+=27){c.beginPath();c.moveTo(i,y+h);c.lineTo(i+h,y);c.stroke()}
    c.restore();
  };
  const layout=(names,cols,w,weight,size)=>{
    c.font=weight+" "+size+"px "+SANS;
    return shotCells(names,cols,n=>c.measureText(n).width<=w/cols-14);
  };
  const grid=(L,x0,y,w,cols,rowH,col,weight,size)=>{
    const cw=w/cols;c.fillStyle=col;c.textAlign="center";c.font=weight+" "+size+"px "+SANS;
    for(const it of L.cells)c.fillText(it.n,x0+it.k*cw+it.sp*cw/2,y+it.r*rowH+rowH*.7,it.sp*cw-14);
    c.textAlign="left";return y+L.rows*rowH;
  };
  const kL=gs.map(x=>layout(x.on.map(p=>p.n),5,IW,500,FS));
  const dL=dropped.length?layout(dropped.map(p=>p.n),6,IW,400,28):null;
  const {rH,dH}=shotRowHeights(kL.reduce((s,l)=>s+l.rows,0),dL?dL.rows:0,gs.length);
  c.fillStyle=TH["--page"];c.fillRect(0,0,W,H);
  bandFill(0,195);c.fillStyle=T.acc;c.fillRect(0,185,W,10);
  c.textAlign="left";c.fillStyle=deriveTheme(T).light["--band-muted"];c.font="700 28px "+NUM;
  c.letterSpacing="6px";c.fillText(T.en.toUpperCase()+" · 2027",P,67);c.letterSpacing="0px";
  let ts=84;for(;ts>40;ts--){c.font="700 "+ts+"px "+SANS;if(c.measureText(title).width<=W-2*P)break}
  c.fillStyle="#fff";c.font="700 "+ts+"px "+SANS;c.fillText(title,P,147,W-2*P);
  let y=221;
  gs.forEach((x,i)=>{
    c.fillStyle=line;c.fillRect(P,y+6,W-2*P,2);
    c.fillStyle=ink;c.font="700 34px "+SANS;c.fillText(GN[x.g],P+20,y+Math.min(rH,60)*.7+14);
    c.fillStyle=T.acc;c.fillRect(P,y+14+rH*.18,6,rH*.64);
    y=grid(kL[i],P+LW,y+14,IW,5,rH,ink,500,FS)+12;
  });
  if(dL){
    y+=4;c.fillStyle=ink;c.fillRect(P,y,W-2*P,3);c.fillRect(P,y+8,W-2*P,1);
    const lb=y+Math.min(rH,60)*.7;
    c.fillStyle=muted;c.font="700 34px "+SANS;c.fillText("未保留",P+20,lb+14);
    c.font="400 26px "+SANS;c.fillText(dropped.length+" 人",P+20,lb+52);
    const ge=grid(dL,P+LW,y+14,IW,6,dH,muted,400,28);
    y=Math.max(ge,lb+52+8);
  }
  bandFill(BOT,36);c.fillStyle=T.acc;c.fillRect(0,BOT,W,5);
  return cv;
}
$("mkImg").onclick=async()=>{
  const why=shareBlockReason(sel.size,LIMIT);if(why){toast(why);return}
  const b=$("mkImg"),lb=b.querySelector(".lb");b.disabled=true;lb.textContent="產生中…";
  try{
    const cv=await drawCard();
    const blob=await new Promise(r=>cv.toBlob(r,"image/png"));if(!blob)throw 0;
    if(sheetUrl)URL.revokeObjectURL(sheetUrl);sheetUrl=URL.createObjectURL(blob);
    const fname=T.short+"契約保留名單.png";
    const line=isLineBrowser(navigator.userAgent); // LINE cannot save the image at all: no download, just the notice
    const acts=line?[]:[el("a",{class:"btn",href:sheetUrl,download:fname},el("span",{text:"下載 PNG"}))];
    const file=new File([blob],fname,{type:"image/png"});
    if(!line&&navigator.canShare&&navigator.canShare({files:[file]})){
      const sh=el("button",{class:"btn"},el("span",{text:"分享"}));
      sh.onclick=async()=>{try{await navigator.share({files:[file],title:T.name+"契約保留名單"})}catch(e){}};acts.push(sh);
    }
    // The preview is a data: URL (not the blob URL): some in-app browsers cannot long-press-save blob images.
    const kids=[el("img",{class:"shot",src:cv.toDataURL("image/png"),alt:"我的契約保留球員名單"})];
    if(line)kids.push(el("p",{class:"hint inapp",text:"LINE 不支援匯出圖片，請改用 Safari／Chrome 開啟。"}));
    else if(isInAppBrowser(navigator.userAgent))kids.push(el("p",{class:"hint inapp",text:"長按圖片可存到相簿；無法儲存請改用 Safari／Chrome 開啟。"}));
    else if(matchMedia("(pointer:coarse)").matches)kids.push(el("p",{class:"hint",text:"長按圖片可存到相簿。"}));
    openSheet("名單圖片",kids,b,acts);
  }catch(e){toast("圖片產生失敗，請再試一次")}
  b.disabled=false;lb.textContent="存成圖片";
};

function showOfficialCopy(){
  const h=$("heroOff"),club=!!(officialList&&clubKept);
  if(!T||(!club&&!locked)){h.hidden=true;return}
  const d=club?offDate(officialList.updated):"";
  const what=club?`球團的 ${officialList.season||2027} 年度保留名單${d?"（"+d+"）":""}已公布`:"球團名單已公布";
  h.textContent=locked
    ?`${what}，送出已截止。`
    :`${what}，可到「大家的統計」對答案。`;
  h.hidden=false;
}

// ---------- boot ----------
initMode();
(async()=>{
  try{DATA=await (await fetch("data/teams.json",{cache:"no-cache"})).json()}catch(e){document.body.append(el("p",{class:"in",text:"載入失敗，請重新整理。"}));return}
  const [yy,mm,dd]=String(DATA.updated||"").split("-");
  if(dd)$("srcDate").textContent=`${yy} 年 ${+mm} 月 ${+dd} 日`;
  if(FLAGS.official){
    // dev (localhost) reads the sample list; a missing file just leaves the feature hidden
    try{
      const r=await fetch(IS_LOCAL?"data/official.sample.json":"data/official.json",{cache:"no-cache"});
      if(r.ok){const j=await r.json();if(j&&j.teams)officialList=j}
    }catch(e){}
    if(officialList)$("disclaimer").textContent="球團名單依中職公告；球迷名單僅為模擬。";
  }
  AVAIL=TEAMS.filter(t=>DATA.teams[t.code]);
  buildTeamMenu();
  window.addEventListener("hashchange",()=>{route();window.scrollTo(0,0)});
  route();
})();
