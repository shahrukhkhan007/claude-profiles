import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const u = await import(pathToFileURL(path.join(here, '..', 'engine', 'updater.js')).href);

const ASSETS = [
  { name: 'claude-profiles_0.3.0_amd64.deb', browser_download_url: 'https://x/deb', size: 3 },
  { name: 'Claude.Profiles-0.3.0-universal.dmg', browser_download_url: 'https://x/dmg', size: 1 },
  { name: 'Claude.Profiles-0.3.0.AppImage', browser_download_url: 'https://x/ai', size: 2 },
  { name: 'Claude.Profiles.Setup.0.3.0.exe', browser_download_url: 'https://x/exe', size: 4 },
];

test('compareVersions handles v-prefix, lengths and pre-releases', () => {
  assert.equal(u.compareVersions('0.3.0', '0.2.0'), 1);
  assert.equal(u.compareVersions('v0.10.0', '0.9.9'), 1);
  assert.equal(u.compareVersions('0.2', '0.2.0'), 0);
  assert.equal(u.compareVersions('0.2.0', '0.2.1'), -1);
  assert.equal(u.compareVersions('0.3.0-beta.1', '0.3.0'), -1);
});

test('pickAsset matches each OS installer', () => {
  assert.equal(u.pickAsset(ASSETS, 'darwin', {}).name, 'Claude.Profiles-0.3.0-universal.dmg');
  assert.equal(u.pickAsset(ASSETS, 'win32', {}).name, 'Claude.Profiles.Setup.0.3.0.exe');
  assert.equal(u.pickAsset(ASSETS, 'linux', { APPIMAGE: '/a/b.AppImage' }).name, 'Claude.Profiles-0.3.0.AppImage');
  assert.equal(u.pickAsset(ASSETS, 'linux', {}).name, 'claude-profiles_0.3.0_amd64.deb');
});

test('checkLatest reports a newer release with the right asset', async () => {
  const fetchJson = async () => ({ tag_name: 'v0.3.0', body: 'notes', html_url: 'https://gh/rel', assets: ASSETS });
  const r = await u.checkLatest('0.2.0', { fetchJson, platform: 'darwin', env: {} });
  assert.equal(r.ok, true);
  assert.equal(r.newer, true);
  assert.equal(r.latest, '0.3.0');
  assert.equal(r.asset.url, 'https://x/dmg');
  const same = await u.checkLatest('0.3.0', { fetchJson, platform: 'darwin', env: {} });
  assert.equal(same.newer, false);
  const bad = await u.checkLatest('0.2.0', { fetchJson: async () => { throw new Error('offline'); } });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /offline/);
});

test('macOS: bundle path detection and refusing to update from a mounted dmg', () => {
  assert.equal(u.macAppBundle('/Applications/Claude Profiles.app/Contents/MacOS/Claude Profiles'), '/Applications/Claude Profiles.app');
  assert.equal(u.macAppBundle('/usr/bin/node'), null);
  const r = u.blockedReason({ platform: 'darwin', execPath: '/Volumes/Claude Profiles/Claude Profiles.app/Contents/MacOS/Claude Profiles' });
  assert.match(r, /Applications/);
});

test('macOS install script quotes paths and relaunches the bundle', () => {
  const sh = u.macScript({ dmg: "/tmp/it's.dmg", appPath: '/Applications/Claude Profiles.app', pid: 42, log: '/tmp/l' });
  assert.ok(sh.includes(`'/tmp/it'\\''s.dmg'`));
  assert.ok(sh.includes("open '/Applications/Claude Profiles.app'"));
  assert.ok(sh.includes('kill -0 42'));
});
