/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ContextValueQuickPickStep, runQuickPickWizard, type AzureResourceQuickPickWizardContext, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { localize } from "../../utils";
import  { type PickItemOptions } from "../utils";
import { getPickServiceSteps } from "../service/pickService";
import { HubSettingsItem } from "./HubSettingsItem";

export async function pickHubs(context: IActionContext, options?: PickItemOptions): Promise<HubSettingsItem> {
    return await runQuickPickWizard(context,
        {
            promptSteps: getPickHubsSteps(),
            title: options?.title,
            showLoadingPrompt: options?.showLoadingPrompt
        });
}

export function getPickHubsSteps(): AzureWizardPromptStep<AzureResourceQuickPickWizardContext>[] {
    return [
        ...getPickServiceSteps(),
        new ContextValueQuickPickStep(
            ext.branchDataProvider,
            {
                contextValueFilter: { include: HubSettingsItem.contextValueRegExp },
                skipIfOne: true,
            },
            {
                placeHolder: localize('selectHub', 'Select hubs'),
                noPicksMessage: localize('noHub', 'Current Web PubSub serivce has no hubs'),
            }
        )
    ];
}
