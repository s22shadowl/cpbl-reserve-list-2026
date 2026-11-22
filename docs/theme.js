"use strict";
// Team palettes + whole-page colour derivation. Classic script loaded before app.js (TEAMS, NEUTRAL, deriveTheme are
// globals there); tests/frontend/theme.test.mjs loads it with node:vm. Each team gives 5 base colours:
// band (hero/top bar), acc (accent fill), on (text on acc), ink (accent text, light mode), hi (accent text, dark mode).
// acc = the club's official primary colour; band = its official dark colour or a dark shade of the primary (roadmap P2-6).
// Secondary colours are deliberately not used. warn = optional [light, dark, name in copy] override of the shared orange --warn
// (意見分歧, 爆冷) for a team whose own accent is orange (Lions); others keep the style.css default.
// cardSwap = the picker card reads better on the accent colour than on the dark band (Brothers, Lions, Dragons; see cardColors).
// page = optional [light, dark] page colour instead of the band mix; only NEUTRAL sets it (softer picker background).
const TEAMS=[
  {code:"ACN",slug:"brothers",cardSwap:true,name:"中信兄弟",short:"兄弟",en:"CTBC Brothers",band:"#0B1B3D",acc:"#FCCF00",on:"#08132B",ink:"#7E6800",hi:"#FCCF00"},
  {code:"ADD",slug:"lions",cardSwap:true,name:"統一7-ELEVEn獅",short:"統一獅",en:"Uni-President Lions",band:"#3F1E04",acc:"#E26A10",on:"#2C1503",ink:"#AA500C",hi:"#E76C10",warn:["#B8326A","#FF85B0","桃紅色"]},
  {code:"AJL",slug:"monkeys",name:"樂天桃猿",short:"桃猿",en:"Rakuten Monkeys",band:"#490615",acc:"#850B26",on:"#FFFFFF",ink:"#850B26",hi:"#F04D71"},
  {code:"AEO",slug:"guardians",name:"富邦悍將",short:"悍將",en:"Fubon Guardians",band:"#002255",acc:"#004B90",on:"#FFFFFF",ink:"#004B90",hi:"#4FA3FF"},
  {code:"AAA",slug:"dragons",cardSwap:true,name:"味全龍",short:"味全龍",en:"Wei Chuan Dragons",band:"#360104",acc:"#C1020E",on:"#FFFFFF",ink:"#C1020E",hi:"#FD2C39"},
  {code:"AKP",slug:"hawks",name:"台鋼雄鷹",short:"雄鷹",en:"TSG Hawks",band:"#04271E",acc:"#074737",on:"#FFFFFF",ink:"#074737",hi:"#109F7B"},
];
// Shared pages (team picker): monochrome, colour only on the team cards.
const NEUTRAL={band:"#111214",acc:"#4A4D52",on:"#FFFFFF",ink:"#4A4D52",hi:"#C4C7CC",page:["#DCDDE0","#1E1F23"]};

