import { buildDataset } from "@/domain/dataset/build";
import type { SourceDataset } from "@/domain/dataset/types";
import { buildApprovedMapping } from "@/domain/mapping/rules";
import type { ApprovedMapping, MappingDecision } from "@/domain/mapping/types";
import { runQualityPipeline } from "@/domain/quality/pipeline";
import type { QualityInput, QualityReport } from "@/domain/quality/types";
import { customerSchema } from "@/domain/schema/customer";

/** Build a dataset from a header row plus data rows. Throws on invalid input. */
export function datasetFrom(matrix: string[][], fileName = "test.csv"): SourceDataset {
  const result = buildDataset({ id: "ds-test", fileName, fileType: "csv", matrix });
  if (!result.ok) throw new Error(result.error.message);
  return result.dataset;
}

/** Map fields to columns by header name: { email: "E-mail" }. */
export function mappingByHeader(
  dataset: SourceDataset,
  byField: Record<string, string>,
  schemaId = "customer",
): ApprovedMapping {
  const decisions: MappingDecision[] = dataset.columns.map((column) => {
    const field = Object.entries(byField).find(([, header]) => header === column.name)?.[0] ?? null;
    return {
      sourceColumnId: column.id,
      targetField: field,
      status: field ? "accepted" : "ignored",
    };
  });
  return buildApprovedMapping(decisions, schemaId);
}

/** Customer dataset where every header equals the field key. */
export function customerDataset(rows: Record<string, string>[]): {
  dataset: SourceDataset;
  mapping: ApprovedMapping;
} {
  const keys = customerSchema.fields.map((f) => f.key);
  const dataset = datasetFrom([keys, ...rows.map((row) => keys.map((k) => row[k] ?? ""))]);
  const mapping = mappingByHeader(dataset, Object.fromEntries(keys.map((k) => [k, k])));
  return { dataset, mapping };
}

export function runCustomer(
  rows: Record<string, string>[],
  overlays: Partial<Pick<QualityInput, "corrections" | "acceptedFixes" | "excludedRowIds">> = {},
): QualityReport {
  const { dataset, mapping } = customerDataset(rows);
  return runQualityPipeline({
    dataset,
    schema: customerSchema,
    mapping,
    corrections: overlays.corrections ?? {},
    acceptedFixes: overlays.acceptedFixes ?? {},
    excludedRowIds: overlays.excludedRowIds ?? {},
  });
}

export const VALID_CUSTOMER = {
  companyName: "Acme Components Ltd",
  email: "orders@acme.example",
  country: "United Kingdom",
} as const;
