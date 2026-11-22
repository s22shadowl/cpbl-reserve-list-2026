"use strict";
// Player-detail dialog helpers (pure). Uses card.js (ageOn, isRookie, draftText) and stats.js (levels, tiers, val, rate).
function detailChips(p,ref,pos){
  const c=[],add=(text,kind="")=>c.push({text,kind});
  if(pos)add(pos,"k");
  if(p.l)add(p.l);
  const age=ageOn(p.b,ref);if(age!=null)add(age+" 歲");
  if(isRookie(p)){add("新人","tg");add(p.rk==="d"?draftText(p):"今年自培轉正")}
  else if(p.dy)add(draftText(p));
  if(p.tag)add(p.tag,"tg");
  return c;
}
function detailTable(p){
  const ks=STAT_LEVELS.filter(([k])=>p.s&&p.s[k]);
  if(!ks.length)return null;
  const best=statLevel(p),pit=isPitcher(p);
  const levels=ks.map(([k,name])=>({k,name,shown:ks.length===2&&k===best}));
  const cols=pit?[["出賽","g",val],["局數","ip",val],["ERA","era",val],["WHIP","whip",val],["奪三振","so",val]]
    :[["出賽","g",val],["打席","pa",val],["打擊率","avg",rate],["OPS","ops",rate],["全壘打","hr",val]];
  return{levels,rows:cols.map(([label,f,fmt])=>({label,values:ks.map(([k])=>fmt(p.s[k][f]))}))};
}
function tierNote(p){
  const t=statTier(p),pit=isPitcher(p);
  if(t==="low")return"樣本少：不到 "+(pit?LOW_OUTS/3+" 局":LOW_PA+" 打席")+"，卡片上以淡色顯示";
  if(t==="core")return"一軍主力："+(pit?CORE_OUTS/3+" 局":CORE_PA+" 打席")+"以上，卡片上以粗體顯示";
  return null;
}
function isLongName(name){return String(name).length>=6}
function playerUrl(p){return "https://www.cpbl.com.tw/team/person?Acnt="+p.id}
