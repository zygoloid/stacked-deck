// Helpers for .github/workflows/deploy.yml:
//   node tools/ci-pages.js resolve-refs   pick the exact live and beta SHAs to publish
//   node tools/ci-pages.js wait-artifact  wait until GitHub's REST API lists the Pages artifact
//
// Why `resolve-refs` is needed:
// - GitHub Pages publishes one tree (`/` live, `/beta/` beta). If a push to
//   `beta` simply checked out `refs/heads/main`, it would publish an
//   unmigrated `main` commit whose `firebase` job stopped on a `RULES_VERSION`
//   mismatch (or failed for any other reason), and even on `main` a floating
//   `ref: main` could pick up a newer commit pushed while `firebase` ran.
// - Instead, `main` publishes its own `GITHUB_SHA` at `/` and the last
//   successfully published `beta` SHA at `/beta/` (if `refs/heads/beta` still
//   exists); `beta` publishes its own `GITHUB_SHA` at `/beta/` and keeps `/`
//   at the commit `main` last published to `github-pages`.
//
// Why `wait-artifact` (plus retrying `actions/deploy-pages`) is needed:
// - `actions/upload-pages-artifact` finalizes via Twirp storage, while
//   `actions/deploy-pages` queries Twirp `ArtifactService/ListArtifacts` (using
//   `ACTIONS_RUNTIME_TOKEN`, which GitHub only exposes to `uses:` actions, not
//   `run:` steps). Even after the REST `/actions/runs/{id}/artifacts` endpoint
//   lists the artifact (~350 ms), Twirp `ListArtifacts` replicas can still
//   return 0 artifacts ~750 ms after finalization and fail without retrying.
//   Waiting `minWaitMs` (5s) and retrying `deploy-pages` once on failure masks
//   that lag while keeping `resolve-refs` -> build -> deploy in one atomic job.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// True when `rules` (parsed JSON or JSON string) is the infra kill switch's
// DENY_ALL ruleset: `{ rules: { ".read": false, ".write": false } }` with no
// game paths, so an automated deploy must not overwrite it.
export function isLockedDown(rules) {
  const obj = typeof rules === 'string' ? JSON.parse(rules) : rules;
  const r = obj?.rules;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const keys = Object.keys(r);
  return keys.every((k) => k === '.read' || k === '.write') &&
    (r['.read'] ?? false) === false && (r['.write'] ?? false) === false;
}

async function ghGet(fetchFn, url, token, { allow404 = false } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchFn(url, { headers });
      if (allow404 && res.status === 404) return null;
      if (res.ok) return await res.json();
      const body = await res.text();
      lastErr = new Error(`GitHub API ${res.status} from ${url}: ${body.slice(0, 200)}`);
      if (res.status < 500 && res.status !== 429) throw lastErr;
    } catch (e) {
      lastErr = e;
      if (attempt === 3 || /GitHub API 4(?!29)\d\d/.test(e.message)) throw e;
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw lastErr;
}

async function latestSuccessfulPagesDeploy(fetchFn, apiBase, repo, branch, token) {
  const url = `${apiBase}/repos/${repo}/deployments?environment=github-pages&ref=${encodeURIComponent(branch)}&per_page=30`;
  const deployments = await ghGet(fetchFn, url, token);
  for (const d of deployments ?? []) {
    if (!d?.id || !d?.sha) continue;
    const statuses = await ghGet(fetchFn, `${apiBase}/repos/${repo}/deployments/${d.id}/statuses?per_page=30`, token);
    if ((statuses ?? []).some((s) => s.state === 'success')) return d;
  }
  return null;
}

