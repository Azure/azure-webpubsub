/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { KnownWebPubSubSkuTier } from "@azure/arm-webpubsub";
import { AzureWizardPromptStep, IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { pricingLink, SKU_TIER_TO_UNIT_COUNT_LIST } from "../../../../constants";
import { localize } from "../../../../utils";
import { ICreateServiceContext } from "../ICreateServiceContext";


export class InputSerivceSkuUnitCountStep extends AzureWizardPromptStep<ICreateServiceContext> {
    public async prompt(context: ICreateServiceContext): Promise<void> {
        if (!(context.Sku?.sku)) {
            throw new Error("Invalid context or sku");
        }

        var picks: IAzureQuickPickItem<number>[] = [];
        const tier: string | undefined = context.Sku.sku.tier
        switch (tier) {
            case KnownWebPubSubSkuTier.Free:
            case KnownWebPubSubSkuTier.Basic:
            case KnownWebPubSubSkuTier.Standard:
            case KnownWebPubSubSkuTier.Premium:
                SKU_TIER_TO_UNIT_COUNT_LIST[tier].forEach(element => { picks.push({ label: `Unit ${element}`, data: element }); });
                break;
            default:
                throw new Error(`Invalid Sku Tier ${tier}`);
        }

        context.Sku.sku.capacity = (await context.ui.showQuickPick(picks, {
            placeHolder: localize("selectUnitCount", `Select the unit count for your service. Click "?" in the top right corner to learn more`),
            suppressPersistence: true,
            learnMoreLink: pricingLink
        })).data;
    }

    public shouldPrompt(_context: ICreateServiceContext): boolean { return true; }
}
