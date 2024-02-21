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

    private getIconPathForProvisoningState(provisioningState?: ProvisioningState): TreeItemIconPath {
        switch (provisioningState) {
            case "Running": case "Creating": case "Updating": case "Deleting": case "Moving": return new ThemeIcon("refresh");
            case "Succeeded": return new ThemeIcon("check"); 
            case "Failed": return new ThemeIcon("error"); 
            case "Canceled": return new ThemeIcon("close"); 
            case "Unknown": return new ThemeIcon("question"); 
            default: return new ThemeIcon("error"); 
        }
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
            label: localize('serviceProvisioningState', 'Provisioning State'),
            description: this.webPubSub.provisioningState,
            contextValue: "serviceStatus",
            iconPath: this.getIconPathForProvisoningState(this.webPubSub.provisioningState)
        }));
        childs.push(createGenericElement({
            label: localize('serviceLocalAuth', 'Local Auth'),
            description: this.webPubSub.disableLocalAuth ? "Disabled" : "Enabled",
            contextValue: "servicePropertyDisableLocalAuth",
            iconPath: new ThemeIcon(this.webPubSub.disableLocalAuth ? "error" : "check"),
        }));
        childs.push(createGenericElement({
            label: localize('servicePublicNetworkAccess', 'Public Network Access'),
            description: this.webPubSub.publicNetworkAccess ? "Allow" : "Deny",
            contextValue: "servicePropertyPublicNetworkAccess",
            iconPath: new ThemeIcon(this.webPubSub.publicNetworkAccess ? "check" : "error"),
        }));

        let tlsNodeDesc = "";
        if (this.webPubSub.sku?.tier !== KnownWebPubSubSkuTier.Free) {
            if (this.webPubSub.tls) {
                tlsNodeDesc = this.webPubSub.tls.clientCertEnabled ? "Client Cert Enabled" : "Client Cert Disabled";
            }
            else {
                tlsNodeDesc = "Unconfigured";
            }
        }
        else {
            tlsNodeDesc = `Not Supported for ${this.webPubSub.sku?.tier} Tier`;
        }

        childs.push(createGenericElement({
            label: localize('serviceTls', 'TLS'),
            description: tlsNodeDesc,
            contextValue: "serviceTls",
            iconPath: new ThemeIcon(tlsNodeDesc.includes("Enabled") ? "check" : "error"),
        }));
        
        return childs;
    }

}
