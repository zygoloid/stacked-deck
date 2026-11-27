// Before an automated deploy: check that the database instance has not been
// locked down by the infra kill switch (DENY_ALL: { ".read": false, ".write": false }),
// so a push to main cannot silently overwrite a lockdown with database.rules.json.
// Restoring rules after a lockdown is done by hand (`firebase deploy --only
// database:stacked-deck`; see infra/README.md).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { isLockedDown } from '../../tools/ci-pages.js';
import { PROJECT, INSTANCE } from '../config.js';

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--instance');
  const instance = i >= 0 ? args[i + 1] : INSTANCE;
  const require = createRequire(import.meta.url);
  const { initializeApp } = require('firebase-admin/app');
  const { getDatabaseWithUrl } = require('firebase-admin/database');
  const app = initializeApp({ projectId: PROJECT });
  try {
    const db = getDatabaseWithUrl(`https://${instance}.firebaseio.com`, app);
    const raw = await db.getRulesJSON();
    if (isLockedDown(raw)) {
      console.error(`The database (${instance}) is locked down by the kill switch (DENY_ALL).`);
      console.error('Investigate the lockdown and restore database rules by hand before deploying; nothing was deployed.');
      process.exitCode = 1;
      return;
    }
    console.log(`database rules on ${instance} are active (not locked down)`);
  } finally {
    await app.delete();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
