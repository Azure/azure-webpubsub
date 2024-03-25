/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type WebPubSubHubProperties} from "@azure/arm-webpubsub";
import { type WebPubSubResource } from "@azure/arm-webpubsub";
import { type KeyType } from "@azure/arm-webpubsub";
import { type EventListener } from "@azure/arm-webpubsub";
import { type EventHandler } from "@azure/arm-webpubsub";
import { type AggregationType } from "@azure/arm-monitor";
import { type ExecuteActivityContext, type IActionContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";

export interface IPickServiceContext extends IActionContext, ExecuteActivityContext {
    subscription?: ISubscriptionContext;
    resourceGroupName?: string;
    serviceName?: string;
}

export interface IPickHubSettingContext extends IPickServiceContext {
    hubName?: string;
}

export interface IPickEventHandlerContext extends IPickHubSettingContext {
    eventHandler?: EventHandler;
}

export interface IPickEventListenerContext extends IPickHubSettingContext {
    eventListener?: EventListener;
}

export interface IPickKeyContext extends IPickServiceContext {
    keyType?: KeyType;
}

export interface ICreateOrUpdateHubSettingContext extends IPickHubSettingContext {
    hubProperties?: WebPubSubHubProperties;
}

export interface IUpdateServiceContext extends IPickServiceContext {
    resource: WebPubSubResource;
}

export interface ICreateOrUpdateHubSettingContext extends IPickHubSettingContext {
    hubProperties?: WebPubSubHubProperties;
}

export type MetricName = string;
export enum KnownMetricNameEnum {
    ServerLoad = "ServerLoad",
    InboundTraffic = "InboundTraffic",
    OutboundTraffic = "OutboundTraffic",
    ConnectionQuotaUtilization = "ConnectionQuotaUtilization",
    ConnectionCount = "ConnectionCount",
    ConnectionOpenCount = "ConnectionOpenCount",
    ConnectionCloseCount = "ConnectionCloseCount",
}

export interface IPickMetricsContext extends IPickServiceContext {
    startTime?: Date;
    endTime?: Date;
    metricName?: MetricName;
    aggregationType?: AggregationType;
}