const WHITE="#FFFFFF", BLACK="#000000";
const AA=4.6; // a little above WCAG 4.5 so rounding never tips a pair under
function hexRgb(h){const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]}
function rgbHex(c){return"#"+c.map(v=>Math.round(Math.min(255,Math.max(0,v))).toString(16).padStart(2,"0")).join("").toUpperCase()}
// mixHex(a,b,t): t=0 → a, t=1 → b (plain sRGB interpolation).
function mixHex(a,b,t){const x=hexRgb(a),y=hexRgb(b);return rgbHex(x.map((v,i)=>v+(y[i]-v)*t))}
function luminance(h){return hexRgb(h).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0)}
function contrastRatio(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
// Push fg toward `toward` in small steps until it reaches `min` contrast against bg.
function ensureContrast(fg,bg,min,toward){let c=fg;for(let t=0.05;contrastRatio(c,bg)<min&&t<=1.0001;t+=0.05)c=mixHex(fg,toward,t);return c}
// Lift a dark-mode accent fill toward white until it stands out from bg (UI contrast 3:1), never letting the text on it drop below AA.
function liftAccent(acc,on,bg){let c=acc;for(let t=0.05;contrastRatio(c,bg)<3&&t<=1.0001;t+=0.05){const n=mixHex(acc,WHITE,t);if(contrastRatio(on,n)<AA)break;c=n}return c}

// Hover fill for accent buttons: move the accent away from its text colour, so contrast only grows.
function accHover(acc,on){return mixHex(acc,luminance(on)>0.18?BLACK:WHITE,0.18)}

function deriveTheme(base){
  const {band,acc,on,ink,hi}=base; // base.warn, base.page: see TEAMS
  const rgb=h=>hexRgb(h).join(",");
  // light: tints of band/acc on white
  const lPaper=WHITE, lPage=base.page?base.page[0]:mixHex(WHITE,band,0.05);
  const lText=ensureContrast(mixHex("#202124",band,0.2),lPage,AA,BLACK);
  const light={
    "--page":lPage,"--paper":lPaper,"--ink":ensureContrast(band,lPage,AA,BLACK),"--text":lText,
    "--muted":ensureContrast(mixHex("#6E7178",band,0.25),lPage,AA,BLACK),
    "--line":base.page?mixHex(lPage,band,0.1):mixHex(WHITE,band,0.13),"--tab":mixHex(WHITE,band,0.08),
    "--tab-ink":ensureContrast(band,mixHex(WHITE,band,0.08),AA,BLACK),
    "--acc":acc,"--acc-hover":accHover(acc,on),"--on-acc":on,"--acc-ink":ink,"--acc-ink-l":ink,"--hi":hi,
    "--band":band,"--on-band":WHITE,"--band-muted":ensureContrast(mixHex(WHITE,acc,0.3),band,AA,WHITE),
    "--tile":mixHex(WHITE,band,0.15),"--soft":mixHex(WHITE,acc,0.1),"--pri-hover":mixHex(WHITE,acc,0.12),
    "--shade-rgb":rgb(mixHex(band,BLACK,0.3)),"--scrim":`rgba(${rgb(mixHex(band,BLACK,0.4))},.6)`,
  };
  // dark: shades of band/acc toward black, so each team's dark mode keeps its hue
  const dPage=base.page?base.page[1]:mixHex(BLACK,band,0.45), dPaper=mixHex(mixHex("#202024",band,0.6),acc,0.04);
  const dBand=mixHex(band,BLACK,0.25), dTab=mixHex(dPaper,WHITE,0.06), dAcc=liftAccent(acc,on,dPaper);
  const dark={
    "--page":dPage,"--paper":dPaper,"--ink":mixHex(WHITE,acc,0.06),
    "--text":ensureContrast(mixHex("#D8D8DC",acc,0.08),dPaper,AA,WHITE),
    "--muted":ensureContrast(mixHex("#9A9CA2",acc,0.12),dPaper,AA,WHITE),
    "--line":mixHex(dPaper,WHITE,0.1),"--tab":dTab,"--tab-ink":ensureContrast(mixHex(WHITE,acc,0.15),dTab,AA,WHITE),
    "--acc":dAcc,"--acc-hover":accHover(dAcc,on),"--on-acc":on,"--acc-ink":hi,"--acc-ink-l":ink,"--hi":hi,
    "--band":dBand,"--on-band":WHITE,"--band-muted":ensureContrast(mixHex(WHITE,acc,0.35),dBand,AA,WHITE),
    "--tile":mixHex(dPaper,WHITE,0.08),"--soft":mixHex(dPaper,acc,0.15),"--pri-hover":mixHex(WHITE,acc,0.12),
    "--shade-rgb":"0,0,0","--scrim":"rgba(0,0,0,.7)",
  };
  if(base.warn){light["--warn"]=base.warn[0];dark["--warn"]=base.warn[1]}
  return{light,dark};
}
// The --warn colour's name for the copy (意見分歧, 爆冷), so the text matches what the team page shows.
function warnWord(t){return t&&t.warn?t.warn[2]:"橘色"}
// Picker card: band background with an accent stripe, or (cardSwap) accent background, on-accent text and a band stripe.
function cardColors(t){return t.cardSwap?{bg:t.acc,fg:t.on,stripe:t.band}:{bg:t.band,fg:WHITE,stripe:t.acc}}
// CSS for one token map, e.g. "--page:#F7F7F7;--paper:#FFFFFF;…"
function themeDecls(m){return Object.entries(m).map(([k,v])=>k+":"+v).join(";")}
