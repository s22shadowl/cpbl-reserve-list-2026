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
// Same /stats payload ({n, counts}) as the one already shown? null or an error placeholder never matches.
function sameTally(a,b){
  if(!a||!b||a.error||b.error||a.n!==b.n)return false;
  const x=a.counts||{},y=b.counts||{},keys=Object.keys(x);
  if(keys.length!==Object.keys(y).length)return false;
  for(const k of keys)if(x[k]!==y[k])return false;
  return true;
}
