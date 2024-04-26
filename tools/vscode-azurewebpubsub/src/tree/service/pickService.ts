/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ContextValueQuickPickStep, QuickPickAzureSubscriptionStep, QuickPickGroupStep, runQuickPickWizard, type AzureResourceQuickPickWizardContext, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { AzExtResourceType } from "@microsoft/vscode-azureresources-api";
import { ext } from "../../extensionVariables";
import { localize } from "../../utils";
import { ServiceItem } from "../service/ServiceItem";
import { type PickItemOptions } from "../utils";

export async function pickService(context: IActionContext, options?: PickItemOptions): Promise<ServiceItem> {
    return await runQuickPickWizard(
        context, { 
            title: options?.title, 
            promptSteps: getPickServiceSteps(),
            showLoadingPrompt: options?.showLoadingPrompt 
        }
    )
}

export function getPickServiceSteps(): AzureWizardPromptStep<AzureResourceQuickPickWizardContext>[] {
    const tdp = ext.rgApiV2.resources.azureResourceTreeDataProvider;
    return [
        new QuickPickAzureSubscriptionStep(tdp),
        new QuickPickGroupStep(tdp, { groupType: [ AzExtResourceType.WebPubSub ] }),
        new ContextValueQuickPickStep(
            ext.rgApiV2.resources.azureResourceTreeDataProvider,
            {
                contextValueFilter: { include: ServiceItem.contextValueRegExp },
                skipIfOne: false, // user won't skip selection step even if there is only one choice
            },
            {
                placeHolder: localize('selectService', 'Select a Web PubSub resource'),
                noPicksMessage: localize('noServiceInSubscription', 'Current subscription has no Web PubSub resource'),
            }
        )
    ];
}
