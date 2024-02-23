/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import  { type EventListener } from "@azure/arm-webpubsub";
import  { type TreeElementBase} from "@microsoft/vscode-azext-utils";
import { createContextValue } from "@microsoft/vscode-azext-utils";
import  { type ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import  { type HubSettingsItem } from "../HubSettingsItem";
import * as vscode from 'vscode';
import { localize } from "../../../utils";

export class EventListenerItem implements TreeElementBase {
    static readonly contextValue: string = 'webPubSubHubEventListenerItem';
    static readonly contextValueRegExp: RegExp = new RegExp(EventListenerItem.contextValue);

    constructor(public readonly eventListener: EventListener, public readonly order: number) { }

    async getChildren(): Promise<HubSettingsItem[]> { return []; }

    getTreeItem(): vscode.TreeItem {
        return {
            label: localize("eventListenerWithOrder", "Event Listener {0}", this.order),
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
