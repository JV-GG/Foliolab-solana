import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Solidity dependencies (git submodules) and captured API payloads
    // are not our source and should not be linted.
    "contracts/lib/**",
    "contracts/out/**",
    "api/responses/**",
    "prototype/**",
  ]),
]);

export default eslintConfig;
