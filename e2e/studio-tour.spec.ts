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

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
  { width: 414, height: 896 },
]) {
  test(`trace step highlights both trace buttons at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'Studio tour' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 3; i++) await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog).toContainText('4 of 5');
    await expect(dialog).toContainText('Trace to Razor SVG and Trace layered SVG turn a picture into cut paths.');

    const spot = page.getByTestId('studio-tour-spot');
    await expect(spot).toBeVisible();
    const spotBox = await spot.boundingBox();
    const razor = await page.getByRole('button', { name: 'Trace to Razor SVG', exact: true }).boundingBox();
    const layered = await page.getByRole('button', { name: 'Trace layered SVG', exact: true }).boundingBox();
    const bubble = await dialog.boundingBox();
    expect(spotBox && razor && layered && bubble).toBeTruthy();

    for (const button of [razor!, layered!]) {
      expect(button.x).toBeGreaterThanOrEqual(spotBox!.x - 1);
      expect(button.y).toBeGreaterThanOrEqual(spotBox!.y - 1);
      expect(button.x + button.width).toBeLessThanOrEqual(spotBox!.x + spotBox!.width + 1);
      expect(button.y + button.height).toBeLessThanOrEqual(spotBox!.y + spotBox!.height + 1);
      const overlaps =
        bubble!.x < button.x + button.width &&
        bubble!.x + bubble!.width > button.x &&
        bubble!.y < button.y + button.height &&
        bubble!.y + bubble!.height > button.y;
      expect(overlaps).toBe(false);
    }

    expect(bubble!.x).toBeGreaterThanOrEqual(0);
    expect(bubble!.y).toBeGreaterThanOrEqual(0);
    expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bubble!.y + bubble!.height).toBeLessThanOrEqual(viewport.height + 1);
  });
}
