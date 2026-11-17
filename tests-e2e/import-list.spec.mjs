import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Regression (v0.3.1): with many projects the import list overflowed and the
// flex column shrank every project card to a thin sliver. Cards must keep
// their full height and the list must scroll instead.
test('import list keeps project cards full height with many projects', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'cp-e2e-list-'));
  const L = (o) => JSON.stringify(o) + '\n';
  let n = 0;
  for (let p = 0; p < 10; p++) {
    const dir = path.join(home, '.claude', 'projects', `-Users-me-work-proj${p}`);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 4; i++) {
      n++;
      fs.writeFileSync(path.join(dir, `s${n}.jsonl`),
        L({ type: 'user', cwd: `/Users/me/work/proj${p}`, message: { content: 'x' } }) + L({ type: 'custom-title', customTitle: `proj${p} task ${i}` }));
    }
  }
  const app = await electron.launch({
    args: [path.join(root, 'electron/main.js')], cwd: root,
    env: { ...process.env, HOME: home, USERPROFILE: home, CP_TEST: '1', CP_E2E: '1' },
  });
  const win = await app.firstWindow();
  await win.getByRole('button', { name: '+ Add', exact: true }).click();
  await win.getByPlaceholder('e.g. Work').fill('Many');
  await win.getByRole('button', { name: 'Create profile' }).click();
  await expect(win.locator('.card', { hasText: 'Many' })).toBeVisible();

  // Give the profile a sessions folder with one registration (needed to import into it).
  const dataDir = JSON.parse(fs.readFileSync(path.join(home, '.claude-profiles', 'profiles.json'), 'utf8')).instances[0].dataDir;
  const idx = path.join(dataDir, 'claude-code-sessions', 'A', 'O');
  fs.mkdirSync(idx, { recursive: true });
  fs.writeFileSync(path.join(idx, 'local_t.json'), JSON.stringify({ sessionId: 'local_t', cliSessionId: 'tmpl', title: 'T', cwd: '/x' }));

  await win.locator('.card', { hasText: 'Many' }).locator('.kebab').click();
  await win.getByRole('button', { name: 'Import local sessions' }).click();
  await expect(win.locator('.sessgroup')).toHaveCount(10);

  const heights = await win.locator('.sessgroup').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThan(60); // header + rows, never a sliver
  const list = await win.locator('.sesslist').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(list.scroll).toBeGreaterThan(list.client); // overflows → scrolls

  await app.close();
});
