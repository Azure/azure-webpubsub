/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { createAzureApiClient, localize } from '../../../utils';
import { type IPickServiceContext } from "../../common/contexts";

export class RestartWebPubSubStep extends AzureWizardExecuteStep<IPickServiceContext> {
    public priority: number = 110;

    public async execute(context: IPickServiceContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        if (!context.subscription || !context.serviceName || !context.resourceGroupName) {
            throw new Error(localize("invalidIPickServiceContext", "Invalid IPickServiceContext, subscription = {0}, serviceName = {1}, resourceGroupName = {2}", context.subscription?.subscriptionId, context.serviceName, context.resourceGroupName));
        }
        const client = await createAzureApiClient([context, context.subscription]);
        progress.report({ message: localize('restartingService', 'Restarting Web PubSub {0}, please wait...', context.serviceName) });
        await client.webPubSub.beginRestartAndWait(context.resourceGroupName, context.serviceName);
    }

    public shouldExecute(_context: IPickServiceContext): boolean { return true; }
}
