// `server-only` throws when imported outside a React Server environment.
// Node tests exercise server modules directly, so stub it out.
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
