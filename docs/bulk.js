"use strict";
// Group-header bulk toggle: "remove" when every shown id is selected, else "add" the shown-but-unselected ones (disabled if they exceed the free slots or there are none).
function bulkState(shownIds,selected,limit,capped=true){
  const need=shownIds.filter(id=>!selected.has(id)).length,left=Math.max(0,limit-selected.size);
  if(shownIds.length&&!need)return{mode:"remove",need:0,left,disabled:false};
  return{mode:"add",need,left,disabled:need===0||(capped&&need>left)};
}
