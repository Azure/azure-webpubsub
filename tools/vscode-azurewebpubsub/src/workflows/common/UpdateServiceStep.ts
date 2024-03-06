/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { type IUpdateServiceContext } from "./contexts";
import { createAzureApiClient, localize } from "../../utils";

export class UpdateServiceStep extends AzureWizardExecuteStep<IUpdateServiceContext> {
    public priority: number = 135;

    public async execute(context: IUpdateServiceContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        if (!context.subscription || !context.resourceGroupName || !context.serviceName || !context.resource) {
            throw new Error(localize("invalidIUpdateServiceContext", "Invalid IUpdateServiceContext, subscription = {0}, resourceGroupName = {1}, serviceName = {2}, resource = {3}", context.subscription?.subscriptionId, context.resourceGroupName, context.serviceName, context.resource.toString()));
        }
        const client = await createAzureApiClient([context, context.subscription]);
        const message = localize('updateService', 'Updating Web PubSub resource "{0}", please wait...', context.serviceName);
        progress.report({ message });
        await client.webPubSub.beginCreateOrUpdateAndWait(context.resourceGroupName, context.serviceName, context.resource);
    }

    public shouldExecute(_context: IUpdateServiceContext): boolean { return true; }
}
