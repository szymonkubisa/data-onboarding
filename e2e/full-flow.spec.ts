import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectAccessible, loadSample, parseCsv } from "./helpers";

test("sample data: import → map → validate → fix → export", async ({ page }) => {
  // Import
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Import customer data" })).toBeVisible();
  await expectAccessible(page, "import (empty)");
  await loadSample(page);
  await expect(page.getByText(/184 rows · 14 columns/).first()).toBeVisible();
  await expect(page.getByText(/Renamed duplicate headers/)).toBeVisible();
  await expectAccessible(page, "import (loaded)");

  // Map: demo mode, heuristic suggestions
  await page.getByRole("link", { name: "Continue to mapping" }).click();
  await expect(page.getByRole("heading", { name: "Map columns to fields" })).toBeVisible();
  await expect(page.getByText("Demo mode: heuristic suggestions, no LLM involved.")).toBeVisible();
  await expect(page.getByText("11 of 11")).toBeVisible();
  await expectAccessible(page, "map");

  // Change the mapping: leave the Segment column out, so category is not exported.
  await page.getByRole("combobox", { name: "Target field for Segment" }).click();
  await page.getByRole("option", { name: "Don’t import" }).click();
  await expect(page.getByText("10 of 11")).toBeVisible();

  // The server rejects a mapping without a required field and says why.
  await page.getByRole("button", { name: "Ignore Country" }).click();
  await page.getByRole("button", { name: "Approve mapping" }).click();
  await expect(page.getByText("The mapping needs changes before it can be approved")).toBeVisible();
  await expect(page.getByText("Country is required. Map a column to it.")).toBeVisible();
  await page.getByRole("button", { name: "Reset Country to the suggestion" }).click();
  await page.getByRole("button", { name: "Approve mapping" }).click();

  // Validate
  await expect(page.getByRole("heading", { name: "Review and fix values" })).toBeVisible();
  await expect(page).toHaveURL(/\/validate$/);
  await expectAccessible(page, "validate");

  await page.getByRole("button", { name: /Apply \d+ suggested fixes/ }).click();
  await expect(page.getByRole("button", { name: "Apply 0 suggested fixes" })).toBeDisabled();

  const brokenEmail = page.getByRole("button", {
    name: /^Email, row 6: sales\(at\)northwind-packaging\.co\.uk, has an error/,
  });
  await brokenEmail.click();
  await expect(page.getByText("is not a valid email address.")).toBeVisible();
  await expectAccessible(page, "validate (cell editor)");
  const input = page.getByLabel("Edit value");
  await input.fill("sales@northwind-packaging.co.uk");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: /^Email, row 6: sales@northwind-packaging\.co\.uk, edited/ }),
  ).toBeVisible();

  // Export
  await page.getByRole("link", { name: "Continue to export" }).click();
  await expect(page.getByRole("heading", { name: "Export clean data" })).toBeVisible();
  await expectAccessible(page, "export");
  const exported = Number(
    await page.getByText("Rows to export").locator("xpath=following-sibling::p").innerText(),
  );
  expect(exported).toBeGreaterThan(150);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("customers-messy-clean.csv");
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.startsWith("﻿")).toBe(true);

  const [header, ...rows] = parseCsv(csv);
  expect(header).toEqual([
    "companyName",
    "taxId",
    "email",
    "phone",
    "website",
    "contactName",
    "addressLine",
    "city",
    "postalCode",
    "country",
    "category",
  ]);
  expect(rows).toHaveLength(exported);
  const col = (name: string) => header!.indexOf(name);

  // The corrected value is exported.
  expect(rows.some((r) => r[col("email")] === "sales@northwind-packaging.co.uk")).toBe(true);
  expect(rows.some((r) => r[col("email")]?.includes("(at)"))).toBe(false);
  // Formula-like names are neutralized; phone numbers with a leading + are not.
  expect(rows.some((r) => r[col("companyName")] === "'+Plus Supplies Ltd")).toBe(true);
  expect(rows.some((r) => r[col("companyName")]?.startsWith("'=HYPERLINK"))).toBe(true);
  expect(rows.some((r) => r[col("companyName")]?.startsWith("="))).toBe(false);
  expect(rows.some((r) => r[col("phone")]?.startsWith("+44"))).toBe(true);
  // Normalizations reached the file.
  expect(
    rows.every((r) => !["UK", "GBR", "Deutschland", "U.S.A."].includes(r[col("country")]!)),
  ).toBe(true);
  expect(
    rows
      .filter((r) => r[col("website")] !== "")
      .every((r) => /^https?:\/\//.test(r[col("website")]!)),
  ).toBe(true);
  // The ignored Segment column is not exported.
  expect(rows.every((r) => r[col("category")] === "")).toBe(true);

  // The report accounts for every left-out row.
  const reportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON report" }).click();
  const report = JSON.parse(await readFile((await (await reportPromise).path())!, "utf8"));
  expect(report.summary.exportedRows).toBe(exported);
  expect(report.exclusions.length).toBe(184 - exported);
  expect(
    report.mapping.find((m: { sourceColumn: string }) => m.sourceColumn === "Segment"),
  ).toMatchObject({
    decision: "ignored",
    targetField: null,
  });
});
