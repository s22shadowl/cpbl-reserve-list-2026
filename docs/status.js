"use strict";
// Submit-button state from what is selected vs. what the server holds.
// saved: Set of the submitted ids, or null while unknown (/mine still loading, or failed when mineFailed).
// locked: the Worker reported the official lists are out (roadmap P1-6). label: the button text; clearing a
// submitted list turns the button into 撤回名單.
function sameSet(a,b){if(!a||a.size!==b.size)return false;for(const x of a)if(!b.has(x))return false;return true}
function saveState({saving,saved,sel,locked=false,mineFailed=false,limit=Infinity}){
  const over=Math.max(0,sel.size-limit);
  const label=!sel.size&&saved&&saved.size?"撤回名單":"送出名單";
  if(saving)return{kind:"saving",disabled:true,label,over};
  if(locked)return{kind:"locked",disabled:true,label:"已截止",over};
  // Unknown: still allow submitting a selection (the Worker decides).
  if(saved===null)return{kind:mineFailed?"unknown":"connecting",disabled:!sel.size||over>0,label,over};
  const had=saved.size>0;
  if(!sel.size&&!had)return{kind:"empty",disabled:true,label,over};
  if(!sameSet(saved,sel))return{kind:had?"changed":"unsent",disabled:over>0,label,over};
  return{kind:"sent",disabled:true,label,over};
}
// Submitting fewer than the limit (but some) needs a second press; an empty list is a withdrawal, not confirmed.
function needsConfirm(n,limit){return n>0&&n<limit}
// Toast text for a failed POST /picks by the Worker's error code (network errors have none).
function submitError(code,status){
  if(code==="rate_limited"||status===429)return"今日已達到送出次數上限";
  if(code==="bad_ids")return"名單已更新，請重新整理";
  if(code==="locked")return"送出已截止";
  return"請稍後再試";
}
// Same /stats payload ({n, counts}) as the one already shown? null or an error placeholder never matches.
function sameTally(a,b){
  if(!a||!b||a.error||b.error||a.n!==b.n)return false;
  const x=a.counts||{},y=b.counts||{},keys=Object.keys(x);
  if(keys.length!==Object.keys(y).length)return false;
  for(const k of keys)if(x[k]!==y[k])return false;
  return true;
}
// Stats last loaded at loadedAt (ms; 0 = never) are refetched when the page becomes visible again after maxAge.
const STATS_STALE_MS=60000;
function statsStale(loadedAt,now,maxAge=STATS_STALE_MS){return!loadedAt||now-loadedAt>maxAge}
// "HH:MM" in local time for a timestamp; "" when invalid.
function hhmm(t){
  const d=new Date(t),p=v=>String(v).padStart(2,"0");
  return t==null||isNaN(d)?"":p(d.getHours())+":"+p(d.getMinutes());
}
