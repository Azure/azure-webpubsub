/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runTests } from '@vscode/test-electron';
import * as path from 'path';

async function main(): Promise<void> {
    try {
        const repoRoot: string = path.resolve(__dirname, '..', '..');
        await runTests({
            extensionDevelopmentPath: repoRoot,
            launchArgs: [
                path.resolve(repoRoot, 'test', 'test.code-workspace')
            ],
            extensionTestsPath: path.resolve(repoRoot, 'dist', 'test', 'index'),
            extensionTestsEnv: {
                DEBUGTELEMETRY: 'v'
            }
        });
    } catch (err) {
        console.error('\nFailed to run tests');
        process.exit(1);
    }
}

void main();
