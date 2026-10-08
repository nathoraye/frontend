import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wvs-studio-tour', 'done');
  });
});

async function addMultilineText(page: Page, width: number) {
  await page.setViewportSize({ width, height: width < 640 ? 812 : 800 });
  await page.goto('/');
  await expect(page.getByText(/west vinyl studio/i)).toBeVisible();
  if (width < 640) {
    await page.getByRole('button', { name: 'Open sidebar' }).click();
  }
  await page.getByTitle('Add Text (T)').click();
  if (width < 640) {
    await page.getByRole('button', { name: 'Hide sidebar' }).click();
  }
  const canvas = page.locator('canvas.upper-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await canvas.dblclick({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await page.keyboard.press('Control+A');
  await page.keyboard.type('WEST VINYL');
  await page.keyboard.press('Enter');
  await page.keyboard.type('HI');
  await page.keyboard.press('Escape');
  if (width < 640) {
    await page.getByRole('button', { name: 'Toggle inspector' }).click();
  }
  await expect(page.getByTestId('text-align')).toBeVisible();
}

test('text alignment is in the inspector at 1280px and undo restores it', async ({ page }) => {
  await addMultilineText(page, 1280);
  const centre = page.getByTestId('text-align-center');
  const right = page.getByTestId('text-align-right');
  const left = page.getByTestId('text-align-left');
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await centre.click();
  await expect(centre).toHaveAttribute('aria-pressed', 'true');
  await right.click();
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  const canvas = page.locator('canvas.upper-canvas');
  const box = await canvas.boundingBox();
  await page.getByTitle('Undo (Ctrl+Z)').click();
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect(centre).toHaveAttribute('aria-pressed', 'true');
  await page.getByTitle('Redo (Ctrl+Y)').click();
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect(right).toHaveAttribute('aria-pressed', 'true');
});

test('text alignment is reachable at 375px', async ({ page }) => {
  await addMultilineText(page, 375);
  const centre = page.getByTestId('text-align-center');
  await centre.click();
  await expect(centre).toHaveAttribute('aria-pressed', 'true');
  const box = await page.getByTestId('text-align').boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});
