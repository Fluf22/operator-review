#!/usr/bin/env node
// Local bridge for the review list's "Publish pending review" button.
// The static page cannot use your GitHub login, so it posts here and this script runs `gh` with it.
// Safety: listens on 127.0.0.1 only, accepts only requests whose Origin is "null" (a file:// page)
// and whose Host is this loopback address, and never sends an `event`, so GitHub keeps the review
// PENDING. Only you can see a pending review until you submit it on GitHub.
// Usage: node publish-review.mjs [--port 4317]
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = Number(portFlag >= 0 ? args[portFlag + 1] : process.env.OPERATOR_REVIEW_PORT ?? 4317);
const HOST = '127.0.0.1';
const ALLOWED_HOSTS = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);
const MAX_BODY_BYTES = 512 * 1024;
const MAX_COMMENTS = 200;
const MAX_TEXT = 60_000;

// Runs `gh` with an argument array (no shell). `input` is written to stdin.
function gh(argv, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let errOut = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (errOut += chunk));
    child.on('error', (error) => reject(new Error(`could not run gh: ${error.message}`)));
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(errOut.trim() || `gh exited with ${code}`))));
    child.stdin.end(input ?? '');
  });
}

const isText = (value, max = MAX_TEXT) => typeof value === 'string' && value.length <= max;
const isRepo = (value) => typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
const isLine = (value) => Number.isInteger(value) && value >= 1 && value <= 1_000_000;

// Returns a clean payload or throws with a message for the page.
function validate(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('expected a JSON object');
  if (!isRepo(payload.repo)) throw new Error('repo must look like owner/name');
  if (!Number.isInteger(payload.pr) || payload.pr < 1 || payload.pr > 10_000_000) throw new Error('pr must be a pull request number');
  if (!isText(payload.body ?? '')) throw new Error('body is too long');
  if (!Array.isArray(payload.comments) || payload.comments.length > MAX_COMMENTS) throw new Error(`comments must be an array of at most ${MAX_COMMENTS}`);
  const comments = payload.comments.map((c, i) => {
    if (typeof c?.path !== 'string' || c.path.length === 0 || c.path.length > 500 || c.path.startsWith('/')) throw new Error(`comment ${i + 1}: bad path`);
    if (!isLine(c.line)) throw new Error(`comment ${i + 1}: line must be a positive integer`);
    if (c.start_line !== undefined && (!isLine(c.start_line) || c.start_line > c.line)) throw new Error(`comment ${i + 1}: bad start_line`);
    if (c.side !== 'RIGHT' && c.side !== 'LEFT') throw new Error(`comment ${i + 1}: side must be RIGHT or LEFT`);
    if (!isText(c.body) || c.body.trim().length === 0) throw new Error(`comment ${i + 1}: empty body`);
    return {
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
      ...(c.start_line !== undefined && c.start_line !== c.line ? { start_line: c.start_line, start_side: c.side } : {}),
    };
  });
  return { repo: payload.repo, pr: payload.pr, body: payload.body ?? '', comments };
}

async function pendingReviewOf(repo, pr, login) {
  // --paginate with a jq filter prints one JSON object per line, so parse line by line.
  const out = await gh(['api', `repos/${repo}/pulls/${pr}/reviews`, '--paginate', '-q', '.[] | select(.state == "PENDING") | {id, html_url, user: .user.login}']);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((review) => review.user === login);
}

async function publish(payload) {
  const { repo, pr, body, comments } = validate(payload);
  const login = (await gh(['api', 'user', '-q', '.login'])).trim();
  const existing = await pendingReviewOf(repo, pr, login);
  if (existing) return { status: 409, json: { error: 'A pending review already exists on this pull request.', url: existing.html_url } };

  const commitId = (await gh(['api', `repos/${repo}/pulls/${pr}`, '-q', '.head.sha'])).trim();
  // No `event` field: GitHub creates the review as PENDING, for you to submit on GitHub.
  const review = JSON.parse(
    await gh(['api', '-X', 'POST', `repos/${repo}/pulls/${pr}/reviews`, '--input', '-'], JSON.stringify({ commit_id: commitId, body, comments })),
  );
  return { status: 200, json: { id: review.id, state: review.state, url: review.html_url, comments: comments.length } };
}

function send(res, status, json, origin) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    vary: 'Origin',
  });
  res.end(JSON.stringify(json));
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  // Only a file:// page (Origin: null) on this loopback host may talk to the helper.
  if (origin !== 'null' || !ALLOWED_HOSTS.has(req.headers.host ?? '')) {
    return send(res, 403, { error: 'Only the operator-review page on this machine may use this helper.' }, 'null');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': 'null',
      'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
      // Chrome's Private Network Access check: a page may call this loopback helper only if it says so.
      'access-control-allow-private-network': 'true',
      vary: 'Origin',
    });
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    try {
      const login = (await gh(['api', 'user', '-q', '.login'])).trim();
      return send(res, 200, { ok: true, login }, 'null');
    } catch (error) {
      return send(res, 500, { error: error.message }, 'null');
    }
  }

  if (req.method === 'POST' && req.url === '/pending-review') {
    let raw = '';
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return send(res, 413, { error: 'request too large' }, 'null');
      raw += chunk;
    }
    try {
      const result = await publish(JSON.parse(raw));
      return send(res, result.status, result.json, 'null');
    } catch (error) {
      const status = error instanceof SyntaxError || /^(repo|pr|body|comment|comments)/.test(error.message) ? 400 : 502;
      return send(res, status, { error: error.message }, 'null');
    }
  }

  send(res, 404, { error: 'not found' }, 'null');
});

server.listen(PORT, HOST, () => {
  console.log(`operator-review helper listening on http://${HOST}:${PORT}`);
  console.log('It creates PENDING reviews only, never submits. Stop with Ctrl-C.');
});
