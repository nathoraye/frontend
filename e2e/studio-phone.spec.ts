import { expect, test, type Page } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function phoneChrome(page: Page, width: number) {
  await page.setViewportSize({ width, height: 812 });
  await page.goto('/');
  await expect(page.getByTestId('studio-header')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open sidebar' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open inspector' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Toggle inspector' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Design' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Product', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)' })).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const header = document.querySelector('[data-testid="studio-header"]');
    return {
      header: box(header),
      menu: box(document.querySelector('[aria-label="Open sidebar"]')),
      badge: box(document.querySelector('[data-testid="cut-ready-badge"]')),
      design: box([...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Design') ?? null),
      product: box([...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Product') ?? null),
      inspector: box(document.querySelector('[aria-label="Toggle inspector"]')),
      canvas: box(document.querySelector('canvas.lower-canvas')),
      headerOverflow: header ? header.scrollWidth - header.clientWidth : 99,
    };
  });

  expect(metrics.header).toBeTruthy();
  expect(metrics.header!.height).toBeLessThanOrEqual(48);
  expect(metrics.menu).toBeTruthy();
  expect(metrics.badge).toBeTruthy();
  expect(metrics.design).toBeTruthy();
  expect(metrics.product).toBeTruthy();
  expect(metrics.inspector).toBeTruthy();
  expect(metrics.canvas).toBeTruthy();
  expect(metrics.headerOverflow).toBeLessThanOrEqual(1);
  for (const pair of [
    [metrics.menu, metrics.badge],
    [metrics.badge, metrics.design],
    [metrics.design, metrics.product],
    [metrics.product, metrics.inspector],
  ] as const) {
    expect(overlaps(pair[0]!, pair[1]!)).toBe(false);
  }
  expect(metrics.canvas!.width).toBeGreaterThan(width - 2);
  expect(metrics.canvas!.height).toBeGreaterThan(400);
  expect(metrics.canvas!.y).toBeGreaterThanOrEqual(metrics.header!.y + metrics.header!.height - 1);
}

test.describe('phone studio smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('wvs-studio-tour', 'done');
    });
  });

  test('loads, flags cut-ready, autosaves, and uses toasts instead of alerts', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open sidebar' }).click();
    await expect(page.getByText('WVS', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)' })).toBeVisible();
    await expect(page.getByTestId('ai-artwork-button')).toBeVisible();
    await page.getByRole('button', { name: 'Hide sidebar' }).click();

    const badge = page.getByTestId('cut-ready-badge');
    await expect(badge).toContainText(/cut issue/i);

    await page.getByRole('button', { name: 'Open sidebar' }).click();
    await page.getByTestId('tool-square').click();
    await expect(badge).toContainText(/cut check/i);

    await badge.click();
    await expect(page.getByTestId('cut-ready-panel')).toHaveCount(0);
    await expect(page.getByText(/almost ready/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Alignment & Ops' })).toBeVisible();

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'beforeunload') {
        await dialog.accept();
        return;
      }
      throw new Error(`unexpected ${dialog.type()}: ${dialog.message()}`);
    });
    await page.getByRole('button', { name: /trace to razor svg/i }).click();
    await expect(page.getByTestId('studio-notice')).toContainText(/already a vector/i);

    await page.waitForTimeout(1200);
    await page.reload();
    await expect(badge).toContainText(/cut check/i, { timeout: 15_000 });
    await expect(page.getByTestId('studio-notice')).toContainText(/restored last session/i);
  });

  for (const width of [375, 414]) {
    test(`header controls stay apart and the mat fills ${width}px`, async ({ page }) => {
      await phoneChrome(page, width);
      await page.getByRole('button', { name: 'Open sidebar' }).click();
      await page.getByTestId('tool-square').click();
      await expect(page.getByTestId('cut-ready-badge')).toContainText(/cut check/i);
      const canvas = page.locator('canvas.lower-canvas');
      await expect(canvas).toBeVisible();
    });
  }
});
