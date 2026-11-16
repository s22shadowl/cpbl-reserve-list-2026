"use strict";
// Corner info on a player tile: age, one badge (新人 > FA > draft year) and the full description for title/aria-label.
function isRookie(p){return p.rk==="d"||p.rk==="c"}
// Age on the data's own date (DATA.updated), never the browser clock; null when birth/ref are missing or malformed.
function ageOn(birth,ref){
  const re=/^(\d{4})-(\d{2})-(\d{2})$/,b=re.exec(birth),r=re.exec(ref);
  if(!b||!r)return null;
  const[by,bm,bd]=b.slice(1).map(Number),[ry,rm,rd]=r.slice(1).map(Number);
  if(bm<1||bm>12||bd<1||bd>31)return null;
  const age=ry-by-(rm<bm||(rm===bm&&rd<bd)?1:0);
  return age>=0?age:null;
}
function cornerBadge(p){
  if(isRookie(p))return{kind:"rookie",text:"新人"};
  if(p.tag)return{kind:"fa",text:p.tag};
  if(p.dy)return{kind:"dy",text:String(p.dy),small:"選秀"};
  return null;
}
function draftText(p){return p.dy?`${p.dy} 年選秀`+(p.dr?`第 ${p.dr} 輪`:""):""}
function cardNote(p,ref){
  const age=ageOn(p.b,ref),parts=[];
  if(age!=null)parts.push(age+" 歲");
  // Converted rookies are "this season" by definition; no year, so stale data never names the wrong one.
  if(isRookie(p)){parts.push("新人："+(p.rk==="d"?draftText(p):"今年自培轉正"));if(p.tag)parts.push(p.tag)}
  else if(p.dy)parts.push(draftText(p));
  return parts.join(" · ");
}
// Tag beside the name where the layout has room (stats ranking).
