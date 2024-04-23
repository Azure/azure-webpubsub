/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { createWebPubSubAPIClient, localize, createActivityContext } from "../../../utils";
import { type HubSettingItem } from "../../../tree/hubSettings/HubSettingItem";
import { pickHubSetting } from "../../../tree/hubSettings/pickHubSetting";
import { type IPickHubSettingContext } from "../../common/contexts";
import { AttachLocalTunnelStep } from "./AttachLocalTunnelStep";

export async function attachLocalTunnel(context: IActionContext, node?: HubSettingItem): Promise<void> {
    const hubItem: HubSettingItem = node ?? await pickHubSetting(context, { title: localize('chooseHub', 'Choose a Hub to start local tunnel') });
    const serviceItem = hubItem.service;

    if (!hubItem || !serviceItem || !hubItem.hub.name || !serviceItem.service.hostName) {
        throw new Error(`Invalid hub ${hubItem} or service ${serviceItem}`);
    }

    const subContext = createSubscriptionContext(serviceItem.subscription);
    const client = await createWebPubSubAPIClient(context, serviceItem.subscription);
    const wizardContext: IPickHubSettingContext = {
        ...context,
        ...await createActivityContext(),
        subscription: subContext,
        resourceGroupName: serviceItem.resourceGroup,
        serviceName: serviceItem.name,
        hubName: hubItem.hub.name
    };
    
    const wizard: AzureWizard<IPickHubSettingContext> = new AzureWizard(wizardContext, {
        title: localize('attachTunnel', 'Attach Local Tunnel for Hub {0}', wizardContext.hubName),
        promptSteps: [],
        executeSteps: [new AttachLocalTunnelStep(client)]
    });

    await wizard.prompt();
    wizardContext.activityTitle = localize('attachingTunnel', 'Attaching Local Tunnel for Hub {0}', wizardContext.hubName);
    await wizard.execute();
}
