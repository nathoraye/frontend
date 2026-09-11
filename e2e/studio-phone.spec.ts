import { expect, test } from '@playwright/test';

test.describe('phone studio smoke', () => {
  test('loads, flags cut-ready, autosaves, and uses toasts instead of alerts', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('West Vinyl Studio')).toBeVisible();

    const badge = page.getByTestId('cut-ready-badge');
    await expect(badge).toContainText(/cut issue/i);

    await page.getByTestId('tool-square').click();
    await expect(badge).toContainText(/cut check/i);

    await badge.click();
    const panel = page.getByTestId('cut-ready-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/weeding box/i);

    page.once('dialog', () => {
      throw new Error('native alert() should not appear');
    });
    await page.getByRole('button', { name: /trace to razor svg/i }).click();
    await expect(page.getByTestId('studio-notice')).toContainText(/already a vector/i);

    await page.waitForTimeout(1200);
    await page.reload();
    await expect(badge).toContainText(/cut check/i, { timeout: 15_000 });
    await expect(page.getByTestId('studio-notice')).toContainText(/restored last session/i);
  });
});
