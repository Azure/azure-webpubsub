/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import  { KnownWebPubSubSkuTier, type WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { AzureWizardExecuteStep, nonNullProp } from "@microsoft/vscode-azext-utils";
import  { type Progress } from "vscode";
import { localize } from "../../../../utils";
import  { type ICreateServiceContext } from "../ICreateServiceContext";
import { KnownWebPubSubSkuName } from "../../../../constants";

export class CreateServiceStep extends AzureWizardExecuteStep<ICreateServiceContext> {
    public priority: number = 135;

    constructor(private readonly client: WebPubSubManagementClient) { super(); }

    public async execute(context: ICreateServiceContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        if (!(context.resourceGroup?.name) || !(context.location)) {
            throw new Error(`Invalid ICreateServiceContext, resourceGroup = ${context.resourceGroup}, location = ${context.location}`);
        }
        if (!(context.Sku?.sku)) {
            context.Sku = { sku: { name: KnownWebPubSubSkuName.Standard_S1, tier: KnownWebPubSubSkuTier.Standard, capacity: 1 }};
        }

        const message: string = localize('creatingNewWebPubSub', 'Creating new Web PubSub resource "{0}", please wait...', context.webPubSubName);
        progress.report({ message });
        await this.client.webPubSub.beginCreateOrUpdateAndWait(
            context.resourceGroup.name,
            nonNullProp(context, 'webPubSubName'),
            {
                sku: context.Sku.sku,
                kind: context.kind,
                location: context.location
            }
        );
    }

    public shouldExecute(_context: ICreateServiceContext): boolean { return true; }
}
