/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type WebPubSubHub } from "@azure/arm-webpubsub";
import { getResourceGroupFromId } from "@microsoft/vscode-azext-azureutils";
import { nonNullProp } from "@microsoft/vscode-azext-utils";

export interface HubSettingModel extends WebPubSubHub {
    id: string;
    hubName: string;
    resourceGroup: string;
    webPubSubId: string;
}

export function createHubModel(serviceResource: WebPubSubHub): HubSettingModel {
    return {
        id: nonNullProp(serviceResource, 'id'),
        hubName: nonNullProp(serviceResource, 'name'),
        webPubSubId: nonNullProp(serviceResource, 'id'),
        resourceGroup: getResourceGroupFromId(nonNullProp(serviceResource, 'id')),
        ...serviceResource,
    };
}