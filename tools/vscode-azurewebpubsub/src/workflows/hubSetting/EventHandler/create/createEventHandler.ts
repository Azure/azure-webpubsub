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
import { HubSettingItem } from "../../../../tree/hubSettings/HubSettingItem";
import { type EventHandlersItem } from "../../../../tree/hubSettings/EventHandlers/EventHandlersItem";
import { pickHubSetting } from "../../../../tree/hubSettings/pickHubSetting";
import { CreateOrUpdateEventHandlerStep } from "../../common/CreateOrUpdateEventHandlerStep";
import { CreateOrUpdateHubSettingStep } from "../../common/CreateOrUpdateHubSettingStep";
import { type ICreateOrUpdateHubSettingContext } from "../../../common/contexts";

export async function createEventHandler(context: IActionContext, node?: HubSettingItem | EventHandlersItem): Promise<void> {
    const parentHubSetting = node 
                       ? (node instanceof HubSettingItem ? node : node.hubItem)
                       : await pickHubSetting(context);
    if (!parentHubSetting) {
        throw new Error(localize('invalidParentHubSetting', 'Invalid Parent Hub Setting'));
    }

    const serivce = parentHubSetting.service;
    const subContext = createSubscriptionContext(serivce.subscription);
    
    const wizardContext: ICreateOrUpdateHubSettingContext = {
        ...context,
        ...await createActivityContext(),
        subscription: subContext,
        resourceGroupName: serivce.resourceGroup,
        serviceName: serivce.name,
        hubName: parentHubSetting.hub.hubName,
        hubProperties: parentHubSetting.hub.properties
    };

    const client = createAzureClient([context, subContext], WebPubSubManagementClient);

    const wizard: AzureWizard<ICreateOrUpdateHubSettingContext> = new AzureWizard(wizardContext, {
        title: localize('createEventHandler', `Create new event handler in hub setting ${parentHubSetting.hub.hubName}`),
        promptSteps: [ new CreateOrUpdateEventHandlerStep(true) ],
        executeSteps: [ new CreateOrUpdateHubSettingStep(client, false) ]
    });

    await wizard.prompt();
    await wizard.execute();
    ext.branchDataProvider.refresh();
}
