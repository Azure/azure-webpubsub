/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { KnownServiceKind, ResourceSku, WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { LocationListStep, ResourceGroupListStep, VerifyProvidersStep, createAzureClient } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, IActionContext, createSubscriptionContext, nonNullProp, subscriptionExperience } from "@microsoft/vscode-azext-utils";
import { AzureSubscription } from "@microsoft/vscode-azureresources-api";
import * as vscode from "vscode";
import { SIGNALR_PROVIDER, WEB_PUBSUB_PROVIDER, WEB_PUBSUB_RESOURCE_TYPE } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { CreateServiceStep } from "./steps/CreateServiceStep";
import { ICreateServiceContext } from "./ICreateServiceContext";
import { InputSerivceSkuUnitCountStep } from "./steps/InputSerivceSkuUnitCountStep";
import { InputServiceNameStep } from "./steps/InputServiceNameStep";
import { InputServiceSkuTierStep } from "./steps/InputServiceSkuTierStep";
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
        kind: isSocketIO ? KnownServiceKind.SocketIO : KnownServiceKind.WebPubSub,
        Sku: { 
            sku: { name: "", tier: "", capacity: 0 } as ResourceSku 
        },
    };

    const subContext = createSubscriptionContext(subscription);
    const client: WebPubSubManagementClient = createAzureClient([context, subContext], WebPubSubManagementClient);
    
    var promptSteps: AzureWizardPromptStep<ICreateServiceContext>[] = [];

    LocationListStep.addProviderForFiltering(wizardContext, SIGNALR_PROVIDER, WEB_PUBSUB_RESOURCE_TYPE);
    LocationListStep.addStep(wizardContext, promptSteps);
    
    promptSteps = promptSteps.concat([
        new ResourceGroupListStep(),
        new InputServiceNameStep(client),
        new InputServiceSkuTierStep(),
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
    wizardContext.location = (await LocationListStep.getLocation(wizardContext, SIGNALR_PROVIDER)).name ?? wizardContext.resourceGroup!.location;
    wizardContext.activityTitle = localize('createServiceWithName', 'Create Web PubSub "{0}"', wizardContext.webPubSubName);
    await wizard.execute();
    
    vscode.window.showInformationMessage(localize('createdService', 'Successfully created Web PubSub "{0}"', wizardContext.webPubSubName));

    ext.branchDataProvider.refresh();
}
