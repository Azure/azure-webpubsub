/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

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
export enum KnownSystemEvents { "connect" = "connect", "connected" = "connected", "disconnected" = "disconnected", }
export enum KnownUserEvents { "None" = "None", "All" = "All", "Specify" = "Specify" }
export const eventHandlerSystemEvents = [KnownSystemEvents.connect, KnownSystemEvents.connected, KnownSystemEvents.disconnected];
export const eventHandlerUserEvents = [KnownUserEvents.None, KnownUserEvents.All, KnownUserEvents.Specify];
export const VALID_HUB_NAME_DESC = "The name is invalid.\n\
The first character must be a letter.\n\
The ther characters must be a letter, number, or one of {'_', ',', '.', '/', '\`'}\n\
The value must be between 1 and 127 characters long."
export const VALID_HUB_NAME_REGEX: RegExp = /^[A-Za-z][A-Za-z0-9_`,.[/\]]{0,127}$/;

export const LIVE_TRACE_HELP_LINK = "https://learn.microsoft.com/azure/azure-web-pubsub/howto-troubleshoot-resource-logs#launch-the-live-trace-tool";