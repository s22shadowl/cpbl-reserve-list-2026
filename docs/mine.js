"use strict";
// P2-2 "you vs most fans": compare the submitted list against everyone else's.
// Rates exclude your own submitted vote, so you never pull the majority toward yourself.
const MINE_MIN_OTHERS=10, MINE_LOW=.3, MINE_HIGH=.7;
function mineVsFans({roster,counts,N,saved,cmp}){
  if(!saved||!saved.size)return{state:"unsent"};
  const others=N-1;
  if(others<MINE_MIN_OTHERS)return{state:"few",others};
  const rows=roster.map(p=>{const own=saved.has(p.id)?1:0;return{p,own,r:Math.max(0,(counts[p.id]||0)-own)/others}});
  const eps=1e-9;
  return{
    state:"ok",others,
    keptLow:rows.filter(x=>x.own&&x.r<=MINE_LOW+eps).sort((a,b)=>a.r-b.r||cmp(a.p,b.p)),
    droppedHigh:rows.filter(x=>!x.own&&x.r>=MINE_HIGH-eps).sort((a,b)=>b.r-a.r||cmp(a.p,b.p)),
  };
}
