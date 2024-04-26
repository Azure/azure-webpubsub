/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type ResourceSku} from "@azure/arm-webpubsub";
import { KnownServiceKind, WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { LocationListStep, ResourceGroupListStep, VerifyProvidersStep, createAzureClient } from "@microsoft/vscode-azext-azureutils";
import { type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext} from "@microsoft/vscode-azext-utils";
import { AzureWizard, createSubscriptionContext, subscriptionExperience } from "@microsoft/vscode-azext-utils";
import { AzExtResourceType, type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import * as vscode from "vscode";
import { SIGNALR_PROVIDER, WEB_PUBSUB_PROVIDER } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { CreateServiceStep } from "./steps/CreateServiceStep";
import { type ICreateServiceContext } from "./ICreateServiceContext";
import { InputSerivceSkuUnitCountStep } from "./steps/InputSerivceSkuUnitCountStep";
import { InputServiceNameStep } from "./steps/InputServiceNameStep";
import { InputServiceSkuNameStep } from "./steps/InputServiceSkuNameStep";
import { createActivityContext } from "../../../utils";
import { localize } from "../../../utils";

export async function createServiceForClassical(context: IActionContext, node?: { subscription: AzureSubscription; }): Promise<void> {
    await createService(false, context, node);
}

export async function createServiceForSocketIO(context: IActionContext, node?: { subscription: AzureSubscription; }): Promise<void> {
    await createService(true, context, node);
}

async function createService(isSocketIO: boolean, context: IActionContext, node?: { subscription: AzureSubscription; }): Promise<void> {
    const subscription = node?.subscription ?? await subscriptionExperience(context, ext.rgApiV2.resources.azureResourceTreeDataProvider);

    const wizardContext: ICreateServiceContext = {
        ...context,
        ...createSubscriptionContext(subscription),
        ...(await createActivityContext()),
        resource: {
            location: "",
            kind: isSocketIO ? KnownServiceKind.SocketIO : KnownServiceKind.WebPubSub,
            sku: { name: "", tier: "", capacity: 0 } as ResourceSku 
        }
    };

    const subContext = createSubscriptionContext(subscription);
    const client: WebPubSubManagementClient = createAzureClient([context, subContext], WebPubSubManagementClient);
    
    let promptSteps: AzureWizardPromptStep<ICreateServiceContext>[] = [];

    LocationListStep.addProviderForFiltering(wizardContext, SIGNALR_PROVIDER, AzExtResourceType.WebPubSub);
    LocationListStep.addStep(wizardContext, promptSteps);
    
    promptSteps = promptSteps.concat([
        new ResourceGroupListStep(),
        new InputServiceNameStep(client),
        new InputServiceSkuNameStep(),
        new InputSerivceSkuUnitCountStep(),
    ]);
    const executeSteps: AzureWizardExecuteStep<ICreateServiceContext>[] = [
        new VerifyProvidersStep([WEB_PUBSUB_PROVIDER]),
        new CreateServiceStep(client),
    ];
    const wizard: AzureWizard<ICreateServiceContext> = new AzureWizard(wizardContext, {
        title: localize('createServiceWithType', "Create Web PubSub{0}", isSocketIO ? " For Socket.IO" : ""),
        promptSteps,
        executeSteps,
        showLoadingPrompt: true
    });

    
    await wizard.prompt();
    if (!wizardContext.resourceGroup) {
        throw new Error('No resource group was provided.');
    }
    wizardContext.resource.location = (await LocationListStep.getLocation(wizardContext, SIGNALR_PROVIDER)).name ?? wizardContext.resourceGroup.location;
    wizardContext.activityTitle = localize('createServiceWithName', 'Create Web PubSub "{0}"', wizardContext.webPubSubName);
    await wizard.execute();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    vscode.window.showInformationMessage(localize('createdService', 'Successfully created Web PubSub "{0}"', wizardContext.webPubSubName));

    ext.branchDataProvider.refresh();
}
