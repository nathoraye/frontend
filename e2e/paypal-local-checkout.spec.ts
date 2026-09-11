import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const ARTIFACT_DIR = '/opt/cursor/artifacts';

test.use({
  viewport: { width: 1280, height: 800 },
  video: 'on',
});

test('Product Preview → Buy Sticker → local complete order', async ({ page }) => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  await page.goto('/');
  await expect(page.getByText(/west vinyl studio/i)).toBeVisible();

  await page.getByRole('button', { name: /product preview/i }).click();
  await expect(page.getByRole('button', { name: /buy sticker/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /buy sticker/i }).click();

  await expect(page.getByRole('button', { name: /next/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByRole('button', { name: /next/i }).click();

  await expect(page.getByText(/shipping & payment/i)).toBeVisible();
  await page.getByPlaceholder('Full Name').fill('Ada Vinyl');
  await page.getByPlaceholder('Email').fill('ada@example.com');
  await page.getByPlaceholder('Street Address').fill('1 Cut Street');
  await page.getByPlaceholder('City').fill('Sydney');
  await page.getByPlaceholder('State/Region').fill('NSW');
  await page.getByPlaceholder('Postcode').fill('2000');
  await page.getByLabel('Country').selectOption('Australia');

  const localBtn = page.getByRole('button', { name: /complete order \(local\)/i });
  await expect(localBtn).toBeVisible();
  await page.screenshot({ path: `${ARTIFACT_DIR}/paypal-checkout-step3-local.png`, fullPage: true });

  const createRespPromise = page.waitForResponse(
    (res) => res.url().includes('/api/paypal/create-order') && res.request().method() === 'POST',
  );
  const submitRespPromise = page.waitForResponse(
    (res) => res.url().includes('/api/orders') && res.request().method() === 'POST',
  );

  await localBtn.click();

  const createResp = await createRespPromise;
  expect(createResp.ok()).toBeTruthy();
  const submitResp = await submitRespPromise;
  expect(submitResp.ok()).toBeTruthy();
  const body = await submitResp.json();
  expect(body.order?.status).toMatch(/unverified|paid/);

  await expect(page.getByTestId('studio-notice')).toContainText(/order/i, { timeout: 5_000 });
});
