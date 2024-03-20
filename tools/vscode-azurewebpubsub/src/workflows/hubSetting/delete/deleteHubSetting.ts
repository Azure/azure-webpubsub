/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type IActionContext} from "@microsoft/vscode-azext-utils";
import { AzureWizard, createSubscriptionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../extensionVariables";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import * as utils from "../../../utils";
import { createActivityContext, localize } from "../../../utils";
import { type IPickHubSettingContext} from "../../common/contexts";
import { type ICreateOrUpdateHubSettingContext } from "../../common/contexts";
import { type HubSettingItem } from "../../../tree/hubSettings/HubSettingItem";
import { pickHubSetting } from "../../../tree/hubSettings/pickHubSetting";
import { DeleteHubSettingConfirmStep } from "./DeleteHubSettingConfirmStep";
import { DeleteHubSettingStep } from "./DeleteHubSettingStep";

export async function deleteHubSetting(context: IActionContext, node?: HubSettingItem): Promise<void> {
    node = node ?? await pickHubSetting(context);

    const service: ServiceItem = node.service;
    const subContext = createSubscriptionContext(service.subscription);

    const wizardContext: IPickHubSettingContext = {
        ...context,
        ...await createActivityContext(),
        subscription: subContext,
        resourceGroupName: service.resourceGroup, 
        serviceName: service.name,
        hubName: node.hub.hubName
    };

    const wizard: AzureWizard<ICreateOrUpdateHubSettingContext> = new AzureWizard(wizardContext, {
        title: localize('deleteHubSetting', 'Delete hub setting {0}', wizardContext.hubName),
        promptSteps: [new DeleteHubSettingConfirmStep()],
        executeSteps: [new DeleteHubSettingStep()]
    });

    await wizard.prompt();
    wizardContext.activityTitle = utils.localize('deleteHubSettingWithName', 'Delete hub setting {0}', wizardContext.hubName);
    await wizard.execute();
    
    ext.branchDataProvider.refresh();
}
