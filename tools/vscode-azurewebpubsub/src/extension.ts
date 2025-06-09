/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

'use strict';

import { registerAzureUtilsExtensionVariables } from '@microsoft/vscode-azext-azureutils';
import { TreeElementStateManager, createAzExtOutputChannel, registerUIExtensionVariables } from '@microsoft/vscode-azext-utils';
import type * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ext } from './extensionVariables';
import { ServicesDataProvider } from './tree/ServicesDataProvider';
import { AzExtResourceType, getAzureResourcesExtensionApi } from '@microsoft/vscode-azureresources-api';
import { loadPackageInfo } from './utils';
import { dispose as disposeTelemetryWrapper, initialize, instrumentOperation } from 'vscode-extension-telemetry-wrapper';

export async function activate(context: vscode.ExtensionContext, perfStats: { loadStartTime: number; loadEndTime: number }, ignoreBundle?: boolean): Promise<void> {
    ext.context = context;
    ext.ignoreBundle = ignoreBundle;
    ext.outputChannel = createAzExtOutputChannel('Azure Web PubSub', ext.prefix);
    context.subscriptions.push(ext.outputChannel);

    registerUIExtensionVariables(ext);
    registerAzureUtilsExtensionVariables(ext);

    const { version, applicationInsightKey, extensionId } = await loadPackageInfo(context);
    initialize(extensionId, version, applicationInsightKey, { firstParty: true });

    instrumentOperation('activation', async () => {
        ext.state = new TreeElementStateManager();
        ext.branchDataProvider = new ServicesDataProvider();
        ext.rgApiV2 = await getAzureResourcesExtensionApi(context, '2.0.0');
        ext.rgApiV2.resources.registerAzureResourceBranchDataProvider(AzExtResourceType.WebPubSub, ext.branchDataProvider);
        registerCommands(context);
    })();
}

export async function deactivate(): Promise<void> {
    await disposeTelemetryWrapper();
}
