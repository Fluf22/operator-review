#!/usr/bin/env node
// Validate a storyboard module and emit a self-contained animated walkthrough.
// Usage: node build.mjs <storyboard.mjs> [--out <dir>] [--check]
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(skillDir, 'package.json'));
const installHint = `Run: npm install --prefix ${skillDir}`;

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const checkOnly = args.includes('--check');
const input = args.find((a, i) => !a.startsWith('--') && !(outFlag >= 0 && i === outFlag + 1));
if (!input) fail('usage: node build.mjs <storyboard.mjs> [--out <dir>] [--check]');
const moduleDir = dirname(resolve(input));

let peleEntry;
try {
  peleEntry = require.resolve('pele');
} catch {
  fail(`pele is not installed. ${installHint}`);
}
const { render } = await import(pathToFileURL(peleEntry).href);

const board = (await import(pathToFileURL(resolve(input)).href)).default;
const TAGS = new Set(['new', 'gone', 'risk', 'fix']);
const KINDS = new Set(['explain', 'check']);
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

if (!board || typeof board !== 'object') fail('the module must `export default { title, steps }`');
if (!board.title) err('board', 'missing title');
if (!Array.isArray(board.steps) || board.steps.length === 0) err('board', 'steps must be a non-empty array');
if (board.steps?.length > 9) warn('board', `${board.steps.length} steps; number keys only reach 1-9`);

const diffCache = new Map();
let substeps = 0;
let fileCount = 0;
board.steps?.forEach((step, si) => {
  const sw = `step ${si + 1}`;
  if (!step.title) err(sw, 'missing title');
  if (!Array.isArray(step.substeps) || step.substeps.length === 0) return err(sw, 'substeps must be a non-empty array');
  step.substeps.forEach((sub, ki) => {
    substeps++;
    const w = `step ${si + 1}.${ki + 1}`;
    if (!sub.title) err(w, 'missing title');
    if (!sub.body) err(w, 'missing body');
    if (sub.breaking && !Array.isArray(sub.breaking)) err(w, 'breaking must be an array of strings');
    const nodeIds = checkDiagram(sub, w);
    const lines = checkFiles(sub, w);
    const pr = prOf(step.url, board.url);
    checkNotes(sub, w, lines, nodeIds, pr);
    checkQuestions(sub, w, lines, pr);
  });
});

for (const w of warnings) console.warn(`warn  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error ${e}`);
  process.exit(1);
}
console.log(`ok    ${board.steps.length} steps, ${substeps} substeps, ${fileCount} diff files, every diagram renders`);
if (checkOnly) process.exit(0);

if (fileCount > 0) await renderDiffs();

const slug = board.slug ?? basename(input).replace(/\.m?js$/, '');
const out = resolve(outFlag >= 0 ? args[outFlag + 1] : join(homedir(), '.cache', 'operator-review', slug));
mkdirSync(out, { recursive: true });
copyFileSync(join(skillDir, 'template', 'index.html'), join(out, 'index.html'));
copyFileSync(join(dirname(peleEntry), 'pele.global.js'), join(out, 'pele.global.js'));
const helper = board.helper ?? {
  url: 'http://127.0.0.1:4317',
  command: `node ${join(skillDir, 'scripts', 'publish-review.mjs')}`,
  install: `node ${join(skillDir, 'scripts', 'install-helper.mjs')}`,
};
writeFileSync(join(out, 'storyboard.js'), `window.STORYBOARD = ${JSON.stringify({ ...board, slug, helper })};\n`);
console.log(`wrote ${pathToFileURL(join(out, 'index.html')).href}`);

