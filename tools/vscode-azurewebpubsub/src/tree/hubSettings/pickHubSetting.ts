/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ContextValueQuickPickStep, runQuickPickWizard, type AzureResourceQuickPickWizardContext, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { localize } from "../../utils";
import  { type PickItemOptions } from "../utils";
import { getPickServiceSteps } from "../service/pickService";
import { HubSettingItem } from "./HubSettingItem";

export async function pickHub(context: IActionContext, options?: PickItemOptions): Promise<HubSettingItem> {
    return await runQuickPickWizard(context,
        {
            promptSteps: getPickHubSteps(),
            title: options?.title,
            showLoadingPrompt: options?.showLoadingPrompt
        });
}

export function getPickHubSteps(): AzureWizardPromptStep<AzureResourceQuickPickWizardContext>[] {
    return [
        ...getPickServiceSteps(),
        new ContextValueQuickPickStep(
            ext.branchDataProvider,
            {
                contextValueFilter: { include: [HubSettingItem.contextValueRegExp] },
                skipIfOne: true,
            },
            {
                placeHolder: localize('selectHub', 'Select a hub setting'),
                noPicksMessage: localize('noHub', 'Current Web PubSub serivce has no hub setting configured'),
            }
        )
    ];
}
