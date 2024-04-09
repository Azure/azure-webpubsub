/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../../utils";
import { type ICreateServiceContext } from "../ICreateServiceContext";
import { type WebPubSubSkuName} from "../../../../constants";
import { KnownWebPubSubSkuName, SKU_NAME_TO_SKU_TIER, SKU_NAME_TO_DESC, pricingLink } from "../../../../constants";
import { type IUpdateServiceContext } from "../../../common/contexts";

const skuNamePickItems: IAzureQuickPickItem<WebPubSubSkuName>[] = [
    { label: KnownWebPubSubSkuName.Premium_P1, data: KnownWebPubSubSkuName.Premium_P1, description: SKU_NAME_TO_DESC[KnownWebPubSubSkuName.Premium_P1] },
    { label: KnownWebPubSubSkuName.Premium_P2, data: KnownWebPubSubSkuName.Premium_P2, description: SKU_NAME_TO_DESC[KnownWebPubSubSkuName.Premium_P2] },
    { label: KnownWebPubSubSkuName.Standard_S1, data: KnownWebPubSubSkuName.Standard_S1, description: SKU_NAME_TO_DESC[KnownWebPubSubSkuName.Standard_S1] },
    { label: KnownWebPubSubSkuName.Free_F1, data: KnownWebPubSubSkuName.Free_F1, description: SKU_NAME_TO_DESC[KnownWebPubSubSkuName.Free_F1] },
];

export class InputServiceSkuNameStep extends AzureWizardPromptStep<ICreateServiceContext | IUpdateServiceContext> {
    public constructor(public readonly excludedSkuNames: WebPubSubSkuName[] = []) { super(); }

    public async prompt(context: ICreateServiceContext | IUpdateServiceContext): Promise<void> {
        if (!context.resource) throw new Error(localize("notFoundResourceInContext", "Cannot find resource in context"));
        if (!context.resource.sku) throw new Error(localize("notFoundResourceSkuInResource", "Cannot find resource.sku in context"));
        const chosenItem = await context.ui.showQuickPick(skuNamePickItems.filter(item => this.excludedSkuNames.indexOf(item.data) === -1), {
            placeHolder: localize("tier", `Select pricing tier for Web PubSub, Click "?" in the top right corner to learn more`),
            learnMoreLink: pricingLink,
            suppressPersistence: true,
        });
        context.resource.sku.name = chosenItem.data;
        context.resource.sku.tier = SKU_NAME_TO_SKU_TIER[chosenItem.data];
    }

    public shouldPrompt(_context: ICreateServiceContext): boolean { return true; }
}
