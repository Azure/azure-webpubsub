/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ContextValueQuickPickStep, runQuickPickWizard, type AzureResourceQuickPickWizardContext, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../utils";
import { getPickHubSettingSteps } from "../pickHubSetting";
import { type PickItemOptions } from "../../utils";
import { EventHandlerItem } from "./EventHandlerItem";
import { EventHandlersItem } from "./EventHandlersItem";

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
        ...getPickHubSettingSteps(),
        new ContextValueQuickPickStep(
            ext.branchDataProvider,
            {
                contextValueFilter: { include: EventHandlersItem.contextValueRegExp },
                skipIfOne: true,
            }
        ),
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
