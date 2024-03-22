/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type IPickServiceContext } from "src/workflows/common/contexts";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import * as utils from "../../../utils";
import { createActivityContext, localize } from "../../../utils";
import { OpenLiveTraceToolStep } from "./OpenLiveTraceToolStep";
import { pickService } from "../../../tree/service/pickService";

export async function openLiveTraceTool(context: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service } = node ?? await pickService(context, { title: localize('openLiveTraceTool', 'Open LiveTrace Tool'), });

    const wizardContext: IPickServiceContext = {
        ...context,
        ...await createActivityContext(),
        subscription: createSubscriptionContext(subscription),
        serviceName: service.name,
        resourceGroupName: service.resourceGroup
    };

    const wizard: AzureWizard<IPickServiceContext> = new AzureWizard(wizardContext, {
        title: localize('openLiveTraceTool', 'Open LiveTrace Tool of "{0}"', service.name),
        executeSteps: [new OpenLiveTraceToolStep()]
    });

    await wizard.prompt();
    wizardContext.activityTitle = utils.localize('openLiveTraceTool', 'Open LiveTrace Tool of "{0}"', wizardContext.serviceName);
    await wizard.execute();
}
