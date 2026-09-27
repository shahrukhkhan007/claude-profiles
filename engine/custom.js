'use strict';
// Custom profiles: give a profile its own name + icon in the Dock / taskbar.
// macOS clones the Claude app; Windows/Linux use a shortcut / .desktop entry.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const platform = require('./platform');
const { log } = require('./log');

const HOME = os.homedir();

function slug(name) {
  return String(name).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile';
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' });
}

// Run a command, logging it and its stderr. Returns { ok, out, err, code }.
function runLogged(cmd, args) {
  log('run:', cmd, (args || []).join(' '));
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out || '', err: '', code: 0 };
  } catch (e) {
    const err = (e && (e.stderr || e.message)) ? String(e.stderr || e.message) : String(e);
    const code = e && typeof e.status === 'number' ? e.status : -1;
    log('  ! failed (code ' + code + '):', err.trim().slice(0, 800));
    return { ok: false, out: e && e.stdout ? String(e.stdout) : '', err, code };
  }
}

/* ---------------- macOS ---------------- */

function macBundlePath(name) {
  const apps = '/Applications';
  try {
    fs.accessSync(apps, fs.constants.W_OK);
    return path.join(apps, `Claude ${name}.app`);
  } catch (_) {
    const userApps = path.join(HOME, 'Applications');
    fs.mkdirSync(userApps, { recursive: true });
    return path.join(userApps, `Claude ${name}.app`);
  }
}

// Turn a PNG/JPG into an .icns and set it as the clone's icon.
function macApplyIcon(bundlePath, iconPath) {
  const exists = !!(iconPath && fs.existsSync(iconPath));
  log('applyIcon: iconPath=' + iconPath + ' exists=' + exists);
  if (!exists) { log('applyIcon: SKIP — no icon file on disk, keeping default Claude icon'); return false; }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-icon-'));
  const iconset = path.join(work, 'AppIcon.iconset');
  fs.mkdirSync(iconset, { recursive: true });
  for (const s of [16, 32, 64, 128, 256, 512]) {
    run('sips', ['-z', String(s), String(s), iconPath, '--out', path.join(iconset, `icon_${s}x${s}.png`)]);
    run('sips', ['-z', String(s * 2), String(s * 2), iconPath, '--out', path.join(iconset, `icon_${s}x${s}@2x.png`)]);
  }
  const plist = path.join(bundlePath, 'Contents', 'Info.plist');
  const icns = path.join(bundlePath, 'Contents', 'Resources', 'AppIcon.icns');
  run('iconutil', ['-c', 'icns', iconset, '-o', icns]);
  // Set BOTH the icon file name and clear any alternate Electron default, so the
  // bundle icon is unambiguously ours.
  runLogged('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIconFile AppIcon', plist]);
  runLogged('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIconName AppIcon', plist]);
  // Bust the macOS icon cache: bump mtimes so Finder/Dock/LaunchServices re-read it.
  try { run('touch', [icns]); } catch (_) {}
  try { run('touch', [plist]); } catch (_) {}
  try { run('touch', [bundlePath]); } catch (_) {}
  const built = fs.existsSync(icns);
  log('applyIcon: wrote ' + icns + ' built=' + built + ' bytes=' + (built ? fs.statSync(icns).size : 0));
  return built;
}

// Ad-hoc re-sign a modified Electron clone. A plain `codesign --sign -` strips
// the hardened-runtime entitlements the original app carried, including the JIT
// ones V8/Electron require — without them the clone traps at launch. So we sign
// with an explicit entitlements file that restores JIT and disables library
// validation (nested code is now ad-hoc, no team to validate against).
function macSign(bundlePath) {
  const ent = path.join(os.tmpdir(), `cp-ent-${Date.now()}.plist`);
  fs.writeFileSync(ent, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '  <key>com.apple.security.cs.allow-jit</key><true/>',
    '  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>',
    '  <key>com.apple.security.cs.disable-library-validation</key><true/>',
    '  <key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>',
    '</dict></plist>',
    '',
  ].join('\n'));
  log('signing clone:', bundlePath);
  let r;
  try {
    r = runLogged('codesign', ['--force', '--deep', '--sign', '-', '--options', 'runtime',
      '--entitlements', ent, '--timestamp=none', bundlePath]);
  } finally {
    try { fs.unlinkSync(ent); } catch (_) {}
  }
  if (!r.ok) throw new Error('codesign failed: ' + r.err.trim().slice(0, 400));
  // Verify the result so signing problems surface at build time, not launch time.
  const v = runLogged('codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundlePath]);
  log('codesign --verify:', v.ok ? 'PASS' : 'FAIL ' + v.err.trim().slice(0, 400));
  return { verified: v.ok, verifyError: v.ok ? null : v.err.trim().slice(0, 400) };
}

