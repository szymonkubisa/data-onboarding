import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { datasetFrom } from "../../../../test/helpers/factories";
import { renderWithWorkflow } from "../../../../test/helpers/render";
import { useWorkflow } from "@/application/workflow/react";
import { initialState } from "@/application/workflow/state";
import * as t from "@/application/workflow/transitions";
import type { MappingSuggestion } from "@/domain/mapping/types";
import { DecisionTable } from "./decision-table";
import { FieldCoverage } from "./field-coverage";

const dataset = datasetFrom([
  ["Customer", "Mail", "Land", "Notes"],
  ["Acme Ltd", "a@acme.example", "UK", "x"],
]);

const suggestion = (id: string, field: string | null, confidence: number): MappingSuggestion => ({
  sourceColumnId: id,
  targetField: field,
  confidence,
  reasoning: `Because ${id}`,
  origin: "llm",
});

function preloaded() {
  const loaded = t.loadDataset(initialState(), dataset);
  const started = t.suggestStarted(loaded);
  return t.suggestSucceeded(started, started.ai.requestId, {
    threadId: "t",
    origin: "llm",
    model: "x/model",
    fallbackReason: null,
    suggestions: [
      suggestion("c-001", "companyName", 0.95),
      suggestion("c-002", "email", 0.9),
      suggestion("c-003", "country", 0.55),
      suggestion("c-004", null, 0),
    ],
  });
}

function Statuses() {
  const decisions = useWorkflow((s) => s.decisions);
  return (
    <output data-testid="statuses">
      {Object.values(decisions)
        .map((d) => d.status)
        .join(",")}
    </output>
  );
}

function setup() {
  const { user } = renderWithWorkflow(
    <>
      <DecisionTable flaggedColumns={new Set()} />
      <FieldCoverage />
      <Statuses />
    </>,
    { initialState: preloaded() },
  );
  const row = (name: string) =>
    screen.getByRole("rowheader", { name: new RegExp(`^${name}`) }).closest("tr")!;
  return { user, row, statuses: () => screen.getByTestId("statuses").textContent };
}

describe("decision table", () => {
  it("shows each suggestion with its confidence bucket", () => {
    const { row } = setup();
    expect(within(row("Customer")).getByRole("combobox")).toHaveTextContent("Company name");
    expect(within(row("Customer")).getByLabelText(/High confidence, 95%/)).toBeInTheDocument();
    expect(within(row("Land")).getByLabelText(/Medium confidence, 55%/)).toBeInTheDocument();
  });

  it("changing the target marks the decision as changed", async () => {
    const { user, row, statuses } = setup();
    await user.click(within(row("Land")).getByRole("combobox", { name: "Target field for Land" }));
    await user.click(await screen.findByRole("option", { name: /City/ }));
    expect(within(row("Land")).getByText("Changed")).toBeInTheDocument();
    expect(statuses()).toBe("pending,pending,modified,pending");
    expect(screen.getByText("Missing: map a column")).toBeInTheDocument();
  });

  it("ignoring a column and resetting it to the suggestion", async () => {
    const { user, row } = setup();
    await user.click(within(row("Mail")).getByRole("button", { name: "Ignore Mail" }));
    expect(within(row("Mail")).getByText("Ignored")).toBeInTheDocument();
    expect(within(row("Mail")).getByRole("combobox")).toHaveTextContent("Don’t import");
    await user.click(
      within(row("Mail")).getByRole("button", { name: "Reset Mail to the suggestion" }),
    );
    expect(within(row("Mail")).getByText("Accepted")).toBeInTheDocument();
  });

  it("expands a row to show the reasoning and a value preview", async () => {
    const { user, row } = setup();
    await user.click(within(row("Land")).getByRole("button", { name: "Show details for Land" }));
    expect(screen.getByText("Because c-003")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: /First values of Land and what they become as Country/ }),
    ).toHaveTextContent("United Kingdom");
  });
});
