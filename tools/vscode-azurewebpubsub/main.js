/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

"use strict";

// This is the extension entrypoint module, which imports extension.bundle.js, the actual extension code.
//
// This is in a separate file so we can properly measure extension.bundle.js load time.

let perfStats = {
    loadStartTime: Date.now(),
    loadEndTime: undefined
};

Object.defineProperty(exports, "__esModule", { value: true });

const extension = require('./out/extension.bundle');

async function activate(ctx) {
    return await extension.activate(ctx, perfStats, true /*ignoreBundle*/);
}

async function deactivate(ctx) {
    return await extension.deactivate(ctx, perfStats);
}

// Export as entrypoints for vscode
exports.activate = activate;
exports.deactivate = deactivate;

perfStats.loadEndTime = Date.now();
