/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ContextValueQuickPickStep, runQuickPickWizard, type AzureResourceQuickPickWizardContext, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../utils";
import { getPickHubSteps } from "../pickHubSetting";
import  { type PickItemOptions } from "../../utils";
import { EventHandlerItem } from "./EventHandlerItem";

export async function pickEventHandler(context: IActionContext, options?: PickItemOptions): Promise<EventHandlerItem> {
    return await runQuickPickWizard(context,
        {
            promptSteps: getPickEventHandlerSteps(),
            title: options?.title,
            showLoadingPrompt: options?.showLoadingPrompt
        });
}

export function getPickEventHandlerSteps(): AzureWizardPromptStep<AzureResourceQuickPickWizardContext>[] {
    return [
        ...getPickHubSteps(),
        new ContextValueQuickPickStep(
            ext.branchDataProvider,
            {
                contextValueFilter: { include: EventHandlerItem.contextValueRegExp },
                skipIfOne: false,
            },
            {
                placeHolder: localize('selectEventHandler', 'Select an event handler'),
                noPicksMessage: localize('noEventHandler', 'Current hub contains no event handler'),
            }
        )
    ];
}
