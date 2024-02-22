/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { EventListener } from "@azure/arm-webpubsub";
import { TreeElementBase, createContextValue } from "@microsoft/vscode-azext-utils";
import { ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import { HubSettingsItem } from "../HubSettingsItem";
import * as vscode from 'vscode';


export class EventListenerItem implements TreeElementBase {
    static readonly contextValue: string = 'webPubSubHubEventListenerItem';
    static readonly contextValueRegExp: RegExp = new RegExp(EventListenerItem.contextValue);

    constructor(public readonly eventListener: EventListener, public readonly order: number) { }

    async getChildren(): Promise<HubSettingsItem[]> { return []; }

    getTreeItem(): vscode.TreeItem {
        return {
            label: `Event Listener ${this.order}`,
            iconPath: new vscode.ThemeIcon("send"),
            contextValue: createContextValue([EventListenerItem.contextValue]),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            // TODO: add more detail to tooltip
            tooltip: new vscode.MarkdownString(``)
        };
    }

    viewProperties: ViewPropertiesModel = {
        data: this.eventListener,
        label: `Event Listener ${this.order}`
    };
}
