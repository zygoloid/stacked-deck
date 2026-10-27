// Before a deploy: the server's /config/rulesVersion (JSON, as printed by
// `firebase database:get`) must equal this code's RULES_VERSION. If they
// differ, this is a rules version change, which needs its own steps (see
// "Rules versions" in docs/online.md), so the automatic deploy stops here.
//   node tools/check-rules-version.js "$(firebase database:get /config/rulesVersion ...)"
import { RULES_VERSION } from '../src/engine.js';

let server;
try { server = JSON.parse(process.argv[2] ?? ''); } catch { server = process.argv[2]; }
if (server !== RULES_VERSION) {
  console.error(`The server's config/rulesVersion is ${JSON.stringify(server)}, but this code's RULES_VERSION is ${RULES_VERSION}.`);
  console.error('A rules version change is deployed by hand (docs/online.md, "Rules versions"); nothing was deployed.');
  process.exit(1);
}
console.log(`server rules version ${server} matches`);
