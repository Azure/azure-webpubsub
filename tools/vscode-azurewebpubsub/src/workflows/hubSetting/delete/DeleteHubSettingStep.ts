/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { createAzureApiClient, localize } from '../../../utils';
import { type IPickHubSettingContext} from "../../common/contexts";
import { type IPickServiceContext } from "../../common/contexts";

export class DeleteHubSettingStep extends AzureWizardExecuteStep<IPickHubSettingContext> {
    public priority: number = 110;

    public async execute(context: IPickHubSettingContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        if (!context.subscription || !context.serviceName || !context.resourceGroupName || !context.hubName) {
            throw new Error(localize("invalidIPickHubSettingContext", "Invalid IPickHubSettingContext, subscription = {0}, serviceName = {1}, resourceGroupName = {2}, hubName = {3}",
            context.subscription?.subscriptionId, context.serviceName, context.resourceGroupName, context.hubName));
        }

        const client = await createAzureApiClient([context, context.subscription]);
        progress.report({ message: localize('deletingHubSetting', 'Deleting hub setting "{0}", please wait...', context.hubName)});
        await client.webPubSubHubs.beginDeleteAndWait(context.hubName, context.resourceGroupName, context.serviceName);
    }

    public shouldExecute(_context: IPickServiceContext): boolean { return true; }
}
