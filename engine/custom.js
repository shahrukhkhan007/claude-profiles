'use strict';
// Custom profiles: give a profile its own name + icon in the Dock / taskbar.
// macOS clones the Claude app; Windows/Linux use a shortcut / .desktop entry.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const platform = require('./platform');

const HOME = os.homedir();

function slug(name) {
  return String(name).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile';
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' });
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
  if (!iconPath || !fs.existsSync(iconPath)) return;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-icon-'));
  const iconset = path.join(work, 'AppIcon.iconset');
  fs.mkdirSync(iconset, { recursive: true });
  for (const s of [16, 32, 64, 128, 256, 512]) {
    run('sips', ['-z', String(s), String(s), iconPath, '--out', path.join(iconset, `icon_${s}x${s}.png`)]);
    run('sips', ['-z', String(s * 2), String(s * 2), iconPath, '--out', path.join(iconset, `icon_${s}x${s}@2x.png`)]);
  }
  const icns = path.join(bundlePath, 'Contents', 'Resources', 'AppIcon.icns');
  run('iconutil', ['-c', 'icns', iconset, '-o', icns]);
  run('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIconFile AppIcon', path.join(bundlePath, 'Contents', 'Info.plist')]);
}

function macCreate(inst) {
  const app = platform.claudeAppPath();
  if (!app) throw new Error('Claude.app not found');
  const bundlePath = macBundlePath(inst.name);
  try { run('rm', ['-rf', bundlePath]); } catch (_) {}
  run('cp', ['-R', app, bundlePath]);

  const plist = path.join(bundlePath, 'Contents', 'Info.plist');
  const bundleId = `com.anthropic.claude.${slug(inst.name).toLowerCase()}`;
  try { run('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleIdentifier ${bundleId}`, plist]); } catch (_) {}
  try { run('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleName Claude ${inst.name}`, plist]); } catch (_) {}

  try { macApplyIcon(bundlePath, inst.iconPath); } catch (_) {}
  // Ad-hoc re-sign so Gatekeeper is less noisy (best-effort).
  try { run('codesign', ['--force', '--deep', '--sign', '-', bundlePath]); } catch (_) {}
  // Register the clone with Launch Services so the Dock/Finder see it.
  try {
    run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', bundlePath]);
  } catch (_) {}

  return { bundlePath, bundleId, claudeVersionAtBuild: platform.claudeVersion() };
}

function macRemove(inst) {
  if (inst.bundlePath && fs.existsSync(inst.bundlePath)) run('rm', ['-rf', inst.bundlePath]);
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

/* ---------------- dispatch ---------------- */

function create(inst) {
  if (process.platform === 'darwin') return macCreate(inst);
  if (process.platform === 'win32') return winCreate(inst);
  return linuxCreate(inst);
}

function remove(inst) {
  if (process.platform === 'darwin') return macRemove(inst);
  if (process.platform === 'win32') return winRemove(inst);
  return linuxRemove(inst);
}

// macOS: re-clone from the freshly-updated Claude and re-apply identity + icon.
function rebuild(inst) {
  if (process.platform !== 'darwin') return { rebuilt: false };
  return { ...macCreate(inst), rebuilt: true };
}

module.exports = { create, remove, rebuild, slug };
