"use strict";
// Season stats line for player tiles. p.s = {A:{…},D:{…}} with only the levels played (see roadmap P0-10):
// batters {g,pa,avg,ops,hr}, pitchers {g,ip,era,whip,so}; rates/innings are display strings, e.g. "0.282", "36.1".
const STAT_LEVELS=[["A","一軍"],["D","二軍"]], NO_GAMES="本季未出賽";

function isPitcher(p){return p.g==="P"}
// "36.1" innings = 36 full innings + 1 out
function ipOuts(ip){const[w,f]=String(ip).split(".");return(+w||0)*3+(+f||0)}
// ".282" like a scoreboard; "1.051" stays as is
function rate(v){return String(v).replace(/^0(?=\.)/,"")}
function workload(p,row){return isPitcher(p)?ipOuts(row.ip):row.pa}
// level with more playing time ("A" wins ties), or null when the player has no games
function statLevel(p){
  let best=null;
  for(const[k]of STAT_LEVELS){const row=p.s&&p.s[k];if(row&&(best===null||workload(p,row)>workload(p,p.s[best])))best=k}
  return best;
}
function levelName(k){return STAT_LEVELS.find(([c])=>c===k)[1]}
function statLine(p){
  const k=statLevel(p);if(!k)return NO_GAMES;
  const r=p.s[k];
  return levelName(k)+" "+(isPitcher(p)?`ERA ${r.era} · ${r.ip} 局`:`${rate(r.avg)} · OPS ${rate(r.ops)}`);
}
function statTitle(p){
  const rows=STAT_LEVELS.filter(([k])=>p.s&&p.s[k]);
  if(!rows.length)return NO_GAMES;
  return rows.map(([k,name])=>{
    const r=p.s[k];
    return name+" "+(isPitcher(p)
      ?`${r.g} 場 · ${r.ip} 局 · ERA ${r.era} · WHIP ${r.whip} · 奪三振 ${r.so}`
      :`${r.g} 場 · ${r.pa} 打席 · 打擊率 ${rate(r.avg)} · OPS ${rate(r.ops)} · 全壘打 ${r.hr}`);
  }).join("\n");
}
