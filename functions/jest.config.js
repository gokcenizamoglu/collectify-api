// Jest runs TypeScript integration tests via ts-jest against the emulator.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/test/**/*.test.ts"],
};
