/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

'use strict';

import { registerAzureUtilsExtensionVariables } from '@microsoft/vscode-azext-azureutils';
import { type IActionContext} from '@microsoft/vscode-azext-utils';
import { TreeElementStateManager, callWithTelemetryAndErrorHandling, createAzExtOutputChannel, registerUIExtensionVariables } from '@microsoft/vscode-azext-utils';
import type * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ext } from './extensionVariables';
import { ServicesDataProvider } from './tree/ServicesDataProvider';
import { type AzExtResourceType, getAzureResourcesExtensionApi } from '@microsoft/vscode-azureresources-api';

export async function activate(context: vscode.ExtensionContext, perfStats: { loadStartTime: number; loadEndTime: number }, ignoreBundle?: boolean): Promise<void> {
    // the entry point for vscode.dev is this activate, not main.js, so we need to instantiate perfStats here
    // the perf stats don't matter for vscode because there is no main file to load-- we may need to see if we can track the download time
    perfStats ||= { loadStartTime: Date.now(), loadEndTime: Date.now() };
    ext.context = context;
    ext.ignoreBundle = ignoreBundle;
    ext.outputChannel = createAzExtOutputChannel('Azure Web PubSub', ext.prefix);
    context.subscriptions.push(ext.outputChannel);

    registerUIExtensionVariables(ext);
    registerAzureUtilsExtensionVariables(ext);

    await callWithTelemetryAndErrorHandling('webPubSub.activate', async (activateContext: IActionContext) => {
        activateContext.telemetry.properties.isActivationEvent = 'true';
        activateContext.telemetry.measurements.mainFileLoad = (perfStats.loadEndTime - perfStats.loadStartTime) / 1000;

        ext.state = new TreeElementStateManager();
        ext.branchDataProvider = new ServicesDataProvider();
        ext.rgApiV2 = await getAzureResourcesExtensionApi(context, '2.0.0');
        ext.rgApiV2.resources.registerAzureResourceBranchDataProvider("WebPubSub" as AzExtResourceType, ext.branchDataProvider);

        registerCommands();
    });
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {
}
