/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { parseError, registerCommandWithTreeNodeUnwrapping, type CommandCallback, type IActionContext, type IParsedError } from "@microsoft/vscode-azext-utils";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { showError } from "./utils";
import { createServiceInPortal } from "./workflows/service/create/createServiceInPortal";
import { createServiceForClassical, createServiceForSocketIO } from "./workflows/service/create/createService";
import { deleteService } from "./workflows/service/delete/deleteService";

function registerCommandWithTelemetryWrapper(commandId: string, callback: CommandCallback): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const callbackWithTroubleshooting: CommandCallback = (context: IActionContext, ...args: []) => instrumentOperation(commandId, async () => {
        try {
            await callback(context, ...args);
        } catch (error) {
            const e: IParsedError = parseError(error);
            if (!e.isUserCancelledError) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                showError(commandId, error);
            }
            throw error;
        }
    })();
    registerCommandWithTreeNodeUnwrapping(commandId, callbackWithTroubleshooting);
}

export function registerCommands(): void {
    // Service
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.createInPortal', createServiceInPortal);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.createClassical', createServiceForClassical);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.createSocketIO', createServiceForSocketIO);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.delete', deleteService);
}
