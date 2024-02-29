/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import  { type ServiceItem } from "../../../tree/service/ServiceItem";
import * as utils from "../../../utils";
import { CopyConnectionStringStep } from "./CopyConnectionStringStep";
import { pickService } from "../../../tree/service/pickService";
import { createActivityContext, localize } from "../../../utils";
import  { type IPickKeyContext, type IPickServiceContext } from "../../common/contexts";
import { GetKeyTypeStep } from "../../common/getKeyTypeStep";

export async function copyConnectionString(context: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service} = node ?? await pickService(context, {
        title: localize('copyConnectionString', 'Copy Connection String'),
    });

    const wizardContext: IPickKeyContext = {
        ...context,
        ...await createActivityContext(),
        subscription: createSubscriptionContext(subscription),
        serviceName: service.name,
        resourceGroupName: service.resourceGroup
    };

    const wizard: AzureWizard<IPickServiceContext> = new AzureWizard(wizardContext, {
        title: localize('copyConnectionString', 'Copy connection string of "{0}"', service.name),
        promptSteps: [new GetKeyTypeStep()],
        executeSteps: [new CopyConnectionStringStep()]
    });

    await wizard.prompt();
    wizardContext.activityTitle = utils.localize('copyTypedConnectionString', 'Copy {0} connection string of "{1}"', wizardContext.keyType, wizardContext.serviceName);
    await wizard.execute();
}

