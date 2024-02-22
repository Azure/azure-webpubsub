/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ResourceSku, WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { LocationListStep, ResourceGroupListStep, VerifyProvidersStep, createAzureClient } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, IActionContext, createSubscriptionContext, nonNullProp, subscriptionExperience } from "@microsoft/vscode-azext-utils";
import { AzureSubscription } from "@microsoft/vscode-azureresources-api";
import * as vscode from "vscode";
import { signalrProvider, webPubSubProvider, webPubSubResourceType } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { CreateServiceStep } from "./steps/CreateServiceStep";
import { ICreateServiceContext } from "./ICreateServiceContext";
import { InputSerivceSkuUnitCountStep } from "./steps/InputSerivceSkuUnitCountStep";
import { InputServiceKindStep } from "./steps/InputServiceKindStep";
import { InputServiceNameStep } from "./steps/InputServiceNameStep";
import { InputServiceSkuTierStep } from "./steps/InputServiceSkuTierStep";
import { createActivityContext } from "../../../utils";
import { localize } from "../../../utils";


export async function createService(context: IActionContext, node?: { subscription: AzureSubscription; }): Promise<void> {
    const subscription = node?.subscription ?? await subscriptionExperience(context, ext.rgApiV2.resources.azureResourceTreeDataProvider);

    const wizardContext: ICreateServiceContext = {
        ...context,
        ...createSubscriptionContext(subscription),
        ...(await createActivityContext()),
        Sku: { 
            sku: { name: "", tier: "", capacity: 0 } as ResourceSku 
        },
    };

    const subContext = createSubscriptionContext(subscription);
    const client: WebPubSubManagementClient = createAzureClient([context, subContext], WebPubSubManagementClient);
    
    // Have to do so in order to make user select service kind before selecting location
    await (new InputServiceKindStep().prompt(wizardContext));
    var promptSteps: AzureWizardPromptStep<ICreateServiceContext>[] = [];

    // Known Issue: several locations are still absent in the list comparing with azure portal
    LocationListStep.addProviderForFiltering(wizardContext, signalrProvider, webPubSubResourceType);
    LocationListStep.addStep(wizardContext, promptSteps);
    
    promptSteps = promptSteps.concat([
        new ResourceGroupListStep(),
        new InputServiceNameStep(client),
        new InputServiceSkuTierStep(),
        new InputSerivceSkuUnitCountStep(),
    ]);
    const executeSteps: AzureWizardExecuteStep<ICreateServiceContext>[] = [
        new VerifyProvidersStep([webPubSubProvider]),
        new CreateServiceStep(client),
    ];
    const wizard: AzureWizard<ICreateServiceContext> = new AzureWizard(wizardContext, {
        title: localize('createService', "Create Web PubSub"),
        promptSteps,
        executeSteps,
        showLoadingPrompt: true
    });

    
    await wizard.prompt();
    wizardContext.location = (await LocationListStep.getLocation(wizardContext, signalrProvider)).name ?? wizardContext.resourceGroup!.location;
    wizardContext.activityTitle = localize('createServiceWithName', 'Create Web PubSub "{0}"', wizardContext.webPubSubName);
    await wizard.execute();
    
    vscode.window.showInformationMessage(localize('createdService', 'Successfully created Web PubSub "{0}"', wizardContext.webPubSubName));

    ext.branchDataProvider.refresh();
}
