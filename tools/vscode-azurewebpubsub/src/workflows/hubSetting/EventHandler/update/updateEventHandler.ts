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
import { CreateOrUpdateEventHandlerStep } from "../../common/CreateOrUpdateEventHandlerStep";
import { CreateOrUpdateHubSettingStep } from "../../common/CreateOrUpdateHubSettingStep";
import { type ICreateOrUpdateHubSettingContext } from "../../../common/contexts";
import { type EventHandlerItem } from "../../../../tree/hubSettings/EventHandlers/EventHandlerItem";
import { pickEventHandler } from "../../../../tree/hubSettings/EventHandlers/pickEventHandler";

export async function updateEventHandler(context: IActionContext, node?: EventHandlerItem): Promise<void> {
    const parentHubSetting = (node ?? await pickEventHandler(context)).eventHandlersItem.hubItem;
    if (!parentHubSetting) {
        throw new Error(localize('invalidParentHubSetting', 'Invalid Parent Hub Setting'));
    }

    const serivce = parentHubSetting.service;
    const subContext = createSubscriptionContext(serivce.subscription);
    const client = createAzureClient([context, subContext], WebPubSubManagementClient);
    
    const wizardContext: ICreateOrUpdateHubSettingContext = {
        ...context,
        ...await createActivityContext(),
        subscription: subContext,
        resourceGroupName: serivce.resourceGroup,
        serviceName: serivce.name,
        hubName: parentHubSetting.hub.hubName,
        hubProperties: parentHubSetting.hub.properties
    };

    const wizard: AzureWizard<ICreateOrUpdateHubSettingContext> = new AzureWizard(wizardContext, {
        title: localize('updateEventHandler', "Update event handler in hub setting {0}", parentHubSetting.hub.hubName),
        promptSteps: [ new CreateOrUpdateEventHandlerStep(false) ],
        executeSteps: [ new CreateOrUpdateHubSettingStep(client, false) ]
    });

    await wizard.prompt();
    await wizard.execute();
    ext.branchDataProvider.refresh();
}
