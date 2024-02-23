/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import  { type EventHandler } from "@azure/arm-webpubsub";
import  { type TreeElementBase} from "@microsoft/vscode-azext-utils";
import { createContextValue } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import  { type HubSettingItem } from "../HubSettingItem";
import { EventHandlerItem } from "./EventHandlerItem";
import  { type ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import { localize } from "../../../utils";

export class EventHandlersItem implements TreeElementBase {
    static readonly contextValue: string = 'webPubSubHubEventHandlersItem';
    static readonly contextValueRegExp: RegExp = new RegExp(EventHandlersItem.contextValue);

    constructor(public readonly eventHandlers: EventHandler[], public readonly hubItem: HubSettingItem) { }

    async getChildren(): Promise<TreeElementBase[]> {
        const result: EventHandlerItem[] = [];
        for (let i = 0; i < this.eventHandlers.length; i++) {
            result.push(new EventHandlerItem(this, this.eventHandlers[i], i));
        }
        return result;

    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: localize("eventHandlers", "Event Handlers"),
            iconPath: new vscode.ThemeIcon("list-ordered"),
            contextValue: createContextValue([EventHandlersItem.contextValue]),
            collapsibleState: this.eventHandlers.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
            description: localize("handlersAmount", "{0} Handlers", this.eventHandlers.length)
        };
    }

    viewProperties: ViewPropertiesModel = {
        data: this.eventHandlers,
        label: "Event Handlers"
    };
}
