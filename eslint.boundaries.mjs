/**
 * Layer boundaries, written as `no-restricted-imports` rules. Kept separate from `pnpm lint`.
 *
 * Direction of dependencies:
 *
 *   app → features/components → application → domain
 *   app/api → infrastructure/ai → domain
 *   infrastructure (parsers, exporters) → domain
 *
 * Each block forbids the imports that would break that direction.
 * See docs/architecture.md for the reasoning.
 */
const LAYER = {
  contracts: ["@/contracts", "@/contracts/*"],
  infrastructure: ["@/infrastructure", "@/infrastructure/*"],
  application: ["@/application", "@/application/*"],
  features: ["@/features", "@/features/*"],
  components: ["@/components", "@/components/*"],
  app: ["@/app", "@/app/*"],
  ai: ["@/infrastructure/ai", "@/infrastructure/ai/*"],
};

const restrict = (group, message) => ({
  "no-restricted-imports": ["error", { patterns: [{ group, message }] }],
});

/** @type {import("eslint").Linter.Config[]} */
export const layerBoundaries = [
  {
    // domain: pure TypeScript + zod. No frameworks, no IO, no outer layers.
    files: ["src/domain/**/*.ts"],
    rules: restrict(
      [
        "react",
        "react-dom",
        "next",
        "next/*",
        "@langchain/*",
        "papaparse",
        "read-excel-file",
        "read-excel-file/*",
        "zustand",
        "zustand/*",
        ...LAYER.contracts,
        ...LAYER.infrastructure,
        ...LAYER.application,
        ...LAYER.features,
        ...LAYER.components,
        ...LAYER.app,
      ],
      "domain/ must stay framework-free and must not import outer layers.",
    ),
  },
  {
    // contracts: wire schemas shared by route handlers and the browser. zod + domain only.
    files: ["src/contracts/**/*.ts"],
    rules: restrict(
      [
        "react",
        "next",
        "next/*",
        "@langchain/*",
        ...LAYER.infrastructure,
        ...LAYER.application,
        ...LAYER.features,
        ...LAYER.components,
        ...LAYER.app,
      ],
      "contracts/ may depend on zod and domain/ only.",
    ),
  },
  {
    // infrastructure: adapters. May use libraries, never React or UI layers.
    files: ["src/infrastructure/**/*.ts"],
    rules: restrict(
      [
        "react",
        "react-dom",
        ...LAYER.application,
        ...LAYER.features,
        ...LAYER.components,
        ...LAYER.app,
      ],
      "infrastructure/ must not depend on React or on UI/application layers.",
    ),
  },
  {
    // application: client-side workflow state. Never server-only AI code.
    files: ["src/application/**/*.{ts,tsx}"],
    rules: restrict(
      [...LAYER.ai, ...LAYER.features, ...LAYER.components, ...LAYER.app],
      "application/ must not import AI infrastructure or UI layers.",
    ),
  },
  {
    // UI layers reach the AI only through /api (application/workflow/api-client).
    files: ["src/features/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: restrict(
      [...LAYER.ai, ...LAYER.app],
      "UI code talks to the AI only through /api routes (application/workflow/api-client).",
    ),
  },
  {
    // Pages are UI too. Only app/api/** and the workspace layout (mode badge) may read AI config.
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**", "src/app/(workspace)/layout.tsx"],
    rules: restrict(LAYER.ai, "Only app/api/** may import infrastructure/ai."),
  },
];
