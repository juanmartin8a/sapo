import js from "@eslint/js";
import ts from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
export default ts.config(
    {
        ignores: [
            "node_modules/**",
            ".vercel/**",
            ".output/**",
            ".tanstack/**",
            ".nitro/**",
            "public/**",
            "src/routeTree.gen.ts",
        ],
    },
    js.configs.recommended,
    ...ts.configs.recommended,
    prettier,
    { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);
