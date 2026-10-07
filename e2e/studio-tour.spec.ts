import { expect, test } from '@playwright/test';

test('studio tour appears on the first visit and stays dismissed after skip', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Studio tour' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('1 of 5');
  await expect(dialog).toContainText('Import Image');
  await expect(dialog.getByRole('button', { name: 'Next' })).toBeFocused();

  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Studio tour' })).toHaveCount(0);

  await page.getByTestId('studio-tour-replay').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('1 of 5');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
