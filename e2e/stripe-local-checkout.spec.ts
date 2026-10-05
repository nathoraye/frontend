import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 1280, height: 800 },
});

test('Product Preview → Buy Sticker → local checkout → jobs board', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/west vinyl studio/i)).toBeVisible();

  await page.getByRole('button', { name: /product preview/i }).click();
  await expect(page.getByRole('button', { name: /buy sticker/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /buy sticker/i }).click();

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
  await expect(localBtn).toBeVisible({ timeout: 10_000 });

  const createRespPromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/stripe/create-checkout-session') &&
      res.request().method() === 'POST',
  );

  await Promise.all([page.waitForURL(/\/order\/success/), localBtn.click()]);
  const createResp = await createRespPromise;
  expect(createResp.ok()).toBeTruthy();

  const orderId = new URL(page.url()).searchParams.get('orderId');
  expect(orderId).toMatch(/^ord-/);

  await expect(page.getByRole('heading', { name: /payment received/i })).toBeVisible();
  await expect(page.getByText(orderId!)).toBeVisible();
  await expect(page.getByRole('link', { name: /open jobs board/i })).toHaveCount(0);

  await page.goto('/admin/orders');
  await expect(page).toHaveURL(/\/admin\/orders/);
  await expect(page.getByTestId('jobs-board')).toBeVisible();
  const jobCard = page.getByTestId('job-card').filter({ hasText: orderId! });
  await expect(jobCard).toBeVisible();
  await expect(jobCard.getByText(/Ada Vinyl/)).toBeVisible();
  await expect(jobCard.getByText(/decal 10×10cm graphic/i)).toBeVisible();
  await expect(jobCard.getByTestId('job-quote')).toContainText(/Item \$18\.00/);

  await jobCard.getByRole('button', { name: /show design/i }).click();
  await expect(page.getByTestId('job-preview-image')).toBeVisible({
    timeout: 10_000,
  });
  await expect(jobCard.getByTestId('job-download-svg')).toBeVisible();
  await expect(jobCard.getByTestId('job-open-design')).toBeVisible();

  await jobCard.getByRole('button', { name: /mark shipped/i }).click();
  await expect(jobCard).toHaveCount(0);
  await page.getByRole('button', { name: /^shipped \(/i }).click();
  const shippedCard = page.getByTestId('job-card').filter({ hasText: orderId! });
  await expect(shippedCard).toBeVisible();
  await expect(shippedCard.getByText(/^shipped$/i)).toBeVisible();
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
  await expect(checkout.locator('span.text-pink-400', { hasText: /^T-Shirt$/ })).toBeVisible();
  await expect(checkout.getByText('Garment size', { exact: true })).toBeVisible();
  await expect(checkout.locator('span.text-pink-400', { hasText: /^L$/ })).toBeVisible();
  await expect(checkout.getByTestId('vinyl-pricing-calculator')).toBeVisible();
  await expect(checkout.getByLabel('Garment size')).toHaveCount(0);
  await expect(checkout.getByLabel('Print scale')).toHaveCount(0);

  await checkout.getByRole('button', { name: /next/i }).click();
  await expect(checkout.getByText(/shipping & payment/i)).toBeVisible();
});

test('Orders board routes and cancel page render', async ({ page }) => {
  await page.goto('/admin/orders');
  await expect(page.getByTestId('jobs-board')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^orders$/i })).toBeVisible();
  await expect(page.getByText(/ORDERS_ADMIN_TOKEN/i)).toHaveCount(0);

  await page.goto('/jobs');
  await expect(page.getByTestId('jobs-board')).toBeVisible();

  await page.goto('/order/cancel?orderId=ord-demo');
  await expect(page.getByRole('heading', { name: /checkout cancelled/i })).toBeVisible();
  await expect(page.getByText('ord-demo')).toBeVisible();

  await page.goto('/policies');
  await expect(page.getByRole('heading', { name: /^policies$/i })).toBeVisible();
  await page.getByRole('link', { name: /^privacy$/i }).click();
  await expect(page.getByRole('heading', { name: /^privacy$/i })).toBeVisible();
  await expect(page.getByText(/westvinylco@gmail.com/i)).toBeVisible();
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: /terms, shipping and returns/i })).toBeVisible();
  await expect(page.getByText(/not GST registered/i)).toBeVisible();
});
