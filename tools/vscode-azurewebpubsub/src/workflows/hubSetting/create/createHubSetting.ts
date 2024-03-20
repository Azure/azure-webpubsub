/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { createAzureClient } from "@microsoft/vscode-azext-azureutils";
import { type IActionContext} from "@microsoft/vscode-azext-utils";
import { AzureWizard, createSubscriptionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../extensionVariables";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import * as utils from "../../../utils";
import { createActivityContext, localize } from "../../../utils";
import { CreateOrUpdateHubSettingStep } from "../common/CreateOrUpdateHubSettingStep";
import { type ICreateOrUpdateHubSettingContext } from "../../common/contexts";
import { InputNewHubSettingStep } from "./InputNewHubSettingStep";
import { HubSettingsItem } from "../../../tree/hubSettings/HubSettingsItem";
import { pickHubSettings } from "../../../tree/hubSettings/pickHubSettings";

export async function createHubSetting(context: IActionContext, node?: HubSettingsItem | ServiceItem): Promise<void> {
    node = node ? node : await pickHubSettings(context);

    const service: ServiceItem = node instanceof HubSettingsItem ? node.service : node.hubs.service;
    const subContext = createSubscriptionContext(service.subscription);

    const wizardContext: ICreateOrUpdateHubSettingContext = {
        ...context,
        ...await createActivityContext(),
        subscription: subContext,
        resourceGroupName: service.resourceGroup, 
        serviceName: service.name,
        hubProperties: { eventHandlers: [], eventListeners: [] }
    };

    const client = createAzureClient([context, subContext], WebPubSubManagementClient);

    const wizard: AzureWizard<ICreateOrUpdateHubSettingContext> = new AzureWizard(wizardContext, {
        title: localize('createHubSetting', `Create hub setting`),
        promptSteps: [new InputNewHubSettingStep()],
        executeSteps: [new CreateOrUpdateHubSettingStep(client, true)]
    });

    await wizard.prompt();
    wizardContext.activityTitle = utils.localize('createHubSettingWithName', 'Create hub setting {0}', wizardContext.hubName);
    await wizard.execute();
    
    ext.branchDataProvider.refresh();
}
