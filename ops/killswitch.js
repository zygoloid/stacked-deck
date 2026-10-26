// The kill switch: deny-all rules on every Realtime Database instance in the
// project, when the billing budget is reached or database usage passes
// LIMITS. Denied requests cost almost nothing, and with writes refused no
// function is triggered. Undo it by redeploying each game's rules.
import { getDatabaseWithUrl } from 'firebase-admin/database';
import { PROJECT, LIMITS, KNOWN_INSTANCE_URLS } from './config.js';

export const DENY_ALL = { rules: { '.read': false, '.write': false } };

// Billing budgets publish their status several times a day, whether or not a
// threshold has been crossed, so only a message saying actual spend has
// reached `fraction` of the budget counts.
export function budgetExceeded(msg, fraction) {
  if (!msg || typeof msg !== 'object') return false;
  if (typeof msg.alertThresholdExceeded === 'number' && msg.alertThresholdExceeded >= fraction) return true;
  return typeof msg.costAmount === 'number' && typeof msg.budgetAmount === 'number' &&
    msg.budgetAmount > 0 && msg.costAmount >= fraction * msg.budgetAmount;
}

// Which limits the usage passes (empty if none).
export function overLimits(usage, limits = LIMITS) {
  const over = [];
  if (usage.sentBytesPerHour > limits.sentBytesPerHour) over.push('sentBytesPerHour');
  if (usage.storedBytes > limits.storedBytes) over.push('storedBytes');
  return over;
}

// Sum every point of every series in a Monitoring API timeSeries.list reply.
export function sumSeries(reply) {
  let total = 0;
  for (const series of reply?.timeSeries ?? []) {
    for (const p of series.points ?? []) total += Number(p.value?.int64Value ?? p.value?.doubleValue ?? 0);
  }
  return total;
}

async function getJSON(fetchFn, url, token) {
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()} from ${url.split('?')[0]}`);
  return res.json();
}

// One Monitoring API query, summed over the whole project: each call returns
// one time series, so the checks stay well inside the free allowance.
async function metricTotal(fetchFn, token, metric, { windowSeconds, aligner }) {
  const end = new Date();
  const start = new Date(end - windowSeconds * 1000);
  const params = new URLSearchParams({
    filter: `metric.type="firebasedatabase.googleapis.com/${metric}"`,
    'interval.startTime': start.toISOString(),
    'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': `${windowSeconds}s`,
    'aggregation.perSeriesAligner': aligner,
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });
  return sumSeries(await getJSON(fetchFn, `https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries?${params}`, token));
}

// Database usage across the project: bytes sent in the last hour, and the
// most stored in the last day.
export async function readUsage(fetchFn, token) {
  return {
    sentBytesPerHour: await metricTotal(fetchFn, token, 'network/sent_bytes_count', { windowSeconds: 3600, aligner: 'ALIGN_SUM' }),
    storedBytes: await metricTotal(fetchFn, token, 'storage/total_bytes', { windowSeconds: 86400, aligner: 'ALIGN_MAX' }),
  };
}

// The URLs of every database instance in the project: the known ones, plus
// any the management API lists (so a new game's instance is covered too).
export async function instanceUrls(fetchFn, token, log) {
  const urls = new Set(KNOWN_INSTANCE_URLS);
  try {
    const reply = await getJSON(fetchFn, `https://firebasedatabase.googleapis.com/v1beta/projects/${PROJECT}/locations/-/instances`, token);
    for (const inst of reply.instances ?? []) if (inst.databaseUrl) urls.add(inst.databaseUrl);
  } catch (e) {
    log.error('kill switch: could not list database instances; locking the known ones', { error: String(e) });
  }
  return [...urls];
}

// Deny all reads and writes on every instance. Safe to repeat.
export async function lockdown({ app, fetchFn, token, log, reason }) {
  log.error(`kill switch: locking down every database (${reason})`);
  const urls = await instanceUrls(fetchFn, token, log);
  for (const url of urls) {
    try {
      await getDatabaseWithUrl(url, app).setRules(DENY_ALL);
      log.error(`kill switch: locked ${url}`);
    } catch (e) {
      log.error(`kill switch: failed to lock ${url}`, { error: String(e) });
    }
  }
  return urls;
}
