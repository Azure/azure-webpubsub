/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { IActionContext, TreeElementBase, createContextValue, createGenericElement, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { AzureResourceModel, AzureSubscription, ViewPropertiesModel } from '@microsoft/vscode-azureresources-api';
import * as vscode from 'vscode';
import { createWebPubSubAPIClient, localize } from '../../utils';
import { ServiceItem } from "../service/ServiceItem";
import { EventHandlersItem } from "./EventHandlers/EventHandlersItem";
import { EventListenersItem } from "./EventListeners/EventListenersItem";
import { HubSettingModel, createHubModel } from "./HubSettingModel";

export class HubSettingItem implements AzureResourceModel {
    static readonly contextValue: string = 'webPubSubHubItem';
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
            label: localize('annoymousConnectPolicy',  "{0} Annoymous Clients", isAllowAnnoy ? "Allow" : "Deny"),
            contextValue: "hubAllowAnnoymousClients",
            iconPath: new vscode.ThemeIcon(isAllowAnnoy ? "workspace-untrusted" : "workspace-trusted"),
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

    static async Get(context: IActionContext, subscription: AzureSubscription, resourceGroup: string, resourceName: string, webPubSubHubName: string): Promise<HubSettingModel> {
        const client = await createWebPubSubAPIClient(context, subscription);
        return createHubModel(await client.webPubSubHubs.get(webPubSubHubName, resourceGroup, resourceName));
    }

    viewProperties: ViewPropertiesModel = {
        data: this.hub,
        label: `${this.hub.hubName}`,
    };
}
