// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createClientLogger } from "@azure/logger";

/**
 * The \@azure\/logger configuration for this package.
 */
export const logger = createClientLogger("awps-server-proxy");

export const createLogger = (name: string) => createClientLogger("awps-server-proxy:" + name); 