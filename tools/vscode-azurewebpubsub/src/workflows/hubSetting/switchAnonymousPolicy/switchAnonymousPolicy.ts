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
import { HubSettingItem } from "../../../tree/hubSettings/HubSettingItem";
import { pickHubSetting } from "../../../tree/hubSettings/pickHubSetting";
import { KnownAnonymousConnectPolicy } from "../../../constants";
import { type AnonymousPolicyItem } from "../../../tree/hubSettings/AnonymousPolicyItem";

export async function switchAnonymousPolicy(context: IActionContext, node?: HubSettingItem | AnonymousPolicyItem ): Promise<void> {
    node = node 
        ? (node instanceof HubSettingItem ? node : node.hubItem)
        : await pickHubSetting(context);

    const service: ServiceItem = node.service;
    const subContext = createSubscriptionContext(service.subscription);
    const targetPolicy = node.hub.properties.anonymousConnectPolicy === KnownAnonymousConnectPolicy.Allow ? KnownAnonymousConnectPolicy.Deny : KnownAnonymousConnectPolicy.Allow;

    const wizardContext: ICreateOrUpdateHubSettingContext = {
        ...context,
        ...await createActivityContext(),
        subscription: subContext,
        resourceGroupName: service.resourceGroup, 
        serviceName: service.name,
        hubName: node.hub.hubName,
        hubProperties: {
            ...node.hub.properties,
            anonymousConnectPolicy: targetPolicy
        }
    };

    const client = createAzureClient([context, subContext], WebPubSubManagementClient);

    const wizard: AzureWizard<ICreateOrUpdateHubSettingContext> = new AzureWizard(wizardContext, {
        title: localize('switchingAnonymousPolicy', `Switching anonymous connect policy from {0} to {1}`, node.hub.properties.anonymousConnectPolicy, targetPolicy),
        promptSteps: [],
        executeSteps: [new CreateOrUpdateHubSettingStep(client, false)]
    });

    await wizard.prompt();
    wizardContext.activityTitle = utils.localize('switchingAnonymousPolicy', 'Switching anonymous connect policy for hub setting {0} from "{1}" to "{2}"', wizardContext.hubName, node.hub.properties.anonymousConnectPolicy, targetPolicy);
    await wizard.execute();
    
    ext.branchDataProvider.refresh();
}
