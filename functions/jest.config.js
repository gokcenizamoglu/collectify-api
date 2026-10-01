// Jest runs TypeScript integration tests via ts-jest against the emulator.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/test/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
    // Our TS is handled by ts-jest; .js is only hit for the node_modules
    // packages un-ignored below (jose), which babel-jest downlevels to CommonJS.
    "^.+\\.jsx?$": "babel-jest",
  },
  // node_modules is not transformed by default; make an exception for jose (ESM-only).
  transformIgnorePatterns: ["/node_modules/(?!jose/)"],
};
