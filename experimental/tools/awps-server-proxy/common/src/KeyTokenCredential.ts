// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { TokenCredential, GetTokenOptions, AccessToken } from "@azure/core-auth";
import jwt from "jsonwebtoken";

export class KeyTokenCredential implements TokenCredential {
  constructor(private _key: string) {}
  async getToken(
    scopes: string | string[],
    options?: GetTokenOptions
  ): Promise<AccessToken | null> {
    const token = jwt.sign({}, this._key, {
      audience: options?.claims ?? scopes,
      expiresIn: "1h",
      algorithm: "HS256",
    });
    return { token: token, expiresOnTimestamp: 0 };
  }
}
