"use strict";
// Which tile should hold keyboard focus after a re-render: the same one if still shown, else its nearest surviving neighbour (next first, then previous).
function nextFocusId(prevIds,nextIds,id){
  if(id==null||!nextIds.length)return null;
  if(nextIds.includes(id))return id;
  const shown=new Set(nextIds),i=prevIds.indexOf(id);
  if(i<0)return null;
  const after=prevIds.slice(i+1).find(x=>shown.has(x));
  if(after!==undefined)return after;
  const before=prevIds.slice(0,i).reverse().find(x=>shown.has(x));
  return before!==undefined?before:null;
}
