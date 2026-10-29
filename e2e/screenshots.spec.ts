import { expect, test, type Page } from "@playwright/test";

/**
 * Screenshots of every step for visual review and the README.
 *
 *   pnpm screenshots
 *
 * Skipped in the regular e2e run.
 */
test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to capture screenshots.");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function shot(page: Page, name: string) {
  // Toasts are transient; keep them out of the README images.
  await page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: false });
}

for (const viewport of VIEWPORTS) {
  test(`screenshots (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const suffix = viewport.name;

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Import customer data" })).toBeVisible();
    await shot(page, `1-import-empty-${suffix}`);

    await page.getByRole("button", { name: "Try with sample data" }).click();
    await expect(page.getByText(/184 rows · 14 columns/).first()).toBeVisible();
    await page.mouse.move(0, 0);
    await shot(page, `2-import-loaded-${suffix}`);

    await page.getByRole("link", { name: "Continue to mapping" }).click();
    await expect(page.getByText("11 of 11")).toBeVisible();
    await page.getByRole("button", { name: "Show details for Country" }).click();
    await shot(page, `3-map-${suffix}`);

    await page.getByRole("button", { name: "Approve mapping" }).click();
    await expect(page.getByRole("heading", { name: "Review and fix values" })).toBeVisible();
    await page.mouse.move(0, 0);
    await shot(page, `4-validate-${suffix}`);

    await page.getByRole("button", { name: /^Email, row 6:/ }).click();
    await expect(page.getByLabel("Edit value")).toBeVisible();
    await shot(page, `5-validate-cell-${suffix}`);
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "Continue to export" }).click();
    await expect(page.getByRole("heading", { name: "Export clean data" })).toBeVisible();
    await page.mouse.move(0, 0);
    await shot(page, `6-export-${suffix}`);
  });
}
