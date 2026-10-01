// ESLint flat config. Lints TypeScript sources only; build output and config
// files are ignored. Prettier is applied last so formatting never fights lint.
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const prettier = require("eslint-config-prettier");

module.exports = tseslint.config(
  { ignores: ["lib/**", "node_modules/**", "eslint.config.js", "jest.config.js", "babel.config.js"] },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "no-console": "error",
      // Allow intentionally-unused args/vars when prefixed with "_" (e.g. the
      // Express error-handler signature requires a 4th `next` param we don't use).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);
