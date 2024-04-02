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
import { UpdateServiceStep } from "../../common/UpdateServiceStep";
import { InputSerivceSkuUnitCountStep } from "../create/steps/InputSerivceSkuUnitCountStep";
import * as vscode from "vscode";
import { createPortalUri } from "@microsoft/vscode-azext-azureutils";
import { KnownWebPubSubSkuTier } from "@azure/arm-webpubsub";
import { ext } from "../../../extensionVariables";

export async function scaleOut(context: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service } = node ?? await pickService(context, {
        title: localize('scaleOut', 'Scale Out'),
    });

    const wizardContext: IUpdateServiceContext = {
        ...context,
        ...await createActivityContext(),
        subscription: createSubscriptionContext(subscription),
        serviceName: service.name,
        resourceGroupName: service.resourceGroup,
        resource: service
    };

    const previousUnitCount = service.sku?.capacity;

    const wizard: AzureWizard<IUpdateServiceContext> = new AzureWizard(wizardContext, {
        title: localize('scaleOutWithName', 'Scale out "{0}"', service.name),
        promptSteps: [new InputSerivceSkuUnitCountStep()],
        executeSteps: [new UpdateServiceStep()]
    });

    // Autoscale is premium only and not supported in extension.
    if (service.sku?.tier === KnownWebPubSubSkuTier.Premium) {
        /* eslint-disable */
        vscode.window.showInformationMessage(
            localize("notifyAutoScale", "Configuring autoscale is only supported in Azure Portal."),
            ...["Configure Autoscale In Azure Portal", "Ignore"]
        ).then(async (choice) => {
            if (choice === "Ignore") return;
            const scaleOutPortalUri = decodeURIComponent(createPortalUri(subscription, service.id).toString()) + "/scaleout";
            vscode.env.openExternal(scaleOutPortalUri as any);
        })
        /* eslint-enable */
    }
    await wizard.prompt();
    wizardContext.activityTitle = utils.localize('scaleOutWithDetail', 'Scale out {0} from Unit {1} to Unit {2}', wizardContext.serviceName, previousUnitCount, wizardContext.resource.sku?.capacity);
    await wizard.execute();
    ext.branchDataProvider.refresh();
}
