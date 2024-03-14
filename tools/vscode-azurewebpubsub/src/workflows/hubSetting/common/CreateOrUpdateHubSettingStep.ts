/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { localize } from "../../../utils";
import { type ICreateOrUpdateHubSettingContext } from "src/workflows/common/contexts";

export class CreateOrUpdateHubSettingStep extends AzureWizardExecuteStep<ICreateOrUpdateHubSettingContext> {
    public priority: number = 135;

    constructor(private readonly client: WebPubSubManagementClient, private readonly isNewHub: boolean) { super(); }

    public async execute(context: ICreateOrUpdateHubSettingContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        progress.report({ message: this.isNewHub ? localize('creatingHubSetting', `Creating Hub Setting {0}`, context.hubName) 
                                                 : localize('updatingHubSetting', `Updating Hub Setting {0}`, context.hubName)});
        
        if (!context.hubProperties || !context.hubName || !context.resourceGroupName || !context.serviceName) {
            throw new Error(localize('invalidICreateOrUpdateHubSettingContext', 'Invalid ICreateOrUpdateHubSettingContext, hubName = {0}, resourceGroupName = {1}, serviceName = {2}, hubProperties = {3}',
                    context.hubName, context.resourceGroupName, context.serviceName, JSON.stringify(context.hubProperties)
                )
            );
        }

        await this.client.webPubSubHubs.beginCreateOrUpdateAndWait(context.hubName, context.resourceGroupName, context.serviceName, 
            {
                properties: {
                    ...context.hubProperties,
                    eventHandlers: context.hubProperties.eventHandlers ?? [],
                    eventListeners: context.hubProperties.eventListeners ?? []
                }
            }
        );
    }

    public shouldExecute(_context: ICreateOrUpdateHubSettingContext): boolean { return true; }
}
