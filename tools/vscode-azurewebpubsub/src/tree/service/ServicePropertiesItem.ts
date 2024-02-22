/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { KnownWebPubSubSkuTier, ProvisioningState } from "@azure/arm-webpubsub";
import { TreeElementBase, TreeItemIconPath, createContextValue, createGenericElement } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { ThemeIcon } from "vscode";
import { localize } from "../../utils";
import { ServiceModel } from "./ServiceModel";


export class ServicePropertiesItem implements TreeElementBase {
    static readonly contextValue: string = 'servicePropertiesItem';
    static readonly contextValueRegExp: RegExp = new RegExp(ServicePropertiesItem.contextValue);

    constructor(public readonly webPubSub: ServiceModel) { }
    
    getTreeItem(): vscode.TreeItem {
        return {
            label: `Properties`,
            iconPath: new ThemeIcon("symbol-property"),
            contextValue:  createContextValue([ServicePropertiesItem.contextValue]),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
    }

    async getChildren(): Promise<TreeElementBase[]> {
        const childs: TreeElementBase[] = [];
        childs.push(createGenericElement({
            label: localize('serviceLocation', 'Location'),
            description: this.webPubSub.location,
            contextValue: "serviceLocation",
            iconPath: new ThemeIcon("location")
        }));
        childs.push(createGenericElement({
            label: localize('serviceSku', 'Sku'),
            description: this.webPubSub.sku?.name,
            contextValue: "serviceSku",
            iconPath: new ThemeIcon("settings")
        }));
        if (this.webPubSub.sku?.tier !== KnownWebPubSubSkuTier.Free) {
            childs.push(createGenericElement({
                label: localize('serviceUnitCount', 'Unit'),
                description: (this.webPubSub.sku?.capacity ?? 1).toString(),
                contextValue: "serviceUnitCount",
                iconPath: new ThemeIcon("symbol-unit")
            }));
        }
        childs.push(createGenericElement({
            label: localize('serviceStatus', 'Status'),
            description: this.webPubSub.provisioningState,
            contextValue: "serviceStatus",
            iconPath: this.getIconPathForProvisoningState(this.webPubSub.provisioningState)
        }));

        return childs;
    }

    
    getIconPathForProvisoningState(provisioningState?: ProvisioningState): TreeItemIconPath {
        switch (provisioningState) {
            case "Running": case "Creating": case "Updating": case "Deleting": case "Moving": return new ThemeIcon("refresh");
            case "Succeeded": return new ThemeIcon("check"); 
            case "Failed": return new ThemeIcon("error"); 
            case "Canceled": return new ThemeIcon("close"); 
            case "Unknown": return new ThemeIcon("question"); 
            default: return new ThemeIcon("question"); 
        }
    }

}
