#!/usr/bin/env node
// Keeps the publish helper running in the background, so the review list's "Publish pending review"
// button works without a terminal. macOS only: it installs a per-user LaunchAgent that starts the helper
// at login and restarts it if it stops. It runs as you, listens on 127.0.0.1 only, and only creates PENDING reviews.
//
// Usage:
//   node install-helper.mjs            install (or reinstall) and start it
//   node install-helper.mjs status     show whether it is running
//   node install-helper.mjs uninstall  stop it and remove the LaunchAgent
//
// If you move the operator-review skill folder, run install again: the agent points at this folder.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'com.operator-review.helper';
const PORT = 4317;
const here = dirname(fileURLToPath(import.meta.url));
const helperScript = join(here, 'publish-review.mjs');
const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const logPath = join(homedir(), 'Library', 'Logs', 'operator-review-helper.log');
const service = `gui/${process.getuid()}/${LABEL}`;
const action = process.argv[2] ?? 'install';

if (process.platform !== 'darwin') {
  console.error('This installer is for macOS. On other systems, run: node scripts/publish-review.mjs');
  process.exit(1);
}

function run(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// launchctl errors are expected when the service is not loaded yet; callers that do not care ignore them.
function launchctl(args, { ignoreErrors = false } = {}) {
  try {
    return run('launchctl', args);
  } catch (error) {
    if (ignoreErrors) return null;
    throw new Error(`launchctl ${args.join(' ')} failed: ${error.stderr?.toString().trim() || error.message}`);
  }
}

// Same question the page asks: does anything answer on the helper's port?
async function running() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

function findCommand(name) {
  try {
    return run('/usr/bin/which', [name]);
  } catch {
    return null;
  }
}

function xml(value) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

async function install() {
  const gh = findCommand('gh');
  if (!gh) throw new Error('gh is not on your PATH. Install GitHub CLI (brew install gh) and run gh auth login first.');
  if (!existsSync(helperScript)) throw new Error(`helper not found at ${helperScript}`);
  // A helper started by hand in a terminal already holds the port; the agent would fail to bind it.
  if (await running()) {
    launchctl(['bootout', service], { ignoreErrors: true });
    if (await running()) {
      throw new Error(`Port ${PORT} is already in use by another helper (probably one started in a terminal). Stop it with Ctrl-C there, then run this again.`);
    }
  }
  // launchd starts with a bare PATH, so give it the directories of node and gh.
  const path = [...new Set([dirname(process.execPath), dirname(gh), '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(helperScript)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(here)}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${xml(path)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(logPath)}</string>
  <key>StandardErrorPath</key><string>${xml(logPath)}</string>
</dict>
</plist>
`;
  mkdirSync(dirname(plistPath), { recursive: true });
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(plistPath, plist);
  launchctl(['bootout', service], { ignoreErrors: true });
  launchctl(['bootstrap', `gui/${process.getuid()}`, plistPath]);
  // Give launchd a moment to start the process before checking.
  for (let i = 0; i < 10 && !(await running()); i++) await new Promise((r) => setTimeout(r, 300));
  if (!(await running())) throw new Error(`installed, but nothing answers on port ${PORT}. See ${logPath}`);
  console.log(`Installed. The helper starts at login and restarts if it stops.`);
  console.log(`Log: ${logPath}`);
  console.log(`Uninstall: node ${join(here, 'install-helper.mjs')} uninstall`);
}

async function uninstall() {
  launchctl(['bootout', service], { ignoreErrors: true });
  if (existsSync(plistPath)) unlinkSync(plistPath);
  console.log(await running() ? `Stopped the service, but something else still answers on port ${PORT}.` : 'Uninstalled. The helper is stopped and will not start at login.');
}

async function status() {
  const loaded = launchctl(['print', service], { ignoreErrors: true }) !== null;
  const answering = await running();
  console.log(`LaunchAgent: ${loaded ? 'loaded' : 'not loaded'} (${plistPath})`);
  console.log(`Port ${PORT}: ${answering ? 'answering' : 'not answering'}`);
}

try {
  if (action === 'install') await install();
  else if (action === 'uninstall') await uninstall();
  else if (action === 'status') await status();
  else throw new Error(`unknown action "${action}". Use install, uninstall or status.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
