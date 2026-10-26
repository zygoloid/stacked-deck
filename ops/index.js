// Project-wide Cloud Functions (the `ops` codebase): the kill switch for the
// shared games project. Deploy with `firebase deploy --only functions:ops`.
// See docs/online.md ("Shared project controls") and killswitch.js.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { logger } from 'firebase-functions';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { REGION, RUNTIME_SERVICE_ACCOUNT, BUDGET_TOPIC, BUDGET_FRACTION, CHECK_SCHEDULE } from './config.js';
import { budgetExceeded, overLimits, readUsage, lockdown } from './killswitch.js';

const credential = applicationDefault();
const app = initializeApp({ credential });
const token = async () => (await credential.getAccessToken()).access_token;

const OPTIONS = {
  region: REGION, serviceAccount: RUNTIME_SERVICE_ACCOUNT,
  memory: '256MiB', maxInstances: 1, timeoutSeconds: 120,
};

// The billing budget's notifications (published to BUDGET_TOPIC).
export const budgetKillSwitch = onMessagePublished({ ...OPTIONS, topic: BUDGET_TOPIC, retry: false }, async (event) => {
  const msg = event.data.message.json;
  logger.info('budget notification', { cost: msg?.costAmount, budget: msg?.budgetAmount, threshold: msg?.alertThresholdExceeded });
  if (!budgetExceeded(msg, BUDGET_FRACTION)) return;
  await lockdown({ app, fetchFn: fetch, token: await token(), log: logger, reason: `spent ${msg.costAmount} of a ${msg.budgetAmount} budget` });
});

// Database usage, checked every few minutes: faster than billing data, which
// can lag by hours.
export const usageKillSwitch = onSchedule({ ...OPTIONS, schedule: CHECK_SCHEDULE }, async () => {
  const t = await token();
  const usage = await readUsage(fetch, t);
  logger.info('database usage', usage);
  const over = overLimits(usage);
  if (over.length) await lockdown({ app, fetchFn: fetch, token: t, log: logger, reason: `over limits: ${over.join(', ')}` });
});
