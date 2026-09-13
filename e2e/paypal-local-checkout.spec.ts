import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 1280, height: 800 },
});

test('Product Preview → Buy Sticker → local complete order', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/west vinyl studio/i)).toBeVisible();

  await page.getByRole('button', { name: /product preview/i }).click();
  await expect(page.getByRole('button', { name: /buy sticker/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /buy sticker/i }).click();

  // Slim checkout: sticker options → shipping (one Next)
  await expect(page.getByText(/sticker options/i)).toBeVisible({ timeout: 10_000 });
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

test('Product Preview → Buy Apparel inherits colour/size/placement', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/west vinyl studio/i)).toBeVisible();

  await page.getByRole('button', { name: /product preview/i }).click();
  await expect(page.getByRole('button', { name: /buy apparel/i })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Product').selectOption('tshirt');
  await page.getByLabel('Garment size').selectOption('L');
  await page.getByRole('button', { name: /buy apparel/i }).click();

  const checkout = page.getByTestId('order-checkout');
  await expect(checkout.getByText(/review your apparel/i)).toBeVisible({ timeout: 10_000 });
  await expect(checkout.getByText('T-Shirt', { exact: true })).toBeVisible();
  await expect(checkout.getByText('Garment size', { exact: true })).toBeVisible();
  await expect(checkout.locator('span.text-pink-400', { hasText: /^L$/ })).toBeVisible();
  // Placement / colour editors should not reappear in checkout
  await expect(checkout.getByLabel('Product')).toHaveCount(0);
  await expect(checkout.getByLabel('Garment size')).toHaveCount(0);
  await expect(checkout.getByLabel('Print scale')).toHaveCount(0);

  await checkout.getByRole('button', { name: /next/i }).click();
  await expect(checkout.getByText(/shipping & payment/i)).toBeVisible();
});
