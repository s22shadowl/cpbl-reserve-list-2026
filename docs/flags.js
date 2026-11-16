"use strict";
// Feature flags, decided by URL only (no query override). Switch `official` on for production by adding the
// site host here once the league publishes the official list (roadmap P1-3).
// Single source of the dev-host list: app.js also uses IS_LOCAL to pick the API and the sample official file.
const LOCAL_HOSTS=["localhost","127.0.0.1"];
const IS_LOCAL=LOCAL_HOSTS.includes(location.hostname);
const FLAGS={official:IS_LOCAL};
// In-app browsers (LINE, Facebook, Instagram, Threads) often cannot download or long-press-save images (P1-6).
function isInAppBrowser(ua){return/\bLine\/|FBAN|FBAV|Instagram|Barcelona|Threads/i.test(String(ua||""))}
