/*
 * index.js
 * Cloud Functions entry point. Requiring src/dispatch.js and
 * src/publish.js registers "dispatch" and "publish" with
 * functions-framework (each calls functions.http(...) itself). Deployed
 * as two separate Cloud Functions via different --entry-point flags at
 * deploy time -- the same multi-function-in-one-source-dir pattern as
 * build #3's Go functions.
 * Connects to: src/dispatch.js, src/publish.js
 * Created: 2026-07-13
 */

require("./src/dispatch");
require("./src/publish");
