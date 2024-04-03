/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import { createActivityContext, createEndpointFromHostName, localize } from "../../../utils";
import { CheckHealthStep } from "./CheckHealthStep";
import { type ICheckHealthContext } from "./ICheckHealthContext";
import { pickService } from "../../../tree/service/pickService";

export async function checkServiceHealth(context: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service} = node ?? await pickService(context, {
        title: localize('checkHealth', 'Check Web PubSub Health'),
    });

    if (!service.hostName) {
        throw new Error(localize('noHostName', 'The selected service "{0}" does not have a hostname.', service.name));
    }

    const wizardContext: ICheckHealthContext = {
        ...context,
        ...await createActivityContext(),
        subscription: createSubscriptionContext(subscription),
        serviceName: service.name,
        resourceGroupName: service.resourceGroup,
        endpoint: service.hostName ? createEndpointFromHostName(service.hostName) : undefined
    };

    const wizard: AzureWizard<ICheckHealthContext> = new AzureWizard(wizardContext, { // title property in `IWizardOptions` only works for prompt steps
        executeSteps: [new CheckHealthStep()]
    });
    wizardContext.activityTitle = localize('checkHealthWithName', 'Check Service Health of "{0}"', service.name);
    await wizard.execute();
}
