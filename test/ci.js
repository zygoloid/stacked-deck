// Tests for the CI/deploy helpers (tools/ci-pages.js and tools/check-rules-version.js).
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { RULES_VERSION } from '../src/engine.js';
import { isLockedDown, resolveRefs, waitForArtifact } from '../tools/ci-pages.js';

// 1. Kill-switch DENY_ALL detection.
assert.strictEqual(isLockedDown({ rules: { '.read': false, '.write': false } }), true);
assert.strictEqual(isLockedDown('{"rules":{".read":false,".write":false}}'), true);
assert.strictEqual(isLockedDown({ rules: { '.read': false } }), true);
const liveRules = readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
assert.strictEqual(isLockedDown(liveRules), false, 'game database.rules.json is not DENY_ALL');
assert.strictEqual(isLockedDown({ rules: { '.read': true, '.write': false } }), false);

// 2. check-rules-version.js CLI.
const checkVer = (arg) => execFileSync(
  process.execPath,
  [new URL('../tools/check-rules-version.js', import.meta.url).pathname, arg],
  { stdio: 'pipe', encoding: 'utf8' },
);
assert.match(checkVer(String(RULES_VERSION)), /matches/);
assert.throws(() => checkVer(String(RULES_VERSION - 1)), /rules version change/);

// 3. resolveRefs: mock GitHub REST API.
const makeFetch = (routes) => async (url) => {
  const u = new URL(url);
  const key = `${u.pathname}${u.search}`;
  const hit = routes[key];
  if (!hit) return { ok: false, status: 404, text: async () => `not found: ${key}` };
  const status = hit.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => hit.body,
    text: async () => JSON.stringify(hit.body),
  };
};

const M_V10 = '1111111111111111111111111111111111111111';
const M_V11_FAILED = '2222222222222222222222222222222222222222';
const B_PREV = 'aaaa111111111111111111111111111111111111';
const B_NEW = 'bbbb222222222222222222222222222222222222';

// Beta push while main's latest deployment failed (or main has an unmigrated commit):
// liveRef stays pinned to M_V10 (last successful main Pages deployment), never M_V11_FAILED.
{
  const fetchFn = makeFetch({
    '/repos/o/r/deployments?environment=github-pages&ref=main&per_page=30': {
      body: [
        { id: 102, sha: M_V11_FAILED, created_at: '2026-11-27T10:00:00Z' },
        { id: 101, sha: M_V10, created_at: '2026-11-25T10:00:00Z' },
      ],
    },
    '/repos/o/r/deployments/102/statuses?per_page=30': { body: [{ state: 'failure' }] },
    '/repos/o/r/deployments/101/statuses?per_page=30': { body: [{ state: 'inactive' }, { state: 'success' }] },
  });
  const got = await resolveRefs({
    ref: 'refs/heads/beta', sha: B_NEW, repo: 'o/r', apiUrl: 'https://api.github.com', fetchFn,
  });
  assert.deepStrictEqual(got, { liveRef: M_V10, betaRef: B_NEW });
}

// Beta push when main has never succeeded on github-pages fails closed instead of falling back to main.
{
  const fetchFn = makeFetch({
    '/repos/o/r/deployments?environment=github-pages&ref=main&per_page=30': { body: [] },
  });
  await assert.rejects(
    resolveRefs({ ref: 'refs/heads/beta', sha: B_NEW, repo: 'o/r', fetchFn }),
    /No successful github-pages deployment found for main/,
  );
}

// Main push with an active beta: publishes main's exact GITHUB_SHA and the last
// successful beta Pages SHA (ignoring an untested/in-progress B_NEW at tip of beta).
{
  const fetchFn = makeFetch({
    '/repos/o/r/git/ref/heads/beta': { body: { object: { sha: B_NEW } } },
    '/repos/o/r/deployments?environment=github-pages&ref=main&per_page=30': {
      body: [{ id: 101, sha: M_V10, created_at: '2026-11-25T10:00:00Z' }],
    },
    '/repos/o/r/deployments/101/statuses?per_page=30': { body: [{ state: 'success' }] },
    '/repos/o/r/deployments?environment=github-pages&ref=beta&per_page=30': {
      body: [{ id: 105, sha: B_PREV, created_at: '2026-11-26T10:00:00Z' }],
    },
    '/repos/o/r/deployments/105/statuses?per_page=30': { body: [{ state: 'success' }] },
  });
  const got = await resolveRefs({
    ref: 'refs/heads/main', sha: M_V11_FAILED, repo: 'o/r', fetchFn,
  });
  assert.deepStrictEqual(got, { liveRef: M_V11_FAILED, betaRef: B_PREV });
}

// Main push when beta branch does not exist: betaRef is empty.
{
  const fetchFn = makeFetch({});
  const got = await resolveRefs({
    ref: 'refs/heads/main', sha: M_V10, repo: 'o/r', fetchFn,
  });
  assert.deepStrictEqual(got, { liveRef: M_V10, betaRef: '' });
}

// Main push after old beta was deleted, main deployed, and a brand-new diverged beta was created.
{
  const fetchFn = makeFetch({
    '/repos/o/r/git/ref/heads/beta': { body: { object: { sha: B_NEW } } },
    '/repos/o/r/deployments?environment=github-pages&ref=main&per_page=30': {
      body: [{ id: 200, sha: M_V10, created_at: '2026-11-27T10:00:00Z' }],
    },
    '/repos/o/r/deployments/200/statuses?per_page=30': { body: [{ state: 'success' }] },
    '/repos/o/r/deployments?environment=github-pages&ref=beta&per_page=30': {
      body: [{ id: 150, sha: B_PREV, created_at: '2026-11-01T10:00:00Z' }],
    },
    '/repos/o/r/deployments/150/statuses?per_page=30': { body: [{ state: 'success' }] },
    [`/repos/o/r/compare/${B_PREV}...${B_NEW}`]: { body: { status: 'diverged' } },
  });
  const got = await resolveRefs({
    ref: 'refs/heads/main', sha: M_V10, repo: 'o/r', fetchFn,
  });
  assert.deepStrictEqual(got, { liveRef: M_V10, betaRef: B_NEW });
}

// 4. waitForArtifact: retries empty/expired REST listings until indexed, and fails on timeout.
{
  let calls = 0, sleeps = 0;
  const fetchFn = async () => {
    calls++;
    if (calls === 1) return { ok: true, status: 200, json: async () => ({ total_count: 0, artifacts: [] }) };
    if (calls === 2) return { ok: true, status: 200, json: async () => ({ total_count: 1, artifacts: [{ id: 1, name: 'github-pages', expired: true }] }) };
    return { ok: true, status: 200, json: async () => ({ total_count: 1, artifacts: [{ id: 42, name: 'github-pages', expired: false, size_in_bytes: 540000 }] }) };
  };
  const art = await waitForArtifact({
    repo: 'o/r', runId: '999', attempts: 5, intervalMs: 10, fetchFn, sleepFn: async () => { sleeps++; },
  });
  assert.strictEqual(art.id, 42);
  assert.strictEqual(calls, 3);
  assert.strictEqual(sleeps, 2);

  await assert.rejects(
    waitForArtifact({
      repo: 'o/r', runId: '999', attempts: 2, intervalMs: 1,
      fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ total_count: 0, artifacts: [] }) }),
      sleepFn: async () => {},
    }),
    /was not indexed/,
  );
}

console.log('ci helpers ok');
