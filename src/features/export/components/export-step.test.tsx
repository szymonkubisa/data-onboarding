import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { datasetFrom, mappingByHeader } from "../../../../test/helpers/factories";
import { renderWithWorkflow } from "../../../../test/helpers/render";
import { initialState } from "@/application/workflow/state";
import * as t from "@/application/workflow/transitions";
import { ExportWorkspace } from "./export-step";

const downloads: { name: string; content: string; type: string }[] = [];
vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  downloadFile: (name: string, content: string, type: string) =>
    downloads.push({ name, content, type }),
}));

const dataset = datasetFrom(
  [
    ["Company", "Email", "Country"],
    ["Acme Ltd", "orders@acme.example", "uk"],
    ['=HYPERLINK("http://x")', "evil@x.example", "DE"],
    ["Broken", "nope", "FR"],
  ],
  "Customers Q3.csv",
);

function preloaded() {
  const loaded = t.loadDataset(initialState(), dataset);
  return t.reviewApproved(
    loaded,
    mappingByHeader(dataset, { companyName: "Company", email: "Email", country: "Country" }),
  );
}

beforeEach(() => {
  downloads.length = 0;
});

describe("export step", () => {
  it("summarises what will be exported and why rows are left out", () => {
    renderWithWorkflow(<ExportWorkspace />, { initialState: preloaded() });
    expect(screen.getByText("Rows to export").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("Left out for errors").nextSibling).toHaveTextContent("1");
    expect(screen.getByText(/1 row with errors will be left out/)).toBeInTheDocument();
    expect(screen.getByLabelText(/escaped as text in the CSV/)).toBeInTheDocument();
  });

  it("asks for confirmation before including rows with errors", async () => {
    const { user } = renderWithWorkflow(<ExportWorkspace />, { initialState: preloaded() });
    const toggle = screen.getByRole("switch", { name: "Include rows with errors" });

    await user.click(toggle);
    expect(
      screen.getByRole("alertdialog", { name: "Export 1 rows that have errors?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep them out" }));
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Include rows with errors" }));
    expect(toggle).toBeChecked();
    expect(screen.getByText("Rows to export").nextSibling).toHaveTextContent("3");
  });

  it("downloads a clean, formula-safe CSV and a JSON report", async () => {
    const { user } = renderWithWorkflow(<ExportWorkspace />, { initialState: preloaded() });
    await user.click(screen.getByRole("button", { name: "Download CSV" }));
    await user.click(screen.getByRole("button", { name: "Download JSON report" }));

    const [csv, report] = downloads;
    expect(csv?.name).toBe("customers-q3-clean.csv");
    const lines = csv!.content.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe(
      "companyName,taxId,email,phone,website,contactName,addressLine,city,postalCode,country,category",
    );
    expect(lines[1]).toBe("Acme Ltd,,orders@acme.example,,,,,,,United Kingdom,");
    expect(lines[2]).toMatch(/^"'=HYPERLINK\(""http:\/\/x""\)",/);
    expect(lines).toHaveLength(3);

    expect(report?.name).toBe("customers-q3-report.json");
    const json = JSON.parse(report!.content);
    expect(json.exclusions).toEqual([
      { rowId: "r-0003", sourceRowNumber: 4, reason: "has-errors" },
    ]);
    expect(json.summary.exportedRows).toBe(2);
  });
});
