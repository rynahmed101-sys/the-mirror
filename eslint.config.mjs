import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  ...compat.config({
    extends: ["next/core-web-vitals"],
  }),
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"],
  },
];