export async function resolveRefs({
  ref, sha, repo, apiUrl = 'https://api.github.com', token = '', fetchFn = fetch,
}) {
  if (!repo || !sha) throw new Error('resolveRefs requires repo and sha');
  const apiBase = apiUrl.replace(/\/+$/, '');

  if (ref === 'refs/heads/beta') {
    const mainDeploy = await latestSuccessfulPagesDeploy(fetchFn, apiBase, repo, 'main', token);
    if (!mainDeploy) {
      throw new Error('No successful github-pages deployment found for main; deploy main before publishing beta.');
    }
    return { liveRef: mainDeploy.sha, betaRef: sha };
  }

  if (ref === 'refs/heads/main') {
    const betaBranch = await ghGet(fetchFn, `${apiBase}/repos/${repo}/git/ref/heads/beta`, token, { allow404: true });
    const betaHead = betaBranch?.object?.sha ?? '';
    if (!betaHead) return { liveRef: sha, betaRef: '' };

    const [mainDeploy, betaDeploy] = await Promise.all([
      latestSuccessfulPagesDeploy(fetchFn, apiBase, repo, 'main', token),
      latestSuccessfulPagesDeploy(fetchFn, apiBase, repo, 'beta', token),
    ]);
    if (!betaDeploy) return { liveRef: sha, betaRef: betaHead };
    if (!mainDeploy || betaDeploy.created_at >= mainDeploy.created_at) {
      return { liveRef: sha, betaRef: betaDeploy.sha };
    }
    // `main` deployed more recently than `beta`: keep `betaDeploy.sha` if it is
    // still an ancestor of `refs/heads/beta`; if `beta` was deleted and later
    // recreated on unrelated history, use the new branch head.
    const cmp = await ghGet(
      fetchFn,
      `${apiBase}/repos/${repo}/compare/${betaDeploy.sha}...${betaHead}`,
      token,
      { allow404: true },
    );
    const onBranch = cmp && (cmp.status === 'identical' || cmp.status === 'ahead');
    return { liveRef: sha, betaRef: onBranch ? betaDeploy.sha : betaHead };
  }

  throw new Error(`Unexpected ref for Pages deployment: ${ref}`);
}

export async function waitForArtifact({
  repo, runId, apiUrl = 'https://api.github.com', token = '', name = 'github-pages',
  minWaitMs = 5000, attempts = 30, intervalMs = 2000, fetchFn = fetch,
  sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  if (!repo || !runId) throw new Error('waitForArtifact requires repo and runId');
  if (minWaitMs > 0) await sleepFn(minWaitMs);
  const apiBase = apiUrl.replace(/\/+$/, '');
  const url = `${apiBase}/repos/${repo}/actions/runs/${encodeURIComponent(runId)}/artifacts?name=${encodeURIComponent(name)}`;
  for (let i = 1; i <= attempts; i++) {
    const body = await ghGet(fetchFn, url, token);
    const found = (body?.artifacts ?? []).find((a) => a.name === name && !a.expired);
    if (found) return found;
    if (i < attempts) await sleepFn(intervalMs);
  }
  throw new Error(`Artifact "${name}" was not indexed in GitHub REST API after ${attempts} attempts.`);
}

async function main() {
  const cmd = process.argv[2];
  const env = process.env;
  if (cmd === 'resolve-refs') {
    const { liveRef, betaRef } = await resolveRefs({
      ref: env.GITHUB_REF,
      sha: env.GITHUB_SHA,
      repo: env.GITHUB_REPOSITORY,
      apiUrl: env.GITHUB_API_URL,
      token: env.GH_TOKEN || env.GITHUB_TOKEN,
    });
    console.log(`Resolved Pages refs: live=${liveRef} beta=${betaRef || '(none)'}`);
    if (env.GITHUB_OUTPUT) {
      appendFileSync(env.GITHUB_OUTPUT, `live_ref=${liveRef}\nbeta_ref=${betaRef}\n`);
    }
    return;
  }
  if (cmd === 'wait-artifact') {
    const found = await waitForArtifact({
      repo: env.GITHUB_REPOSITORY,
      runId: env.GITHUB_RUN_ID,
      apiUrl: env.GITHUB_API_URL,
      token: env.GH_TOKEN || env.GITHUB_TOKEN,
    });
    console.log(`Pages artifact "${found.name}" indexed (id ${found.id}, ${found.size_in_bytes} bytes)`);
    return;
  }
  throw new Error(`usage: node tools/ci-pages.js <resolve-refs|wait-artifact>`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