function checkDiagram(sub, w) {
  if (typeof sub.diagram !== 'string') return err(w, 'missing diagram'), new Set();
  for (const [, tag] of sub.diagram.matchAll(/:::(\w+)/g)) if (!TAGS.has(tag)) err(w, `unknown class :::${tag} (use new, gone, risk, fix)`);
  if (/^\s*classDef\b/m.test(sub.diagram)) warn(w, 'classDef styles are overridden by the theme; tag nodes with :::new/gone/risk/fix only');
  let svg;
  try {
    ({ svg } = render(sub.diagram));
  } catch (e) {
    err(w, `pele could not render it: ${e.message}`);
    return new Set();
  }
  const ids = [...svg.matchAll(/class="pele-node[^"]*" data-id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) if (id.includes('_')) err(w, `node id "${id}" contains "_"; edge animation splits ids on "_"`);
  if (ids.length > 14) warn(w, `${ids.length} nodes; split it into two substeps`);
  const [, , vw, vh] = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 0 0').split(' ').map(Number);
  if (vw > 1700) warn(w, `diagram is ${Math.round(vw)}px wide; shorten labels or use <br>`);
  if (vh > 900) warn(w, `diagram is ${Math.round(vh)}px tall; consider flowchart LR`);
  return new Set(ids);
}

// Returns path -> { new: Set<line>, old: Set<line> } for the lines visible in each file's patch.
function checkFiles(sub, w) {
  const visible = new Map();
  if (sub.files === undefined) return visible;
  if (!Array.isArray(sub.files)) return err(w, 'files must be an array'), visible;
  if (sub.files.length > 4) warn(w, `${sub.files.length} diff files; keep a substep to the 1-3 files that tell its story`);
  sub.files.forEach((file, fi) => {
    const fw = `${w} files[${fi}]`;
    if (!file?.path) return err(fw, 'missing path');
    if (visible.has(file.path)) return err(fw, `${file.path} is listed twice`);
    if (!file.patch === !file.diff) return err(fw, 'set exactly one of patch (inline hunks) or diff (a saved `gh pr diff` file)');
    let text = file.patch;
    if (file.diff) {
      text = sectionOf(file.diff, file.path, fw);
      if (text === undefined) return;
    }
    const parsed = parsePatch(text, file.path);
    if (parsed.hunks.length === 0) return err(fw, 'no @@ hunks (pure rename, binary or mode change): there is nothing to show; keep it in the diagram only');
    let hunks = parsed.hunks;
    if (file.lines) {
      const [a, b] = file.lines;
      if (!(a <= b)) return err(fw, 'lines must be [start, end] on the new side');
      hunks = hunks.filter((h) => {
        const start = Math.max(h.newStart, 1);
        return start <= b && start + Math.max(h.newCount, 1) - 1 >= a;
      });
      if (hunks.length === 0) return err(fw, `no hunk touches new lines ${a}-${b}`);
    }
    const shown = { new: new Set(), old: new Set() };
    let changed = 0;
    for (const h of hunks) {
      let n = h.newStart;
      let o = h.oldStart;
      for (const line of h.body) {
        if (line.startsWith('+')) shown.new.add(n++), changed++;
        else if (line.startsWith('-')) shown.old.add(o++), changed++;
        else if (line.startsWith(' ') || line === '') shown.new.add(n++), shown.old.add(o++);
      }
    }
    if (changed > 160 && !file.lines) warn(fw, `${changed} changed lines; trim with lines: [start, end]`);
    file.patch = parsed.header + hunks.map((h) => [h.head, ...h.body].join('\n')).join('\n') + '\n';
    delete file.diff;
    delete file.lines;
    visible.set(file.path, shown);
    fileCount++;
  });
  return visible;
}

function checkNotes(sub, w, visible, nodeIds, pr) {
  if (sub.notes === undefined) return;
  if (!Array.isArray(sub.notes)) return err(w, 'notes must be an array');
  const checks = sub.notes.filter((n) => n?.kind === 'check').length;
  if (sub.notes.length > 6) warn(w, `${sub.notes.length} notes; keep the few that orient or flag`);
  if (checks > 3) warn(w, `${checks} check notes; checks are only for code you would comment on`);
  sub.notes.forEach((note, ni) => {
    const nw = `${w} notes[${ni}]`;
    if (!KINDS.has(note?.kind)) return err(nw, 'kind must be "explain" or "check"');
    if (!note.body) err(nw, 'missing body');
    if (note.kind === 'check' && !note.concern) err(nw, 'check notes need a concern');
    if (note.kind === 'explain' && note.concern) warn(nw, 'concern is only shown on check notes');
    if (note.node !== undefined && !nodeIds.has(note.node)) err(nw, `node "${note.node}" is not in this substep's diagram`);
    checkAnchor(note, nw, visible);
    if (note.kind === 'check') link(note, pr, nw);
  });
}

function checkQuestions(sub, w, visible, pr) {
  if (sub.questions === undefined) return;
  if (!Array.isArray(sub.questions)) return err(w, 'questions must be an array');
  if (sub.questions.length > 3) warn(w, `${sub.questions.length} questions; ask the few the reviewer must decide`);
  sub.questions = sub.questions.map((q, qi) => {
    const qw = `${w} questions[${qi}]`;
    const item = typeof q === 'string' ? { ask: q } : q;
    if (!item?.ask) return err(qw, 'a question is a string or { ask, context?, path?, line? }'), item;
    checkAnchor(item, qw, visible);
    link(item, pr, qw);
    return item;
  });
}

// path/line/end/side must point at lines the substep's patch actually shows.
function checkAnchor(item, w, visible) {
  if (item.path === undefined) {
    if (item.line !== undefined) err(w, 'line needs a path');
    return;
  }
  const shown = visible.get(item.path);
  if (!shown) return err(w, `path ${item.path} is not in this substep's files`);
  if (item.line === undefined) {
    if (item.end !== undefined || item.side !== undefined) err(w, 'end and side need a line');
    return;
  }
  const side = item.side ?? 'new';
  if (side !== 'new' && side !== 'old') return err(w, 'side must be "new" or "old"');
  const end = item.end ?? item.line;
  if (end < item.line) return err(w, 'end must be at or after line');
  for (let l = item.line; l <= end; l++) {
    if (!shown[side].has(l)) return err(w, `${side} line ${l} of ${item.path} is not visible in the patch shown`);
  }
}

// GitHub anchors a PR diff line as #diff-<sha256(path)>R<new line> or L<old line>.
function link(item, pr, w) {
  if (!pr) return warn(w, 'no GitHub PR url on the step or board, so the review list cannot link it');
  if (item.path === undefined) return void (item.href = `${pr}/files`);
  const anchor = `diff-${createHash('sha256').update(item.path).digest('hex')}`;
  const line = item.line === undefined ? '' : `${item.side === 'old' ? 'L' : 'R'}${item.line}`;
  item.href = `${pr}/files#${anchor}${line}`;
}

function prOf(...urls) {
  for (const url of urls) {
    const m = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.exec(url ?? '');
    if (m) return m[0];
  }
  return undefined;
}

function sectionOf(diffPath, path, fw) {
  const full = resolve(moduleDir, diffPath);
  if (!diffCache.has(full)) {
    if (!existsSync(full)) return err(fw, `diff file not found: ${full}`), undefined;
    diffCache.set(full, readFileSync(full, 'utf8').split(/^(?=diff --git )/m));
  }
  const section = diffCache.get(full).find((s) => sectionPaths(s).has(path));
  if (!section) err(fw, `${path} is not in ${diffPath}`);
  return section;
}

function sectionPaths(section) {
  const paths = new Set();
  const head = section.slice(0, section.indexOf('\n@@') >>> 0).split('\n');
  for (const line of head) {
    const m = /^(?:--- |\+\+\+ |rename from |rename to |copy from |copy to )(.+)$/.exec(line);
    if (!m) continue;
    const p = unquote(m[1]);
    if (p !== '/dev/null') paths.add(line.startsWith('-') || line.startsWith('+') ? p.replace(/^[ab]\//, '') : p);
  }
  const git = /^diff --git a\/(\S+) b\/(\S+)$/.exec(head[0] ?? '');
  if (git) paths.add(git[1]).add(git[2]);
  return paths;
}

// Git C-quotes paths with spaces, quotes or non-ASCII bytes: "b/caf\303\251.ts".
function unquote(raw) {
  const s = raw.replace(/\t.*$/, '');
  if (!s.startsWith('"')) return s;
  const bytes = [];
  const named = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '"': 34, '\\': 92 };
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] !== '\\') { bytes.push(...Buffer.from(s[i])); continue; }
    const next = s[++i];
    if (/[0-7]/.test(next)) { bytes.push(parseInt(s.slice(i, i + 3), 8)); i += 2; }
    else bytes.push(named[next] ?? next.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

function parsePatch(text, path) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  const first = lines.findIndex((l) => l.startsWith('@@'));
  let header = first > 0 ? lines.slice(0, first).join('\n') + '\n' : '';
  if (!/^\+\+\+ /m.test(header)) header = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n`;
  const hunks = [];
  for (const line of first < 0 ? [] : lines.slice(first)) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m) hunks.push({ head: line, oldStart: +m[1], newStart: +m[3], newCount: m[4] === undefined ? 1 : +m[4], body: [] });
    else hunks.at(-1)?.body.push(line);
  }
  return { header, hunks };
}

async function renderDiffs() {
  let ssr;
  try {
    ssr = await import('@pierre/diffs/ssr');
  } catch {
    fail(`@pierre/diffs is not installed. ${installHint}`);
  }
  const options = {
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    themeType: 'system',
    diffStyle: 'unified',
    unsafeCSS: readFileSync(join(skillDir, 'template', 'diff.css'), 'utf8'),
  };
  for (const step of board.steps) {
    for (const sub of step.substeps) {
      for (const file of sub.files ?? []) {
        const { prerenderedHTML } = await ssr.preloadPatchDiff({ patch: file.patch, options });
        file.html = prerenderedHTML;
        delete file.patch;
      }
    }
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
