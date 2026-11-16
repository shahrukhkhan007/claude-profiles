'use strict';
// In-app self-update from GitHub Releases, without code signing.
//
// electron-updater / Squirrel.Mac refuses unsigned apps, and our builds are
// unsigned (build.mac.identity: null), so we do the minimum ourselves:
//   1. ask the GitHub Releases API for the latest release (the only network call),
//   2. download the installer that matches this OS,
//   3. hand off to a small detached helper that swaps it in after we quit,
//      then relaunches the new version.
// Plain Node only: no Electron imports (the main process passes in paths/pids).
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const REPO = 'shahrukhkhan007/claude-profiles';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const UA = 'claude-profiles-updater';

// "v0.10.1" vs "0.9.3" → 1 / 0 / -1. Pre-release suffixes sort before the release.
function compareVersions(a, b) {
  const parse = (v) => {
    const [main, pre] = String(v || '').trim().replace(/^v/i, '').split('-', 2);
    return { nums: main.split('.').map((n) => parseInt(n, 10) || 0), pre: pre || '' };
  };
  const A = parse(a), B = parse(b);
  for (let i = 0; i < Math.max(A.nums.length, B.nums.length); i++) {
    const x = A.nums[i] || 0, y = B.nums[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1;
  if (!B.pre) return -1;
  return A.pre > B.pre ? 1 : -1;
}

// The release asset this machine should install.
function pickAsset(assets, platform = process.platform, env = process.env) {
  const list = Array.isArray(assets) ? assets : [];
  const by = (re) => list.find((a) => re.test(a.name || ''));
  if (platform === 'darwin') return by(/universal\.dmg$/i) || by(/\.dmg$/i) || null;
  if (platform === 'win32') return by(/setup.*\.exe$/i) || by(/\.exe$/i) || null;
  if (platform === 'linux') return env.APPIMAGE ? by(/\.AppImage$/i) : (by(/\.deb$/i) || by(/\.AppImage$/i));
  return null;
}

function get(url, { json = false, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/vnd.github+json' : '*/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString(), { json, redirects: redirects - 1 }));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`GitHub responded ${res.statusCode}`)); return; }
      resolve(res);
    });
    req.setTimeout(20000, () => req.destroy(new Error('Timed out talking to GitHub')));
    req.on('error', reject);
  });
}

async function fetchJson(url) {
  const res = await get(url, { json: true });
  let body = '';
  res.setEncoding('utf8');
  for await (const chunk of res) body += chunk;
  return JSON.parse(body);
}

// { ok, current, latest, newer, notes, pageUrl, asset }
async function checkLatest(current, opts = {}) {
  try {
    const rel = await (opts.fetchJson || fetchJson)(opts.api || API);
    const latest = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
    if (!latest) return { ok: false, error: 'No published release found.' };
    const asset = pickAsset(rel.assets, opts.platform, opts.env);
    return {
      ok: true,
      current,
      latest,
      newer: compareVersions(latest, current) > 0,
      notes: String(rel.body || '').slice(0, 4000),
      pageUrl: rel.html_url || `https://github.com/${REPO}/releases/latest`,
      asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size || 0 } : null,
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// Stream an asset to disk, reporting progress as 0..1. Writes to *.part then renames.
async function download(asset, destDir, onProgress) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(asset.name));
  const part = dest + '.part';
  const res = await get(asset.url);
  const total = Number(res.headers['content-length']) || asset.size || 0;
  let got = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(part);
    res.on('data', (c) => { got += c.length; if (onProgress && total) onProgress(Math.min(1, got / total)); });
    res.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    res.pipe(out);
  });
  if (asset.size && got !== asset.size) { try { fs.unlinkSync(part); } catch (_) {} throw new Error('Download was incomplete. Please try again.'); }
  fs.renameSync(part, dest);
  return dest;
}

