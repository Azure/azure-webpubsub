/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { CommandCallback, IActionContext, IParsedError, parseError, registerCommandWithTreeNodeUnwrapping } from '@microsoft/vscode-azext-utils';
import { instrumentOperation } from 'vscode-extension-telemetry-wrapper';
import { showError } from './utils';

export function registerCommands(): void {
}

export function registerCommandWithTelemetryWrapper(commandId: string, callback: CommandCallback): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const callbackWithTroubleshooting: CommandCallback = (context: IActionContext, ...args: []) => instrumentOperation(commandId, async () => {
        try {
            await callback(context, ...args);
        } catch (error) {
            const e: IParsedError = parseError(error);
            if (!e.isUserCancelledError) {
                // tslint:disable-next-line: no-unsafe-any
                showError(commandId, error);
            }
            throw error;
        }
    })();
    registerCommandWithTreeNodeUnwrapping(commandId, callbackWithTroubleshooting);
}
