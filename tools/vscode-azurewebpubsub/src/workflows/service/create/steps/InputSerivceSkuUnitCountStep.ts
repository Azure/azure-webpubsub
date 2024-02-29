/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { pricingLink, SKU_NAME_TO_UNIT_COUNT_LIST } from "../../../../constants";
import { localize } from "../../../../utils";
import { type ICreateServiceContext } from "../ICreateServiceContext";

export class InputSerivceSkuUnitCountStep extends AzureWizardPromptStep<ICreateServiceContext> {
    public async prompt(context: ICreateServiceContext): Promise<void> {
        if (!(context.Sku?.sku)) {
            throw new Error("Invalid context or sku");
        }

        const picks: IAzureQuickPickItem<number>[] = [];
        const skuName = context.Sku.sku.name;
        SKU_NAME_TO_UNIT_COUNT_LIST[skuName].forEach((element:number) => { picks.push({ label: `Unit ${element}`, data: element }); });

        // selection prompt will be skipped if there is only one choice
        context.Sku.sku.capacity = (await context.ui.showQuickPick(picks, {
            placeHolder: localize("selectUnitCount", `Select the unit count for your service. Click "?" in the top right corner to learn more`),
            suppressPersistence: true,
            learnMoreLink: pricingLink,
        })).data;
    }

    public shouldPrompt(_context: ICreateServiceContext): boolean { return true; }
}
