import { expect, test } from '@playwright/test';

test('department selection renders products, sold-out state and unpublished collections', async ({ page }) => {
  await page.route('**/api/departments?*', route => {
    const handle = new URL(route.request().url()).searchParams.get('handle');
    return route.fulfill({ json: { collection: handle === 'west-finds-collectables' ? null : {
      title: 'Department products', description: 'Collection description', products: { edges: [{ node: {
        id: 'fixture', title: 'Sample custom sticker', availableForSale: false,
        onlineStoreUrl: 'https://example.myshopify.com/products/sample', featuredImage: null,
        priceRange: { minVariantPrice: { amount: '12.00', currencyCode: 'AUD' } },
      } }] },
    } } });
  });
  await page.goto('/shop');
  await expect(page.getByRole('heading', { name: /Custom.*Crafted.*Collected/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sample custom sticker' })).toBeVisible();
  await expect(page.getByText('Sold out', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View product', exact: true })).toHaveAttribute('href', 'https://example.myshopify.com/products/sample');
  await page.getByRole('button', { name: 'Explore products' }).last().click();
  await expect(page.getByRole('status')).toHaveText(/No products are available in West Finds yet/);
  await expect(page).toHaveURL(/department=west-finds-collectables/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Viewing products' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('connection failures offer contact and a successful retry', async ({ page }) => {
  let fail = true;
  await page.route('**/api/departments?*', route => route.fulfill({
    status: fail ? 503 : 200,
    json: fail ? { error: 'The shop is not connected yet.' } : { collection: null },
  }));
  await page.goto('/shop?department=west-made-crafts');
  await expect(page.getByRole('status')).toContainText('The shop is not connected yet.');
  await expect(page.getByRole('link', { name: 'Contact us', exact: true })).toHaveAttribute('href', '/contact');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('status')).toContainText('No products are available in West Made yet.');
});
