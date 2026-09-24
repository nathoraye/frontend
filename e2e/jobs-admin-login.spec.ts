import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 1280, height: 800 },
});

test('jobs board signs in and signs out', async ({ page }) => {
  const username = process.env.JOBS_ADMIN_USERNAME;
  const password = process.env.JOBS_ADMIN_PASSWORD;
  test.skip(!username || !password, 'Set JOBS_ADMIN_USERNAME and JOBS_ADMIN_PASSWORD to run this');

  await page.goto('/admin/orders');
  await expect(page.getByTestId('jobs-login')).toBeVisible();
  await page.getByLabel('Username').fill('not-the-shop');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByText(/wrong username or password/i)).toBeVisible();

  await page.getByLabel('Username').fill(username!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page.getByTestId('jobs-login')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /to make \(/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();

  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page.getByTestId('jobs-login')).toBeVisible();
});
