/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import  { type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../../utils";
import  { type ICreateServiceContext } from "../ICreateServiceContext";
import  { type WebPubSubSkuName} from "../../../../constants";
import { KnownWebPubSubSkuName, SKU_NAME_TO_SKU_TIER, SKU_NAME_TO_DESC, pricingLink } from "../../../../constants";

const skuNamePickItems: IAzureQuickPickItem<WebPubSubSkuName>[] = [
    { label: KnownWebPubSubSkuName.Premium_P1, data: KnownWebPubSubSkuName.Premium_P1, description: SKU_NAME_TO_DESC[KnownWebPubSubSkuName.Premium_P1] },
    { label: KnownWebPubSubSkuName.Premium_P2, data: KnownWebPubSubSkuName.Premium_P2, description: SKU_NAME_TO_DESC[KnownWebPubSubSkuName.Premium_P2] },
    { label: KnownWebPubSubSkuName.Standard_S1, data: KnownWebPubSubSkuName.Standard_S1, description: SKU_NAME_TO_DESC[KnownWebPubSubSkuName.Standard_S1] },
    { label: KnownWebPubSubSkuName.Free_F1, data: KnownWebPubSubSkuName.Free_F1, description: SKU_NAME_TO_DESC[KnownWebPubSubSkuName.Free_F1] },
];

export class InputServiceSkuNameStep extends AzureWizardPromptStep<ICreateServiceContext> {
    public async prompt(context: ICreateServiceContext): Promise<void> {
        if (!(context.Sku?.sku)) {
            throw new Error(`Invalid ICreateServiceContext, context.Sku = ${context.Sku}, context.Sku.sku = ${context.Sku?.sku}`);
        }
        const chosenItem = await context.ui.showQuickPick(skuNamePickItems, {
            placeHolder: localize("tier", `Select pricing tier for Web PubSub, Click "?" in the top right corner to learn more`),
            learnMoreLink: pricingLink,
            suppressPersistence: true,
        });
        context.Sku.sku.name = chosenItem.data;
        context.Sku.sku.tier = SKU_NAME_TO_SKU_TIER[chosenItem.data];
    }

    public shouldPrompt(_context: ICreateServiceContext): boolean { return true; }
}
