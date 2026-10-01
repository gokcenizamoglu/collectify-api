// ESLint flat config. Lints TypeScript sources only; build output and config
// files are ignored. Prettier is applied last so formatting never fights lint.
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const prettier = require("eslint-config-prettier");

module.exports = tseslint.config(
  { ignores: ["lib/**", "node_modules/**", "eslint.config.js", "jest.config.js"] },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "no-console": "error",
    },
  },
  prettier,
);
