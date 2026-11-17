"use strict";
// Stats ranking: head = top RANK_PREVIEW rows, mid = the rest up to the limit (behind the toggle), tail = past the limit
// (always shown, under the cut row). more = there is a mid to hide (no toggle otherwise).
const RANK_PREVIEW=20;
function rankParts(rows,preview,limit){
  if(rows.length<=preview)return{head:rows,mid:[],tail:[],more:false};
  return{head:rows.slice(0,preview),mid:rows.slice(preview,limit),tail:rows.slice(limit),more:true};
}
// Toggle label naming the hidden range, e.g. 展開第 21～60 名 (one rank: 展開第 21 名).
function rankToggleText(n,open,limit,preview){
  const a=preview+1,b=Math.min(limit,n);
  return(open?"收起":"展開")+"第 "+(b>a?a+"～"+b:a)+" 名";
}
