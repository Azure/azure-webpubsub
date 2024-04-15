/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import * as utils from "../../../utils";
import { pickService } from "../../../tree/service/pickService";
import { createActivityContext, localize } from "../../../utils";
import { type IUpdateServiceContext } from "../../common/contexts";
import { InputServiceSkuNameStep } from "../create/steps/InputServiceSkuNameStep";
import { UpdateServiceStep } from "../../common/UpdateServiceStep";
import { ext } from "../../../extensionVariables";

export async function scaleUp(context: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service } = node ?? await pickService(context, {
        title: localize('scaleUp', 'Scale Up'),
    });

    const wizardContext: IUpdateServiceContext = {
        ...context,
        ...await createActivityContext(),
        subscription: createSubscriptionContext(subscription),
        serviceName: service.name,
        resourceGroupName: service.resourceGroup,
        resource: service
    };

    const previousSkuName = service.sku?.name;
    if (!previousSkuName) {
        throw new Error(localize('noSkuName', 'Failed to get sku name of the service.'));
    }

    const wizard: AzureWizard<IUpdateServiceContext> = new AzureWizard(wizardContext, {
        title: localize('scaleUpWithName', 'Scale up "{0}"', service.name),
        promptSteps: [new InputServiceSkuNameStep([previousSkuName])],
        executeSteps: [new UpdateServiceStep()]
    });

    await wizard.prompt();
    wizardContext.activityTitle = utils.localize('scaleUpWithDetail', 'Scale up {0} from {1} to {2}', wizardContext.serviceName, previousSkuName, wizardContext.resource.sku?.name);
    await wizard.execute();
    ext.branchDataProvider.refresh();
}
