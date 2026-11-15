"use strict";
// Colour-mode preference. Stored value: "light" | "dark"; anything else (absent) = auto, i.e. follow the system.
const THEME_MODES=["auto","light","dark"];
function normMode(v){return v==="light"||v==="dark"?v:"auto"}
function nextMode(m){return THEME_MODES[(THEME_MODES.indexOf(normMode(m))+1)%THEME_MODES.length]}
