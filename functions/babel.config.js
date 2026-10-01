// Test-only Babel config, used by babel-jest for the few node_modules packages
// Jest cannot load as-is. jose@6 is ESM-only and jwks-rsa (pulled in by
// firebase-admin) does require("jose"); Jest's module runtime can't require()
// an ES module on Node 22, so we downlevel just that package's ESM to CommonJS.
// Production runs on real Node, which requires the ESM jose natively — this
// config never affects the deployed function.
module.exports = {
  plugins: ["@babel/plugin-transform-modules-commonjs"],
};
