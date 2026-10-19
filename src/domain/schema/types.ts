import type { z } from "zod";

export type FieldKey = string;

/** Kind drives transformations and validation. Adding a kind means adding a rule in quality/. */
export type FieldKind = "text" | "email" | "url" | "phone" | "country" | "identifier";

export interface FieldDefinition<K extends FieldKey = FieldKey> {
  key: K;
  label: string;
  /** One sentence. Shown in the UI and sent to the AI as field context. */
  description: string;
  required: boolean;
  kind: FieldKind;
  /** Header spellings seen in the wild. Used by heuristics and given to the AI as hints. */
  synonyms: readonly string[];
  example: string;
}

/** Fields whose normalized values identify the same real-world entity. */
export interface DuplicateKeyDefinition<K extends FieldKey = FieldKey> {
  id: string;
  label: string;
  fields: readonly K[];
}

export interface TargetSchema<K extends FieldKey = FieldKey> {
  id: string;
  label: string;
  description: string;
  /** Order is the export column order. */
  fields: readonly FieldDefinition<K>[];
  /** The contract of a valid record. Used for record-level validation in the quality pipeline. */
  recordSchema: z.ZodType;
  duplicateKeys: readonly DuplicateKeyDefinition<K>[];
}
