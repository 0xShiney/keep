import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "lib/forgejo/schema.d.ts",
      "deploy/**",
      "test-results/**",
      "playwright-report/**",
      "coverage/**",
    ],
  },
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // CLI scripts and tests legitimately write to stdout.
    files: ["scripts/**/*.mjs", "tests/**/*.ts", "*.config.ts", "*.config.mjs"],
    rules: { "no-console": "off" },
  },
];

export default config;
