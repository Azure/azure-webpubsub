/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { parseError, registerCommandWithTreeNodeUnwrapping, type CommandCallback, type IActionContext, type IParsedError } from "@microsoft/vscode-azext-utils";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { showError } from "./utils";
import { createServiceInPortal } from "./workflows/service/create/createServiceInPortal";
import { createServiceForClassical, createServiceForSocketIO } from "./workflows/service/create/createService";
import { openLiveTraceTool } from "./workflows/service/openLiveTraceTool/openLiveTraceTool";
import { restartService } from "./workflows/service/restart/restartService";
import { deleteService } from "./workflows/service/delete/deleteService";
import { copyServiceEndpoint } from "./workflows/service/copyEndpoint/copyEndpoint";
import { copyConnectionString } from "./workflows/service/copyConnectionString/copyConnectionString";
import { scaleUp } from "./workflows/service/scale/scaleUp";
import { scaleOut } from "./workflows/service/scale/scaleOut";
import { regenerateKey } from "./workflows/service/regenerateKey/regenerateKey";
import { createHubSetting } from "./workflows/hubSetting/create/createHubSetting";
import { createEventHandler } from "./workflows/hubSetting/EventHandler/create/createEventHandler";
import { viewMetrics } from "./workflows/service/viewMetric/viewMetrics";
import { checkServiceHealth } from "./workflows/service/checkHealth/checkHealth";

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
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.restart', restartService);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.copyConnectionString', copyConnectionString);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.copyEndpoint', copyServiceEndpoint);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.openLiveTraceTool', openLiveTraceTool);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.regenerateKey', regenerateKey);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.scaleUp', scaleUp);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.scaleOut', scaleOut);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.viewMetrics', viewMetrics);
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.checkHealth', checkServiceHealth);

    // Service.HubSetting
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.hubSetting.create', createHubSetting);

    // Service.HubSetting.EventHandler
    registerCommandWithTelemetryWrapper('azureWebPubSub.service.hubSetting.eventHandler.create', createEventHandler);
}
