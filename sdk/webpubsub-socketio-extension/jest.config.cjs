const projectConfig = {
  preset: "ts-jest",
  roots: ["<rootDir>/test"],
  testEnvironment: "node",
};

module.exports = {
  collectCoverageFrom: ["src/**/*.ts"],
  coverageProvider: "v8",
  testTimeout: 15000,
  projects: [
    {
      ...projectConfig,
      displayName: "default",
      testMatch: ["<rootDir>/test/index.ts"],
    },
    {
      ...projectConfig,
      displayName: "engine.io@6.6.0",
      testMatch: ["<rootDir>/test/transport-readiness.ts"],
      moduleNameMapper: {
        "^engine.io$": "engine.io-minimum",
      },
    },
  ],
};
