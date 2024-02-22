/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { KnownWebPubSubSkuTier, WebPubSubSkuTier } from "@azure/arm-webpubsub";


export const SIGNALR_PROVIDER = 'Microsoft.SignalRService';
export const WEB_PUBSUB_RESOURCE_TYPE = 'WebPubSub';
export const WEB_PUBSUB_PROVIDER = `${SIGNALR_PROVIDER}/${WEB_PUBSUB_RESOURCE_TYPE}`;;

export const VALID_SERVICE_NAME_DESC = "The name is invalid. It can contain only lowercase letters, numbers and hyphens.\n\
The first character must be a letter.\n\
The last character must be a letter or number.\n\
The value must be between 4 and 32 characters long."
export const VALID_SERVICE_NAME_REGEX: RegExp = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;

export const SKU_TIER_TO_UNIT_COUNT_LIST = {
    "Free": [1],
    "Standard": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    "Premium": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
};

export const getSkuTierFromSkuName = (tier: WebPubSubSkuTier) => {
    switch (tier) {
        case KnownWebPubSubSkuTier.Free:
        case KnownWebPubSubSkuTier.Standard:
        case KnownWebPubSubSkuTier.Premium:
            return `${tier}_${tier.charAt(0)}1`; // "Free_F1", "Standard_S1", "Premium_P1";
        default: throw new Error("Invalid sku tier");
    }
};

export const pricingLink = "https://azure.microsoft.com/en-us/pricing/details/web-pubsub/";
