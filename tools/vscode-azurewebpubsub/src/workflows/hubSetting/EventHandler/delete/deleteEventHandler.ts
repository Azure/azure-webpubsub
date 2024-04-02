/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { createAzureClient } from "@microsoft/vscode-azext-azureutils";
import { type IActionContext} from "@microsoft/vscode-azext-utils";
import { AzureWizard, createSubscriptionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../../extensionVariables";
import { createActivityContext, localize } from "../../../../utils";
import { CreateOrUpdateHubSettingStep } from "../../common/CreateOrUpdateHubSettingStep";
import { type ICreateOrUpdateHubSettingContext } from "../../../common/contexts";
import { type EventHandlerItem } from "../../../../tree/hubSettings/EventHandlers/EventHandlerItem";
import { pickEventHandler } from "../../../../tree/hubSettings/EventHandlers/pickEventHandler";

export async function deleteEventHandler(context: IActionContext, node?: EventHandlerItem): Promise<void> {
    const targetEventHandler = node ?? await pickEventHandler(context);
    const parentHubSetting = targetEventHandler.eventHandlersItem.hubItem;
    if (!parentHubSetting) {
        throw new Error(localize('invalidParentHubSetting', 'Invalid Parent Hub Setting'));
    }

    const serivce = parentHubSetting.service;
    const subContext = createSubscriptionContext(serivce.subscription);

    const updatedHubProperties = parentHubSetting.hub.properties;
    if (!updatedHubProperties.eventHandlers) throw new Error(localize(`noEventHandlers`, 'No event handlers found in hub setting {0}', parentHubSetting.hub.hubName));
    const targetEventHandlerIndex = targetEventHandler.priority - 1; // priority starts from 1
    updatedHubProperties.eventHandlers.splice(targetEventHandlerIndex, 1);
    
    const wizardContext: ICreateOrUpdateHubSettingContext = {
        ...context,
        ...await createActivityContext(),
        activityTitle: localize('deleteEventHandler', 'Delete event handler in hub setting {0}', parentHubSetting.hub.hubName),
        subscription: subContext,
        resourceGroupName: serivce.resourceGroup,
        serviceName: serivce.name,
        hubName: parentHubSetting.hub.hubName,
        hubProperties: updatedHubProperties
    };

    const client = createAzureClient([context, subContext], WebPubSubManagementClient);

    const wizard: AzureWizard<ICreateOrUpdateHubSettingContext> = new AzureWizard(wizardContext, {
        promptSteps: [],
        executeSteps: [ new CreateOrUpdateHubSettingStep(client, false) ]
    });
    await wizard.execute();
    ext.branchDataProvider.refresh();
}
