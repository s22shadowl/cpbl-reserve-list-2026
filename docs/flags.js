"use strict";
// Feature flags, decided by URL only (no query override). Switch `official` on for production by adding the
// site host here once the league publishes the official list (roadmap P1-3).
const FLAGS={official:["localhost","127.0.0.1"].includes(location.hostname)};
