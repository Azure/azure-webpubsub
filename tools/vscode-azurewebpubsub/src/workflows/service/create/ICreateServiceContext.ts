/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { Sku } from "@azure/arm-webpubsub";
import { IResourceGroupWizardContext } from '@microsoft/vscode-azext-azureutils';
import { ExecuteActivityContext } from "@microsoft/vscode-azext-utils";


export interface ICreateServiceContext extends IResourceGroupWizardContext, ExecuteActivityContext {
    webPubSubName?: string;
    Sku?: Sku;
    location?: string;
    kind?: string;
}
