"use strict";
function normListMode(v){return v==="pick"?"pick":"cut"}
function otherListMode(m){return m==="pick"?"cut":"pick"}
function listModeStart(mode,allIds){return mode==="pick"?new Set():new Set(allIds)}
function listModePristine(mode,sel,allIds){const s=listModeStart(mode,allIds);if(sel.size!==s.size)return false;for(const x of s)if(!sel.has(x))return false;return true}
function listModeOver(n,limit){return Math.max(0,n-limit)}
