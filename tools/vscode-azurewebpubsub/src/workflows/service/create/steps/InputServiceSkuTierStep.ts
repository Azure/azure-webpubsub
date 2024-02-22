/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { KnownWebPubSubSkuTier, WebPubSubSkuTier } from "@azure/arm-webpubsub";
import { AzureWizardPromptStep, IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../../utils";
import { ICreateServiceContext } from "../ICreateServiceContext";
import { getSkuTierFromSkuName, pricingLink } from "../../../../constants";


const skuTierPickItems: IAzureQuickPickItem<WebPubSubSkuTier>[] = [
    { label: "Premium", data: KnownWebPubSubSkuTier.Premium },
    { label: "Standard", data: KnownWebPubSubSkuTier.Standard },
    { label: "Free", data: KnownWebPubSubSkuTier.Free }
];

export class InputServiceSkuTierStep extends AzureWizardPromptStep<ICreateServiceContext> {
    public async prompt(context: ICreateServiceContext): Promise<void> {
        if (!(context.Sku?.sku)) {
            throw new Error(`Invalid ICreateServiceContext, context.Sku = ${context.Sku}, context.Sku.sku = ${context.Sku?.sku}`);
        }
        const chosenItem = await context.ui.showQuickPick(skuTierPickItems, {
            placeHolder: localize("tier", `Select price tier for Web PubSub, Click "?" in the top right corner to learn more`),
            learnMoreLink: pricingLink,
            suppressPersistence: true,
        });
        context.Sku.sku.name = getSkuTierFromSkuName(chosenItem.data);
        context.Sku.sku.tier = chosenItem.data;
    }

    public shouldPrompt(_context: ICreateServiceContext): boolean { return true; }
}
