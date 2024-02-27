/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { KnownAggregationTypeEnum } from "@azure/arm-monitor";
import { type WebPubSubSkuTier } from "@azure/arm-webpubsub";
import { KnownWebPubSubSkuTier } from "@azure/arm-webpubsub";

export const SIGNALR_PROVIDER = 'Microsoft.SignalRService';
export const WEB_PUBSUB_RESOURCE_TYPE = 'WebPubSub';
export const WEB_PUBSUB_PROVIDER = `${SIGNALR_PROVIDER}/${WEB_PUBSUB_RESOURCE_TYPE}`;

export const VALID_SERVICE_NAME_DESC = "The name is invalid. It can contain only lowercase letters, numbers and hyphens.\n\
The first character must be a letter.\n\
The last character must be a letter or number.\n\
The value must be between 4 and 32 characters long."
export const VALID_SERVICE_NAME_REGEX: RegExp = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;

// Sku Tier: Free, Basic, Standard, Premium (defined in "@azure/arm-webpubsub" as `WebPubSubSkuTier` and `KnownWebPubSubSkuTier`)
// Sku Name: Free_F1, Standard_S1, Premium_P1, Premium_P2 (no definition in "@azure/arm-webpubsub")
export type WebPubSubSkuName = string;
export enum KnownWebPubSubSkuName {
    Free_F1 = "Free_F1",
    Standard_S1 = "Standard_S1",
    Premium_P1 = "Premium_P1",
    Premium_P2 = "Premium_P2"
}

export const SKU_NAME_TO_SKU_TIER: {[key in WebPubSubSkuName]: WebPubSubSkuTier} = {
    [KnownWebPubSubSkuName.Free_F1]: KnownWebPubSubSkuTier.Free,
    [KnownWebPubSubSkuName.Standard_S1]: KnownWebPubSubSkuTier.Standard,
    [KnownWebPubSubSkuName.Premium_P1]: KnownWebPubSubSkuTier.Premium,
    [KnownWebPubSubSkuName.Premium_P2]: KnownWebPubSubSkuTier.Premium,
}

export const SKU_NAME_TO_DESC: {[key in WebPubSubSkuName]: string} = {
    [KnownWebPubSubSkuName.Free_F1]: "For Individual dev/test",
    [KnownWebPubSubSkuName.Standard_S1]: "For production workloads",
    [KnownWebPubSubSkuName.Premium_P1]: "For production workloads with more supported features",
    [KnownWebPubSubSkuName.Premium_P2]: "For production workloads with more supported features and large unit support"
};

export const SKU_NAME_TO_UNIT_COUNT_LIST: {[key in WebPubSubSkuName]: number[]} = {
    [KnownWebPubSubSkuName.Free_F1]: [1],
    [KnownWebPubSubSkuName.Standard_S1]: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    [KnownWebPubSubSkuName.Premium_P1]: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    [KnownWebPubSubSkuName.Premium_P2]: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
};

export const pricingLink = "https://azure.microsoft.com/pricing/details/web-pubsub/";


export const METRIC_AGGREGATION_TYPE_TO_TYPE_ID: { [key: string]: number } = {
    [KnownAggregationTypeEnum.Total]: 1,
    [KnownAggregationTypeEnum.Minimum]: 2,
    [KnownAggregationTypeEnum.Maximum]: 3,
    [KnownAggregationTypeEnum.Average]: 4,
    [KnownAggregationTypeEnum.Count]: 5
};
export const MINUTE_MILLISECONDS = 60 * 1000;
export const HOUR_MILLISECONDS = 60 * MINUTE_MILLISECONDS;
export const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;