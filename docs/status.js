"use strict";
// Submit-button state from what is selected vs. what the server holds (saved: Set, or null while /mine is pending).
function sameSet(a,b){if(!a||a.size!==b.size)return false;for(const x of a)if(!b.has(x))return false;return true}
function saveState({saving,online,saved,sel}){
  if(saving)return{kind:"saving",disabled:true};
  if(!online&&saved===null)return{kind:"connecting",disabled:!sel.size};
  const had=!!(saved&&saved.size);
  if(!sel.size&&!had)return{kind:"empty",disabled:true};
  if(!sameSet(saved||new Set(),sel))return{kind:had?"changed":"unsent",disabled:false};
  return{kind:"sent",disabled:true};
}
