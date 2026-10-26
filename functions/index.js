// Cloud Functions for this game (the `stacked-deck` codebase). Deploy with
// `firebase deploy --only functions:stacked-deck`; the predeploy step copies
// the game's engine, levels and scoring code into game/. See docs/online.md.
import { initializeApp } from 'firebase-admin/app';
import { getDatabaseWithUrl } from 'firebase-admin/database';
import { logger } from 'firebase-functions';
import { onValueCreated } from 'firebase-functions/v2/database';
import { INSTANCE, INSTANCE_URL, REGION, RUNTIME_SERVICE_ACCOUNT } from './config.js';
import { processSolution } from './solutions.js';

const app = initializeApp();
// Always this game's instance, never the project's default database.
const db = () => getDatabaseWithUrl(INSTANCE_URL, app);

// Every function is capped: a few instances, one request each, short
// timeouts and no retries, so no input can run up much compute.
const LIMITS = {
  region: REGION, serviceAccount: RUNTIME_SERVICE_ACCOUNT,
  memory: '512MiB', cpu: 1, concurrency: 1, maxInstances: 2, timeoutSeconds: 30,
};

export const scoreSolution = onValueCreated(
  { ...LIMITS, ref: '/solutions/{uid}/{level}/{hash}', instance: INSTANCE, retry: false },
  async (event) => {
    const result = await processSolution(db(), event.params);
    logger.info('scoreSolution', { ...event.params, result });
  },
);
