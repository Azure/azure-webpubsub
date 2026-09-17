module.exports = {
  collectCoverageFrom: ["src/**/*.ts"],
  coverageProvider: "v8",
  preset: "ts-jest",
  roots: ["<rootDir>/test"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/index.ts"],
  testTimeout: 15000,
};
