/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type IActionContext, type TreeElementBase} from "@microsoft/vscode-azext-utils";
import { createContextValue, createGenericElement, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { type AzureResourceModel, type AzureSubscription, type ViewPropertiesModel } from '@microsoft/vscode-azureresources-api';
import * as vscode from 'vscode';
import { createWebPubSubAPIClient, localize } from '../../utils';
import { type ServiceItem } from "../service/ServiceItem";
import { EventHandlersItem } from "./EventHandlers/EventHandlersItem";
import { EventListenersItem } from "./EventListeners/EventListenersItem";
import { type HubSettingModel} from "./HubSettingModel";
import { createHubModel } from "./HubSettingModel";

export class HubSettingItem implements AzureResourceModel {
    static readonly contextValue: string = 'webPubSubHubSettingItem';
    static readonly contextValueRegExp: RegExp = new RegExp(HubSettingItem.contextValue);

    constructor(public readonly service: ServiceItem, public readonly hub: HubSettingModel) { }

    private get contextValue(): string {
        return createContextValue([
            HubSettingItem.contextValue,
            nonNullValueAndProp(this.hub, 'hubName')
        ]);
    }

    async getChildren(): Promise<TreeElementBase[]> {
        const isAllowAnnoy: boolean = this.hub.properties.anonymousConnectPolicy === "allow";
        const element = createGenericElement({
            label: localize('annoymousConnectPolicy', "{0} Annoymous Clients", isAllowAnnoy ? "Allow" : "Deny"),
            contextValue: "hubAllowAnnoymousClients",
            iconPath: new vscode.ThemeIcon(isAllowAnnoy ? "workspace-unknown" : "workspace-trusted"),
        })
        return [
            element,
            new EventHandlersItem(this.hub.properties.eventHandlers ?? [], this),
            new EventListenersItem(this.hub.properties.eventListeners ?? [])
        ];
    }

    getTreeItem(): vscode.TreeItem {
        return {
            id: this.hub.id,
            label: localize("hubWithName", "Hub {0}", this.hub.hubName),
            iconPath: new vscode.ThemeIcon("inbox"),
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
    }

    static async get(context: IActionContext, subscription: AzureSubscription, resourceGroup: string, resourceName: string, webPubSubHubName: string): Promise<HubSettingModel> {
        const client = await createWebPubSubAPIClient(context, subscription);
        return createHubModel(await client.webPubSubHubs.get(webPubSubHubName, resourceGroup, resourceName));
    }

    viewProperties: ViewPropertiesModel = {
        data: this.hub,
        label: `${this.hub.hubName}`,
    };
}
