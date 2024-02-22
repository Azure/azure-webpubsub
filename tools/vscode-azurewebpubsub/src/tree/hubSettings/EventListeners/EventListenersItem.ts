/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { EventListener } from "@azure/arm-webpubsub";
import { TreeElementBase, createContextValue } from "@microsoft/vscode-azext-utils";
import { ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import * as vscode from 'vscode';
import { EventListenerItem } from "./EventListenerItem";
import { localize } from "../../../utils";

export class EventListenersItem implements TreeElementBase {
    static readonly contextValue: string = 'webPubSubHubEventListenersItem';
    static readonly contextValueRegExp: RegExp = new RegExp(EventListenersItem.contextValue);

    constructor(public readonly eventListeners: EventListener[]) { }

    async getChildren(): Promise<EventListenerItem[]> {
        const result: EventListenerItem[] = [];
        for (let i = 0; i < this.eventListeners.length; i++) {
            result.push(new EventListenerItem(this.eventListeners[i], i));
        }
        return result;
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: localize("eventListeners", "Event Listeners"),
            iconPath: new vscode.ThemeIcon("list-ordered"),
            contextValue: createContextValue([EventListenersItem.contextValue]),
            collapsibleState: this.eventListeners.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
            description: localize("listenersWithNumber", "{0} Listeners", this.eventListeners.length)
        };
    }

    viewProperties: ViewPropertiesModel = {
        data: this.eventListeners,
        label: localize("eventListeners", "Event Listeners"),
    };
}
