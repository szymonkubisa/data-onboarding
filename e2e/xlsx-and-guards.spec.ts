import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

test("XLSX upload with a sheet picker", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("Choose a CSV or Excel file")
    .setInputFiles(join(__dirname, "../test/fixtures/suppliers.xlsx"));

  await expect(
    page.getByRole("heading", { name: "Which sheet holds the suppliers?" }),
  ).toBeVisible();
  await expectAccessible(page, "sheet picker");
  await page.getByRole("button", { name: /Suppliers\s*41 rows/ }).click();

  await expect(page.getByText(/sheet “Suppliers” · 40 rows · 11 columns/)).toBeVisible();
  await expect(
    page.getByText(/Imported sheet “Suppliers”\. The workbook has 2 sheets\./),
  ).toBeVisible();

  await page.getByRole("link", { name: "Continue to mapping" }).click();
  await expect(page.getByText("11 of 11")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Target field for Country code" })).toHaveText(
    "Country",
  );
  await expect(page.getByRole("combobox", { name: "Target field for Email address" })).toHaveText(
    "Email",
  );
  await page.getByRole("button", { name: "Approve mapping" }).click();
  await expect(page.getByRole("heading", { name: "Review and fix values" })).toBeVisible();
  await expect(page.getByText("Showing 40 of 40 rows")).toBeVisible();
});

test("unsupported files are rejected with a clear message", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Choose a CSV or Excel file").setInputFiles({
    name: "old.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: Buffer.from("not really excel"),
  });
  await expect(page.getByText(/Legacy \.xls files are not supported/)).toBeVisible();
});

test("later steps redirect to the import step when nothing is loaded", async ({ page }) => {
  await page.goto("/validate");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Import supplier data" })).toBeVisible();
});

test("mobile layout keeps the flow usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await page.getByRole("link", { name: "Continue to mapping" }).click();
  await expect(page.getByText("11 of 11")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
