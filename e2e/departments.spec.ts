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
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'More than just vinyl.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sample custom sticker' })).toBeVisible();
  await expect(page.getByText('Sold out', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View product', exact: true })).toHaveAttribute('href', 'https://example.myshopify.com/products/sample');
  await page.getByRole('button', { name: 'Shop collectables' }).click();
  await expect(page.getByRole('status')).toHaveText(/No products are available in West Finds yet/);
  await expect(page).toHaveURL(/department=west-finds-collectables/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Shop collectables' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('connection failures offer contact and a successful retry', async ({ page }) => {
  let fail = true;
  await page.route('**/api/departments?*', route => route.fulfill({
    status: fail ? 503 : 200,
    json: fail ? { error: 'The shop is not connected yet.' } : { collection: null },
  }));
  await page.goto('/?department=west-made-crafts');
  await expect(page.getByRole('status')).toContainText('The shop is not connected yet.');
  await expect(page.getByRole('link', { name: 'Contact us', exact: true })).toHaveAttribute('href', '/contact');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('status')).toContainText('No products are available in West Made yet.');
});

for (const width of [390, 1280]) {
  test(`reference-led photography and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/departments?*', route => route.fulfill({ json: { collection: null } }));
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    for (const image of await page.locator('.shop-hero-image, .department-photo').all()) {
      await expect(image).toBeVisible();
      expect(await image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
    }
    expect(await page.evaluate(() => document.fonts.check('32px "Road Rage"'))).toBe(true);
    expect(await page.evaluate(() => document.fonts.check('16px "Barlow"'))).toBe(true);
    await page.getByRole('link', { name: 'Explore our collections' }).click();
    await expect(page).toHaveURL(/#departments$/);
    await page.getByRole('button', { name: 'Shop crafts' }).click();
    await expect(page.getByRole('region', { name: 'West Made / Crafts' })).toBeInViewport();
    await expect(page.getByRole('status')).toContainText('No products are available in West Made yet.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('homepage is the storefront and design links open the editor', async ({ page }) => {
  await page.route('**/api/departments?*', route => route.fulfill({ json: { collection: null } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'More than just vinyl.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Design studio', exact: true })).toHaveAttribute('href', '/studio');
  await page.getByRole('link', { name: 'Design studio', exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByTestId('studio-tour-replay')).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.classList.contains('wvs-document-scroll'))).toBe(false);
  await page.goto('/shop');
  await expect(page.getByRole('heading', { name: 'More than just vinyl.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('wvs-document-scroll'))).toBe(true);
});
