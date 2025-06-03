/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { pricingLink, SKU_NAME_TO_UNIT_COUNT_LIST } from "../../../../constants";
import { localize } from "../../../../utils";
import { type ICreateServiceContext } from "../ICreateServiceContext";
import { type IUpdateServiceContext } from "../../../common/contexts";

export class InputSerivceSkuUnitCountStep extends AzureWizardPromptStep<ICreateServiceContext | IUpdateServiceContext> {
    public constructor(public readonly excludedUnitCounts: number[] = []) { super(); }

    public async prompt(context: ICreateServiceContext | IUpdateServiceContext): Promise<void> {
        if (!context.resource?.sku?.name) {
            throw new Error(localize("invalidResourceInContext", "Invalid resource in context, resource = {0}", context.resource.toString()));
        }

        const picks: IAzureQuickPickItem<number>[] = [];
        const skuName = context.resource.sku.name;
        SKU_NAME_TO_UNIT_COUNT_LIST[skuName].forEach((element:number) => { picks.push({ label: `Unit ${element}`, data: element }); });

        // selection prompt will be skipped if there is only one choice
        context.resource.sku.capacity = (await context.ui.showQuickPick(picks.filter(item => this.excludedUnitCounts.indexOf(item.data) === -1) , {
            placeHolder: localize("selectUnitCount", `Select the unit count for your service. Click "?" in the top right corner to learn more`),
            suppressPersistence: true,
            learnMoreLink: pricingLink,
        })).data;
    }

    public shouldPrompt(_context: ICreateServiceContext): boolean { return true; }
}
