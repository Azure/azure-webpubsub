/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ContextValueQuickPickStep, runQuickPickWizard, type AzureResourceQuickPickWizardContext, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../utils";
import { getPickHubSettingSteps } from "../pickHubSetting";
import { type PickItemOptions } from "../../utils";
import { EventListenerItem } from "./EventListenerItem";

export async function pickEventListener(context: IActionContext, options?: PickItemOptions): Promise<EventListenerItem> {
    return await runQuickPickWizard(context,
        {
            promptSteps: getPickEventListenerSteps(),
            title: options?.title,
            showLoadingPrompt: options?.showLoadingPrompt
        });
}

export function getPickEventListenerSteps(): AzureWizardPromptStep<AzureResourceQuickPickWizardContext>[] {
    return [
        ...getPickHubSettingSteps(),
        new ContextValueQuickPickStep(
            ext.branchDataProvider,
            {
                contextValueFilter: { include: EventListenerItem.contextValueRegExp },
                skipIfOne: false,
            },
            {
                placeHolder: localize('selectEventListener', 'Select an event listener'),
                noPicksMessage: localize('noEventListener', 'Current hub contains no event listener'),
            }
        )
    ];
}
