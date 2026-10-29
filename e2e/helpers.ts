import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** WCAG 2.1 A/AA checks on the current page. Fails with the rule ids and targets. */
export async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Sonner toasts animate in and out; they are checked when stable, not mid-transition.
    .exclude("[data-sonner-toaster]")
    .analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

export async function loadSample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByText("customers-messy.csv").first()).toBeVisible();
}

/** Parse the CSV the app produced (RFC 4180, CRLF, optional BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && input[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
