"use strict";
// Long-press (touch / pen only; a mouse has hover titles): after ms without moving more than slop px, call onLong()
// and swallow the click that ends the same press so the element does not also act on it.
function longPress(el,onLong,ms=500,slop=10){
  let t=0,x=0,y=0,eat=false;
  const stop=()=>{clearTimeout(t);t=0};
  el.addEventListener("pointerdown",e=>{
    eat=false;stop(); // a new press: a click left armed by a press whose click never came must not eat this one
    if(e.pointerType==="mouse"||!e.isPrimary)return;
    x=e.clientX;y=e.clientY;
    t=setTimeout(()=>{t=0;eat=true;onLong()},ms);
  });
  el.addEventListener("pointermove",e=>{if(t&&Math.hypot(e.clientX-x,e.clientY-y)>slop)stop()});
  for(const ev of["pointerup","pointercancel","pointerleave"])el.addEventListener(ev,stop);
  el.addEventListener("click",e=>{if(!eat)return;eat=false;e.preventDefault();e.stopImmediatePropagation()},true);
  el.addEventListener("contextmenu",e=>e.preventDefault());
}
