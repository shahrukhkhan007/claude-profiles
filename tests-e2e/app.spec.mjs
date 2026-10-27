import { test, expect, _electron as electron } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('boots, adds a profile, opens detail, archives it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'cp-e2e-'));      // hermetic profiles.json
  const app = await electron.launch({
    args: [join(root, 'electron/main.js')],
    cwd: root,
    env: { ...process.env, HOME: home, USERPROFILE: home, CP_TEST: '1', CP_E2E: '1' },
  });
  const win = await app.firstWindow();
  await expect(win.locator('.topbar')).toBeVisible();

  await win.getByRole('button', { name: '+ Add', exact: true }).click();
  await expect(win.locator('.add-modal')).toBeVisible();
  await win.getByPlaceholder('e.g. Work').fill('E2E Test');
  await win.getByRole('button', { name: 'Create profile' }).click();

  const card = win.locator('.card', { hasText: 'E2E Test' });
  await expect(card).toBeVisible();

  await card.click();
  await expect(win.locator('.sheet2')).toBeVisible();
  await expect(win.locator('.d-name')).toContainText('E2E Test');

  // Deleting now goes through Archive: archive from the detail sheet; it leaves the main list.
  await win.locator('.sheet2').getByRole('button', { name: 'Archive' }).click();
  await expect(win.locator('.card', { hasText: 'E2E Test' })).toHaveCount(0);

  await app.close();
});
