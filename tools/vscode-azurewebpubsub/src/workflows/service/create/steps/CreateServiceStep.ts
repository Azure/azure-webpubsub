/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { AzureWizardExecuteStep, nonNullProp } from "@microsoft/vscode-azext-utils";
import { Progress } from "vscode";
import { localize } from "../../../../utils";
import { ICreateServiceContext } from "../ICreateServiceContext";


export class CreateServiceStep extends AzureWizardExecuteStep<ICreateServiceContext> {
    public priority: number = 135;

    constructor(private readonly client: WebPubSubManagementClient) { super(); }

    public async execute(context: ICreateServiceContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        if (!(context.Sku?.sku) || !(context.resourceGroup?.name) || !(context.location)) {
            throw new Error(`Invalid ICreateServiceContext, Sku, Sku = ${context.Sku}, resourceGroup = ${context.resourceGroup}, location = ${context.location}`);
        }
        
        const message: string = localize('creatingNewWebPubSub', 'Creating new resource "{0}", please wait...', context.webPubSubName);
        progress.report({ message });
        const response = await this.client.webPubSub.beginCreateOrUpdateAndWait(
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
