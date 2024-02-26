/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line @typescript-eslint/naming-convention
import  { type Sku } from "@azure/arm-webpubsub";
import  { type IResourceGroupWizardContext } from '@microsoft/vscode-azext-azureutils';
import  { type ExecuteActivityContext } from "@microsoft/vscode-azext-utils";


export interface ICreateServiceContext extends IResourceGroupWizardContext, ExecuteActivityContext {
    webPubSubName?: string;
    Sku?: Sku;
    location?: string;
    kind?: string;
}
