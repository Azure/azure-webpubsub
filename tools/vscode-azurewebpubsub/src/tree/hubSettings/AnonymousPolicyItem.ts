/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type TreeElementBase} from "@microsoft/vscode-azext-utils";
import { createContextValue } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { localize } from '../../utils';
import { KnownAnonymousConnectPolicy } from "../../constants";
import { type HubSettingItem } from "./HubSettingItem";

export class AnonymousPolicyItem implements TreeElementBase {
    static readonly contextValue: string = 'webPubSubAnonymousPolicyItem';
    static readonly contextValueRegExp: RegExp = new RegExp(AnonymousPolicyItem.contextValue);

    constructor(public readonly hubItem: HubSettingItem) { }

    private get contextValue(): string {
        return createContextValue([AnonymousPolicyItem.contextValue,]);
    }

    getTreeItem(): vscode.TreeItem {
        const isAllowAnony: boolean = this.hubItem.hub.properties.anonymousConnectPolicy === KnownAnonymousConnectPolicy.Allow;
        return {
            label: localize('annoymousConnectPolicy', "{0} Anonymous Clients", isAllowAnony ? "Allow" : "Deny"),
            iconPath: new vscode.ThemeIcon(isAllowAnony ? "workspace-unknown" : "workspace-trusted"),
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.None
        };
    }
}
