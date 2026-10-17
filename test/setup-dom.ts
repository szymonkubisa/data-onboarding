import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { installRadixPolyfills } from "./helpers/radix-polyfills";

installRadixPolyfills();

afterEach(() => {
  cleanup();
});
