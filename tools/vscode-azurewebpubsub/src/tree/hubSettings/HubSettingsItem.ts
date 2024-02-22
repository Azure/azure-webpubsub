import { uiUtils } from "@microsoft/vscode-azext-azureutils";
import { IActionContext, TreeElementBase, callWithTelemetryAndErrorHandling, createContextValue } from "@microsoft/vscode-azext-utils";
import { AzureSubscription } from '@microsoft/vscode-azureresources-api';
import * as vscode from 'vscode';
import { ServiceItem } from "../service/ServiceItem";
import { HubSettingItem } from "./HubSettingItem";
import { createWebPubSubAPIClient } from "../../utils";
import { sortById } from "../utils";
import { HubSettingModel, createHubModel } from "./HubSettingModel";


export class HubSettingsItem implements TreeElementBase {
    static readonly contextValue: string = 'webPubSubHubsItem';
    static readonly contextValueRegExp: RegExp = new RegExp(HubSettingsItem.contextValue);

    constructor(public readonly service: ServiceItem) { }

    async getChildren(): Promise<HubSettingItem[]> {
        return await callWithTelemetryAndErrorHandling('getChildren', async (context) => {
            const hubs = await this.List(context);
            return hubs
                .map(hub => new HubSettingItem(this.service, hub))
                .sort((a, b) => sortById(a, b));
        }) ?? [];
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: `Hub Settings`,
            iconPath: new vscode.ThemeIcon("server"),
            contextValue: createContextValue([HubSettingsItem.contextValue]),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        };
    }

    static async getHubs(context: IActionContext, subscription: AzureSubscription, resourceGroup: string, resourceName: string) {
        const client = await createWebPubSubAPIClient(context, subscription);
        return client.webPubSubHubs.list(resourceGroup, resourceName);
    }

    async List(context: IActionContext): Promise<HubSettingModel[]> {
        const hubs = await HubSettingsItem.getHubs(context, this.service.subscription, this.service.resourceGroup, this.service.name);
        const hubIterator = await uiUtils.listAllIterator(hubs);
        return hubIterator
            .filter(hub => hub.id && hub.id.includes(this.service.id))
            .map(createHubModel);
    }

}