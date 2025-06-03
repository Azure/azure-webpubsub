/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type TreeElementBase, type TreeItemIconPath } from "@microsoft/vscode-azext-utils";
import { type Resource } from '@azure/arm-webpubsub';
import { ext } from '../extensionVariables';

export interface ResourceModel extends Resource {
    id: string;
    name: string;
    resourceGroup: string;
}

export interface PickItemOptions {
    title?: string;
    showLoadingPrompt?: boolean;
}

const getResourcesUri = () => vscode.Uri.joinPath(ext.context.extensionUri, 'resources');
export const getIconPath = (iconName: string, suffix: "svg" | "png" = "svg"): TreeItemIconPath => vscode.Uri.joinPath(getResourcesUri(), `${iconName}.${suffix}`);
export const getServiceIconPath = (isClassical: boolean = true) => isClassical ? getIconPath('azure-web-pubsub') : getIconPath('azure-web-pubsub-socketio');
export function sortById(a: TreeElementBase, b: TreeElementBase): number {
    return a.id && b.id ? a.id.localeCompare(b.id) : 0;
}