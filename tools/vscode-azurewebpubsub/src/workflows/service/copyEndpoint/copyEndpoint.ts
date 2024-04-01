/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import * as utils from "../../../utils";
import { createActivityContext, localize } from '../../../utils';
import { CopyEndpointStep } from "./CopyEndpointStep";
import { type ICopyEndpointContext } from "./ICopyEndpointContext";
import { pickService } from "../../../tree/service/pickService";

export async function copyServiceEndpoint(context: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service: service } = node ?? await pickService(context, {
        title: localize('copyEndpoint', 'Copy Endpoint'),
    });

    if (!service.hostName) {
        throw new Error(localize('noHostName', 'The selected service "{0}" does not have a hostname.', service.name));
    }

    const wizardContext: ICopyEndpointContext = {
        ...context,
        ...await createActivityContext(),
        subscription: createSubscriptionContext(subscription),
        serviceName: service.name,
        resourceGroupName: service.resourceGroup,
        endpoint: service.hostName ? utils.createEndpointFromHostName(service.hostName) : undefined
    };

    const wizard: AzureWizard<ICopyEndpointContext> = new AzureWizard(wizardContext, {
        title: localize('copyEndpoint', 'Copy Endpoint of "{0}"', service.name),
        promptSteps: [],
        executeSteps: [new CopyEndpointStep()]
    });

    await wizard.prompt();
    wizardContext.activityTitle = utils.localize('copyEndpoint', 'Copy Endpoint of "{0}"', wizardContext.serviceName);
    await wizard.execute();
}
