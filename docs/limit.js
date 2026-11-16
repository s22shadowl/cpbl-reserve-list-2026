"use strict";
// League rule (規章第 8 章第 10 條): at most 60 reserved players. Classic script loaded first; app.js, official.js and
// stats.js read this global (tests load it into the same node:vm context before those files).
const LIMIT=60;
