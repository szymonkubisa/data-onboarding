import { supplierSchema } from "./supplier";
import type { FieldDefinition, FieldKey, TargetSchema } from "./types";

/**
 * All target schemas. The UI ships with one; adding a schema means adding an entry here
 * (and a field-kind rule in quality/ if it introduces a new kind).
 */
const REGISTRY = {
  supplier: supplierSchema,
} as const satisfies Record<string, TargetSchema>;

export type SchemaId = keyof typeof REGISTRY;

export const SCHEMA_IDS = Object.keys(REGISTRY) as SchemaId[];
export const DEFAULT_SCHEMA_ID: SchemaId = "supplier";

export function isSchemaId(value: string): value is SchemaId {
  return Object.hasOwn(REGISTRY, value);
}

export function getSchema(id: SchemaId): TargetSchema {
  return REGISTRY[id];
}

export function listSchemas(): readonly TargetSchema[] {
  return SCHEMA_IDS.map((id) => REGISTRY[id]);
}

export function getField(schema: TargetSchema, key: FieldKey): FieldDefinition | undefined {
  return schema.fields.find((field) => field.key === key);
}

export function fieldKeys(schema: TargetSchema): FieldKey[] {
  return schema.fields.map((field) => field.key);
}
