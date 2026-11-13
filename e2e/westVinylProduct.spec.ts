import { expect, test } from '@playwright/test';

const configured = Boolean(process.env.VITE_SHOPIFY_BUY_BUTTON_STOREFRONT_TOKEN);

test.beforeEach(async ({ page }) => {
  await page.route('**/api/departments?*', route => route.fulfill({ json: { collection: null } }));
});

test('missing Buy Button configuration offers a product enquiry only in West Vinyl', async ({ page }) => {
  test.skip(configured, 'Run without a token to check the missing-configuration state');
  await page.goto('/shop');
  const product = page.getByRole('region', { name: 'Featured West Vinyl product' });
  await expect(product.getByText('This product is not available to order online right now.')).toBeVisible();
  await expect(product.getByRole('link', { name: 'Enquire about this product' })).toHaveAttribute('href', '/contact');
  await page.getByRole('button', { name: 'Shop crafts' }).click();
  await expect(product).toBeHidden();
  await page.getByRole('button', { name: 'Shop custom vinyl' }).click();
  await expect(product).toBeVisible();
});

test('Buy Button renders the requested product once, persists across departments and stays out of the studio', async ({ page }) => {
  test.skip(!configured, 'Run with a dummy token to check SDK lifecycle');
  await page.route('https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.ShopifyBuy = {
      buildClient: config => { window.buyClient = config; return {}; },
      UI: { onReady: async () => ({
        createComponent: async (type, config) => {
          window.buyConfig = config;
          window.buyCreates = (window.buyCreates || 0) + 1;
          config.node.innerHTML = '<button type="button">Add to cart</button>';
        },
        destroyComponent: () => {},
      }) },
    };`,
  }));
  await page.goto('/shop');
  const product = page.getByRole('region', { name: 'Featured West Vinyl product' });
  await expect(product.getByRole('button', { name: 'Add to cart' })).toBeVisible();
  const config = await page.evaluate(() => {
    const w = window as unknown as { buyConfig: { id: string; moneyFormat: string; options: { cart: { text: { button: string } } } }; buyClient: { domain: string } };
    return { id: w.buyConfig.id, domain: w.buyClient.domain, checkout: w.buyConfig.options.cart.text.button };
  });
  expect(config).toEqual({ id: '15289649725681', domain: 'stdgmt-5m.myshopify.com', checkout: 'Checkout' });
  await page.getByRole('button', { name: 'Shop crafts' }).click();
  await expect(product).toBeHidden();
  await page.getByRole('button', { name: 'Shop custom vinyl' }).click();
  await expect(product.getByRole('button', { name: 'Add to cart' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { buyCreates: number }).buyCreates)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Design studio', exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(product).toHaveCount(0);
  await expect(page.locator('#product-component-1794598038871')).toHaveCount(0);
});

test('failed SDK load offers a working retry', async ({ page }) => {
  test.skip(!configured, 'Run with a dummy token to check SDK failures');
  let requests = 0;
  await page.route('https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js', route => {
    requests += 1;
    return route.abort();
  });
  await page.goto('/shop');
  const product = page.getByRole('region', { name: 'Featured West Vinyl product' });
  await expect(product.getByRole('button', { name: 'Retry product' })).toBeVisible();
  await product.getByRole('button', { name: 'Retry product' }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(product.getByRole('link', { name: 'Enquire about this product' })).toBeVisible();
});
