import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithWorkflow } from "../../../../test/helpers/render";
import { ImportWorkspace } from "./import-step";

function setup() {
  const { user } = renderWithWorkflow(<ImportWorkspace />);
  const input = screen.getByLabelText("Choose a CSV or Excel file");
  return { user, input };
}

describe("import dropzone", () => {
  it("is operable from the keyboard", async () => {
    const { user } = setup();
    await user.tab();
    expect(screen.getByRole("button", { name: /choose file/i })).toHaveFocus();
  });

  it("rejects unsupported file types with an actionable message", async () => {
    const { user, input } = setup();
    await user.upload(input, new File(["%PDF"], "customers.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Use a .csv or .xlsx file.")).toBeInTheDocument();
  });

  it("rejects legacy .xls", async () => {
    const { user, input } = setup();
    await user.upload(input, new File(["x"], "old.xls"));
    expect(await screen.findByText(/Legacy \.xls files are not supported/)).toBeInTheDocument();
  });

  it("rejects files over the size limit", async () => {
    const { user, input } = setup();
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.csv", { type: "text/csv" });
    await user.upload(input, big);
    expect(
      await screen.findByText(/The file is 11\.0 MB\. The limit is 10\.0 MB\./),
    ).toBeInTheDocument();
  });

  it("parses a valid CSV and shows the file, warnings and a preview", async () => {
    const { user, input } = setup();
    const csv = "Name;Email;Email\nAcme;a@acme.example;b@acme.example\n;;\nBeta;b@beta.example;\n";
    await user.upload(input, new File([csv], "customers.csv", { type: "text/csv" }));
    expect(await screen.findByText("customers.csv")).toBeInTheDocument();
    expect(screen.getByText(/Renamed duplicate headers/)).toBeInTheDocument();
    expect(screen.getByText(/Skipped 1 empty row/)).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: /First 2 rows of customers\.csv/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Email (2)", { selector: "li" })).toBeInTheDocument();
  });
});
