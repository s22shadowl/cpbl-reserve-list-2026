"use strict";
// Official-list answer key (roadmap P1-3): pure logic, no DOM. Players are {id,...}; counts = {id: keeps}; N = lists submitted.
// LIMIT comes from limit.js (loaded first).
const OFF_MIN_N=10, OFF_UPSET=.7, OFF_UPSET_MAX=3;
// mine/official: id arrays. x = shared, denom = min(LIMIT, my count). null when I have no list.
function offOverlap(mine,official){
  const m=new Set(mine||[]);if(!m.size)return null;
  const o=new Set(official||[]);
  return{x:[...m].filter(id=>o.has(id)).length,denom:Math.min(LIMIT,m.size),mineOnly:[...m].filter(id=>!o.has(id)),officialOnly:[...o].filter(id=>!m.has(id))};
}
// average number of club-kept players a fan also kept
function offFanAverage(counts,N,official){
  if(!N)return 0;let s=0;for(const id of official)s+=counts[id]||0;return s/N;
}
// same order as the stats ranking (count desc, then cmp); top = above the keep line
function offConsensus(roster,counts,N,limit,cmp){
  const rows=roster.map(p=>({p,c:counts[p.id]||0,r:N?(counts[p.id]||0)/N:0})).sort((a,b)=>b.c-a.c||cmp(a.p,b.p));
  return{top:rows.slice(0,limit),rest:rows.slice(limit)};
}
const byRate=d=>(a,b)=>d*(b.r-a.r);
// fans keep >=70% but the club dropped / fans keep <=30% but the club kept; most extreme first, 3 each
function offUpsets(roster,counts,N,official){
  const o=new Set(official),rows=roster.map(p=>({p,c:counts[p.id]||0,r:N?(counts[p.id]||0)/N:0}));
  return{
    dropped:rows.filter(x=>!o.has(x.p.id)&&x.r>=OFF_UPSET).sort(byRate(1)).slice(0,OFF_UPSET_MAX),
    kept:rows.filter(x=>o.has(x.p.id)&&x.r<=1-OFF_UPSET+1e-9).sort(byRate(-1)).slice(0,OFF_UPSET_MAX),
  };
}
function offAnswer({roster,counts,N,mine,official,limit=LIMIT,cmp}){
  const out={mine:offOverlap(mine,official),fanAvg:null,diff:null,upsets:null};
  if(N<OFF_MIN_N)return out;
  const o=new Set(official),{top,rest}=offConsensus(roster,counts,N,limit,cmp);
  out.fanAvg=offFanAverage(counts,N,official);
  out.diff={fanKeepClubDrop:top.filter(x=>!o.has(x.p.id)).sort(byRate(1)),fanDropClubKeep:rest.filter(x=>o.has(x.p.id)).sort(byRate(1))};
  out.upsets=offUpsets(roster,counts,N,official);
  return out;
}
