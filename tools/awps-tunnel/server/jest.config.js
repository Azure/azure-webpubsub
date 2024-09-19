module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json', // Ensure it points to the correct tsconfig
    },
  },
};
