// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { AzureLogger, setLogLevel } from "@azure/logger";
import chalk from "chalk";

const printer = (function () {
  let verboseLogging = false;
  function enableVerboseLogging() {
    verboseLogging = true;
  }
  return {
    enableVerboseLogging: enableVerboseLogging,
    info: (...args: unknown[]) => console.log(chalk.green(args)),
    warn: (...args: unknown[]) => console.log(chalk.yellow(args)),
    error: (...args: unknown[]) => console.log(chalk.red(args)),
    text: (...args: unknown[]) => console.log(chalk.italic(args)),
    suggestions: (...args: unknown[]) => console.log(chalk.bold(args)),
    status: (...args: unknown[]) => console.log(chalk.dim(args)),
    log: (...args: unknown[]) => {
      if (verboseLogging) {
        console.log(chalk.gray(args));
      }
    },
  };
})();

AzureLogger.log = (...args) => {
  console.log(chalk.gray(args));
};

export { setLogLevel, printer };
