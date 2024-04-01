import { uiUtils } from "@microsoft/vscode-azext-azureutils";
import { type IActionContext, type TreeElementBase} from "@microsoft/vscode-azext-utils";
import { callWithTelemetryAndErrorHandling, createContextValue } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from '@microsoft/vscode-azureresources-api';
import * as vscode from 'vscode';
import { type ServiceItem } from "../service/ServiceItem";
import { HubSettingItem } from "./HubSettingItem";
import { createWebPubSubAPIClient, localize } from "../../utils";
import { sortById } from "../utils";
import { createHubModel } from "./HubSettingModel";

export class HubSettingsItem implements TreeElementBase {
    static readonly contextValue: string = 'webPubSubHubSettingsItem';
    static readonly contextValueRegExp: RegExp = new RegExp(HubSettingsItem.contextValue);

    constructor(public readonly service: ServiceItem) { }

    async getChildren(): Promise<HubSettingItem[]> {
        return await callWithTelemetryAndErrorHandling('getChildren', async (context) => {
            return (await this.list(context)).sort((a, b) => sortById(a, b));
        }) ?? [];
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: localize("hubSettings", "Hub Settings"),
            iconPath: new vscode.ThemeIcon("server"),
            contextValue: createContextValue([HubSettingsItem.contextValue]),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        };
    }

    static async getHubs(context: IActionContext, subscription: AzureSubscription, resourceGroup: string, resourceName: string) {
        const client = await createWebPubSubAPIClient(context, subscription);
        return client.webPubSubHubs.list(resourceGroup, resourceName);
    }

    async list(context: IActionContext): Promise<HubSettingItem[]> {
        const hubs = await HubSettingsItem.getHubs(context, this.service.subscription, this.service.resourceGroup, this.service.name);
        const hubIterator = await uiUtils.listAllIterator(hubs);
        return hubIterator
            .filter(hub => hub.id && hub.id.includes(this.service.id))
            .map(createHubModel)
            .map(hub => new HubSettingItem(this.service, hub));
    }

}