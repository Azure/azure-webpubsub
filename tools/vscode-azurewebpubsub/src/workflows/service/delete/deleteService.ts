/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../extensionVariables";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import { createActivityContext, localize } from "../../../utils";
import { DeleteServiceConfirmStep } from "./DeleteServiceConfirmStep";
import { DeleteServiceStep } from "./DeleteServiceStep";
import { pickService } from "../../../tree/service/pickService";
import { type IPickServiceContext } from "../../common/contexts";

export async function deleteService(context: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service } = node ?? await pickService(context, { title: localize('deleteWebPubSub', 'Delete Web PubSub Resource')} );

    const wizardContext: IPickServiceContext = {
        ...context,
        ...await createActivityContext(),
        subscription: createSubscriptionContext(subscription),
        resourceGroupName: service.resourceGroup,
        serviceName: service.name
    };

    const wizard: AzureWizard<IPickServiceContext> = new AzureWizard(wizardContext, {
        title: localize('deleteWebPubSub', 'Delete Web PubSub Resource "{0}"', service.name),
        promptSteps: [new DeleteServiceConfirmStep()],
        executeSteps: [new DeleteServiceStep()]
    });

    await wizard.prompt();

    await ext.state.showDeleting(service.id, async () => {
        await wizard.execute();
    });

    ext.branchDataProvider.refresh();
}
