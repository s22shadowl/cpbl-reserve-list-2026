"use strict";
// Picker filters: position (the rail tabs) and everything else (the 顯示 select + search), so the rail can count with the rest.
function posMatch(p,pos){return pos==="all"||p.g===pos}
function filterMatch(p,show,q,sel,rookie){
  if(show==="kept"&&!sel.has(p.id))return false;
  if(show==="dropped"&&sel.has(p.id))return false;
  if(show==="new"&&!rookie(p))return false;
  const s=(q||"").trim();
  return!s||p.n.includes(s)||p.no===s||String(+p.no)===s;
}
// Kept / total per group (and "all") over the given players.
function railCounts(players,sel,order){
  const c={all:{kept:0,tot:0}};for(const g of order)c[g]={kept:0,tot:0};
  for(const p of players){const k=sel.has(p.id)?1:0;c.all.tot++;c.all.kept+=k;if(order.includes(p.g)){c[p.g].tot++;c[p.g].kept+=k}}
  return c;
}
