import { beforeEach, describe, expect, it, vi } from "vitest";
import { datasetFrom } from "../../../../test/helpers/factories";
import { ReviewResponseSchema, SuggestResponseSchema } from "@/contracts/mapping-api";
import { profileColumns } from "@/domain/dataset/profile";
import { POST as review } from "./review/route";
import { POST as suggest } from "./suggest/route";

const profile = profileColumns(
  datasetFrom([
    ["Company", "Email", "Country"],
    ["Acme", "a@acme.example", "UK"],
  ]),
);

let ip = 0;
const post = (body: unknown, raw?: string) =>
  new Request("http://localhost/api/mapping", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${(ip += 1)}` },
    body: raw ?? JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST /api/mapping/suggest", () => {
  it("returns heuristic suggestions in demo mode", async () => {
    const response = await suggest(post({ schemaId: "supplier", profile }));
    expect(response.status).toBe(200);
    const body = SuggestResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ origin: "heuristic", fallbackReason: "demo-mode" });
    expect(body.suggestions.map((s) => s.targetField)).toEqual(["companyName", "email", "country"]);
  });

  it.each([
    ["not json", undefined, "{", "invalid-json"],
    ["missing profile", { schemaId: "supplier" }, undefined, "invalid-request"],
    ["empty profile", { schemaId: "supplier", profile: [] }, undefined, "invalid-request"],
    ["unknown schema", { schemaId: "invoice", profile }, undefined, "unknown-schema"],
    [
      "duplicate column ids",
      { schemaId: "supplier", profile: [profile[0], profile[0]] },
      undefined,
      "invalid-request",
    ],
    [
      "too many samples",
      { schemaId: "supplier", profile, samples: { "c-001": ["a", "b", "c", "d"] } },
      undefined,
      "invalid-request",
    ],
  ])("400 on %s", async (_name, body, raw, code) => {
    const response = await suggest(post(body, raw));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code } });
  });

  it("413 on oversized bodies", async () => {
    const response = await suggest(post(undefined, JSON.stringify({ pad: "x".repeat(300_000) })));
    expect(response.status).toBe(413);
  });

  it("logs counts, never values", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await suggest(
      post({ schemaId: "supplier", profile, samples: { "c-002": ["secret@acme.example"] } }),
    );
    const logged = info.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain('"event":"mapping.suggest"');
    expect(logged).not.toContain("secret@acme.example");
    expect(logged).not.toContain("Company");
  });
});

describe("POST /api/mapping/review", () => {
  it("approves a complete mapping on the same instance", async () => {
    const started = SuggestResponseSchema.parse(
      await (await suggest(post({ schemaId: "supplier", profile }))).json(),
    );
    const decisions = started.suggestions.map((s) => ({
      sourceColumnId: s.sourceColumnId,
      targetField: s.targetField,
      status: "accepted" as const,
    }));
    const response = await review(
      post({
        threadId: started.threadId,
        schemaId: "supplier",
        decisions,
        suggestions: started.suggestions,
        profile,
      }),
    );
    const body = ReviewResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ status: "approved", rehydrated: false });
  });

  it("rehydrates unknown threads and reports what is missing", async () => {
    const response = await review(
      post({
        threadId: "never-seen",
        schemaId: "supplier",
        decisions: [{ sourceColumnId: "c-001", targetField: "companyName", status: "accepted" }],
        suggestions: [],
        profile,
      }),
    );
    const body = ReviewResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ status: "needs-changes", rehydrated: true });
    if (body.status === "needs-changes") {
      expect(body.issues.map((i) => i.kind)).toEqual(["missing-required", "missing-required"]);
    }
  });

  it("400 on malformed decisions", async () => {
    const response = await review(
      post({
        threadId: "x",
        schemaId: "supplier",
        decisions: [{ sourceColumnId: 1 }],
        suggestions: [],
        profile,
      }),
    );
    expect(response.status).toBe(400);
  });
});
