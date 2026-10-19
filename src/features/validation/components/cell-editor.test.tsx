import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { datasetFrom, mappingByHeader } from "../../../../test/helpers/factories";
import { renderWithWorkflow } from "../../../../test/helpers/render";
import { useWorkflow } from "@/application/workflow/react";
import { selectQualityReport } from "@/application/workflow/selectors";
import { initialState } from "@/application/workflow/state";
import * as t from "@/application/workflow/transitions";
import { supplierSchema } from "@/domain/schema/supplier";
import { RecordsGrid } from "./records-grid";

const dataset = datasetFrom([
  ["Company", "Email", "Country", "Web"],
  ["Acme", "broken", " uk ", "acme.example"],
]);

function preloaded() {
  const loaded = t.loadDataset(initialState(), dataset);
  return t.reviewApproved(
    loaded,
    mappingByHeader(dataset, {
      companyName: "Company",
      email: "Email",
      country: "Country",
      website: "Web",
    }),
  );
}

function Grid() {
  const report = useWorkflow(selectQualityReport);
  const corrections = useWorkflow((s) => s.corrections);
  const fields = supplierSchema.fields.filter((f) =>
    ["companyName", "email", "country", "website"].includes(f.key),
  );
  return (
    <>
      <RecordsGrid
        records={[...(report?.records ?? [])]}
        fields={fields}
        resetKey=""
        onShowDuplicates={() => {}}
      />
      <output data-testid="corrections">{JSON.stringify(corrections)}</output>
    </>
  );
}

const cell = (label: RegExp) => screen.getByRole("button", { name: label });

describe("cell editing", () => {
  it("flags the invalid email and saves an edit with Enter", async () => {
    const { user } = renderWithWorkflow(<Grid />, { initialState: preloaded() });
    await user.click(cell(/^Email, row 2: broken, has an error/));
    expect(screen.getByText("“broken” is not a valid email address.")).toBeInTheDocument();

    const input = screen.getByLabelText("Edit value");
    await user.clear(input);
    await user.type(input, "orders@acme.example{Enter}");

    expect(screen.getByTestId("corrections")).toHaveTextContent(
      '{"r-0001:email":"orders@acme.example"}',
    );
    expect(cell(/^Email, row 2: orders@acme\.example, edited$/)).toBeInTheDocument();
  });

  it("cancels an edit with Escape", async () => {
    const { user } = renderWithWorkflow(<Grid />, { initialState: preloaded() });
    await user.click(cell(/^Email, row 2/));
    await user.type(screen.getByLabelText("Edit value"), "zzz");
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Edit value")).not.toBeInTheDocument();
    expect(screen.getByTestId("corrections")).toHaveTextContent("{}");
  });

  it("reverts an edited cell to its original value", async () => {
    const state = t.setCorrection(preloaded(), "r-0001", "email", "x@acme.example");
    const { user } = renderWithWorkflow(<Grid />, { initialState: state });
    await user.click(cell(/^Email, row 2: x@acme\.example, edited/));
    await user.click(screen.getByRole("button", { name: /Revert to original/ }));
    expect(screen.getByTestId("corrections")).toHaveTextContent("{}");
  });

  it("shows automatic changes with the original value", async () => {
    const { user } = renderWithWorkflow(<Grid />, { initialState: preloaded() });
    await user.click(cell(/^Country, row 2: United Kingdom, changed automatically/));
    const popover = screen.getByText("Changes applied").parentElement!;
    expect(within(popover).getByText(/Recognised country/)).toBeInTheDocument();
    expect(within(popover).getByText(/Original:/)).toHaveTextContent("Original: “ uk ”");
  });

  it("applies a suggested fix in one click", async () => {
    const { user } = renderWithWorkflow(<Grid />, { initialState: preloaded() });
    await user.click(cell(/^Website, row 2: acme\.example, has an error/));
    await user.click(screen.getByRole("button", { name: /Apply: https:\/\/acme\.example/ }));
    expect(
      cell(/^Website, row 2: https:\/\/acme\.example, changed automatically$/),
    ).toBeInTheDocument();
  });

  it("excludes and restores a row", async () => {
    const { user } = renderWithWorkflow(<Grid />, { initialState: preloaded() });
    await user.click(screen.getByRole("button", { name: "Exclude row 2" }));
    await user.click(screen.getByRole("button", { name: "Restore row 2" }));
    expect(screen.getByRole("button", { name: "Exclude row 2" })).toBeInTheDocument();
  });
});