// The running .app bundle on macOS, from the executable path.
function macAppBundle(execPath) {
  const m = String(execPath).match(/^(.*?\.app)\/Contents\/MacOS\//);
  return m ? m[1] : null;
}

const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// macOS helper: wait for us to quit, mount the dmg, replace the bundle, relaunch.
function macScript({ dmg, appPath, pid, log }) {
  const name = path.basename(appPath);
  return `#!/bin/bash
exec >>${sq(log)} 2>&1
echo "[update] $(date) installing ${name}"
for i in $(seq 1 120); do kill -0 ${pid} 2>/dev/null || break; sleep 0.5; done
MNT=$(mktemp -d /tmp/cp-update.XXXXXX)
hdiutil attach ${sq(dmg)} -nobrowse -readonly -noautoopen -mountpoint "$MNT" || { open ${sq(dmg)}; exit 1; }
SRC="$MNT/${name}"
[ -d "$SRC" ] || SRC=$(ls -d "$MNT"/*.app | head -n 1)
STAGE=${sq(appPath + '.updating')}
rm -rf "$STAGE"
if ditto "$SRC" "$STAGE"; then
  rm -rf ${sq(appPath + '.old')}
  mv ${sq(appPath)} ${sq(appPath + '.old')} && mv "$STAGE" ${sq(appPath)} && rm -rf ${sq(appPath + '.old')}
  xattr -dr com.apple.quarantine ${sq(appPath)} 2>/dev/null
fi
hdiutil detach "$MNT" -quiet || hdiutil detach "$MNT" -force -quiet
rmdir "$MNT" 2>/dev/null
open ${sq(appPath)}
`;
}

// Linux AppImage helper: wait, swap the file in place, relaunch.
function appImageScript({ file, target, pid, log }) {
  return `#!/bin/sh
exec >>${sq(log)} 2>&1
for i in $(seq 1 120); do kill -0 ${pid} 2>/dev/null || break; sleep 0.5; done
chmod +x ${sq(file)}
cp ${sq(file)} ${sq(target + '.new')} && mv ${sq(target + '.new')} ${sq(target)}
chmod +x ${sq(target)}
nohup ${sq(target)} >/dev/null 2>&1 &
`;
}

// Can the running install be replaced in place? Returns null if yes, or a reason.
function blockedReason({ platform = process.platform, execPath = process.execPath, env = process.env } = {}) {
  if (platform === 'darwin') {
    const app = macAppBundle(execPath);
    if (!app) return 'Could not find the installed app bundle.';
    if (app.startsWith('/Volumes/')) return 'Move Claude Profiles to your Applications folder first, then update.';
    try { fs.accessSync(path.dirname(app), fs.constants.W_OK); } catch (_) { return `No permission to replace the app in ${path.dirname(app)}.`; }
    return null;
  }
  if (platform === 'linux' && env.APPIMAGE) {
    try { fs.accessSync(path.dirname(env.APPIMAGE), fs.constants.W_OK); } catch (_) { return 'No permission to replace the AppImage.'; }
  }
  return null;
}

// Start the hand-off. Returns { mode: 'relaunch' } when the caller should quit
// now so the helper can finish, or { mode: 'opened' } when the installer was
// handed to the OS (Debian package) and the app can keep running.
function install(file, { platform = process.platform, execPath = process.execPath, env = process.env, pid = process.pid, openPath, logDir = os.tmpdir() } = {}) {
  const log = path.join(logDir, 'claude-profiles-update.log');
  const detached = (cmd, args) => { const c = spawn(cmd, args, { detached: true, stdio: 'ignore' }); c.unref(); };
  if (platform === 'darwin') {
    const script = path.join(path.dirname(file), 'install-update.sh');
    fs.writeFileSync(script, macScript({ dmg: file, appPath: macAppBundle(execPath), pid, log }), { mode: 0o755 });
    detached('/bin/bash', [script]);
    return { mode: 'relaunch' };
  }
  if (platform === 'win32') {
    // NSIS (electron-builder): /S = silent, --updated relaunches the app when done.
    detached(file, ['/S', '--updated', '--force-run']);
    return { mode: 'relaunch' };
  }
  if (platform === 'linux' && env.APPIMAGE && /\.AppImage$/i.test(file)) {
    const script = path.join(path.dirname(file), 'install-update.sh');
    fs.writeFileSync(script, appImageScript({ file, target: env.APPIMAGE, pid, log }), { mode: 0o755 });
    detached('/bin/sh', [script]);
    return { mode: 'relaunch' };
  }
  if (openPath) openPath(file);
  return { mode: 'opened' };
}

module.exports = { REPO, API, compareVersions, pickAsset, checkLatest, download, install, blockedReason, macAppBundle, macScript, appImageScript };
