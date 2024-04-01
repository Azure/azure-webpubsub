/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import { createActivityContext, localize } from "../../../utils";
import { RestartWebPubSubConfirmationStep } from "./RestartServiceConfirmationStep";
import { RestartWebPubSubStep } from "./RestartServiceStep";
import { pickService } from "../../../tree/service/pickService";
import { type IPickServiceContext } from "../../common/contexts";

export async function restartService(context: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service } = node ?? await pickService(context, {
        title: localize('restartingService', 'Restart Web PubSub'),
    });

    const wizardContext: IPickServiceContext = {
        ...context,
        ...await createActivityContext(),
        subscription: createSubscriptionContext(subscription),
        resourceGroupName: service.resourceGroup,
        serviceName: service.name
    };

    const wizard: AzureWizard<IPickServiceContext> = new AzureWizard(wizardContext, {
        title: localize('restartServiceWithName', 'Restart Web PubSub "{0}"', service.name),
        promptSteps: [new RestartWebPubSubConfirmationStep()],
        executeSteps: [new RestartWebPubSubStep()]
    });

    await wizard.prompt();
    await wizard.execute();
}