function macCreate(inst) {
  const app = platform.claudeAppPath();
  if (!app) throw new Error('Claude.app not found');
  const bundlePath = macBundlePath(inst.name);
  log('macCreate:', inst.name, '->', bundlePath, '(from', app + ')');
  try { run('rm', ['-rf', bundlePath]); } catch (_) {}
  const cp = runLogged('cp', ['-R', app, bundlePath]);
  if (!cp.ok) throw new Error('cp failed: ' + cp.err.trim().slice(0, 300));

  const plist = path.join(bundlePath, 'Contents', 'Info.plist');
  const bundleId = `com.anthropic.claude.${slug(inst.name).toLowerCase()}`;
  runLogged('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleIdentifier ${bundleId}`, plist]);
  // IMPORTANT: do NOT change CFBundleName — Electron builds the Helper app path
  // from it ("<CFBundleName> Helper.app"), so renaming it makes the clone fatal
  // with "Unable to find helper app". Use CFBundleDisplayName for the Dock label.
  const disp = `Claude ${inst.name}`;
  const setDisp = runLogged('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleDisplayName ${disp}`, plist]);
  if (!setDisp.ok) runLogged('/usr/libexec/PlistBuddy', ['-c', `Add :CFBundleDisplayName string ${disp}`, plist]);

  try { macApplyIcon(bundlePath, inst.iconPath); log('icon applied'); } catch (e) { log('icon apply failed:', String(e).slice(0, 200)); }
  // Re-sign, preserving the JIT entitlements Electron needs (see macSign).
  const sign = macSign(bundlePath);
  // Register the clone with Launch Services so the Dock/Finder see it.
  runLogged('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', bundlePath]);

  log('macCreate done:', bundlePath, 'verified=', sign && sign.verified);
  const out = { bundlePath, bundleId, claudeVersionAtBuild: platform.claudeVersion() };
  if (sign && sign.verified === false) out.buildError = 'Signature verify failed: ' + (sign.verifyError || 'unknown');
  return out;
}

function macRemove(inst) {
  const bundle = inst.bundlePath;
  const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  // 1) Quit the running clone (its process command line carries --user-data-dir=<dataDir>).
  if (inst.dataDir) { try { run('pkill', ['-f', '--', inst.dataDir]); } catch (_) {} }
  if (bundle) {
    // 2) Unregister from Launch Services so Finder/Dock/Spotlight forget the app.
    try { run(LSREGISTER, ['-u', bundle]); } catch (_) {}
    // 3) Delete the cloned app bundle.
    if (fs.existsSync(bundle)) { try { run('rm', ['-rf', bundle]); } catch (_) {} }
  }
  // 4) Refresh the Dock so any lingering icon of the deleted app disappears.
  try { run('killall', ['Dock']); } catch (_) {}
  log('macRemove:', inst.name, '— quit, unregistered, deleted, Dock refreshed');
}

/* ---------------- Windows ---------------- */

function winCreate(inst) {
  const exe = platform.claudeAppPath();
  if (!exe) throw new Error('Claude.exe not found');
  const lnk = path.join(HOME, 'Desktop', `Claude ${inst.name}.lnk`);
  const icon = inst.iconPath || exe;
  const ps = [
    '$W = New-Object -ComObject WScript.Shell;',
    `$S = $W.CreateShortcut(${JSON.stringify(lnk)});`,
    `$S.TargetPath = ${JSON.stringify(exe)};`,
    `$S.Arguments = ${JSON.stringify(`--user-data-dir=${inst.dataDir}`)};`,
    `$S.IconLocation = ${JSON.stringify(icon)};`,
    '$S.Save();',
  ].join(' ');
  run('powershell', ['-NoProfile', '-Command', ps]);
  return { launcherPath: lnk };
}

function winRemove(inst) {
  if (inst.launcherPath && fs.existsSync(inst.launcherPath)) fs.rmSync(inst.launcherPath, { force: true });
}

/* ---------------- Linux ---------------- */

function linuxCreate(inst) {
  const appsDir = path.join(HOME, '.local', 'share', 'applications');
  fs.mkdirSync(appsDir, { recursive: true });
  const file = path.join(appsDir, `claude-${slug(inst.name).toLowerCase()}.desktop`);
  const content = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=Claude ${inst.name}`,
    `Exec=claude --user-data-dir="${inst.dataDir}"`,
    `Icon=${inst.iconPath || 'claude'}`,
    `StartupWMClass=Claude ${inst.name}`,
    'Terminal=false',
    'Categories=Utility;',
    '',
  ].join('\n');
  fs.writeFileSync(file, content);
  try { run('update-desktop-database', [appsDir]); } catch (_) {}
  return { launcherPath: file };
}

function linuxRemove(inst) {
  if (inst.launcherPath && fs.existsSync(inst.launcherPath)) fs.rmSync(inst.launcherPath, { force: true });
}

// Re-apply just the Dock icon to an existing macOS clone (used when a custom
// profile's image is edited) without re-cloning the whole app.
function macApplyIconOnly(inst) {
  if (!inst.bundlePath || !fs.existsSync(inst.bundlePath) || !inst.iconPath) return { ok: false };
  macApplyIcon(inst.bundlePath, inst.iconPath);
  macSign(inst.bundlePath);
  try {
    run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', inst.bundlePath]);
  } catch (_) {}
  try { run('touch', [inst.bundlePath]); } catch (_) {}
  return { ok: true };
}

function applyIcon(inst) {
  if (process.env.CP_TEST || process.platform !== 'darwin') return { ok: false };
  try { return macApplyIconOnly(inst); } catch (_) { return { ok: false }; }
}

/* ---------------- dispatch ---------------- */

function create(inst) {
  if (process.env.CP_TEST) return { bundlePath: require('path').join(require('os').tmpdir(), `Claude ${inst.name}.app`), bundleId: 'test', claudeVersionAtBuild: platform.claudeVersion() };
  if (process.platform === 'darwin') return macCreate(inst);
  if (process.platform === 'win32') return winCreate(inst);
  return linuxCreate(inst);
}

function remove(inst) {
  if (process.env.CP_TEST) return { ok: true };
  if (process.platform === 'darwin') return macRemove(inst);
  if (process.platform === 'win32') return winRemove(inst);
  return linuxRemove(inst);
}

// macOS: re-clone from the freshly-updated Claude and re-apply identity + icon.
function rebuild(inst) {
  if (process.platform !== 'darwin') return { rebuilt: false };
  return { ...macCreate(inst), rebuilt: true };
}

module.exports = { create, remove, rebuild, applyIcon, slug };
