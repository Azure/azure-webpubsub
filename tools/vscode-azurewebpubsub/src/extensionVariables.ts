/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import  { type IAzExtOutputChannel, type TreeElementStateManager } from "@microsoft/vscode-azext-utils";
import  { type ExtensionContext } from "vscode";
import  { type ServicesDataProvider } from "./tree/ServicesDataProvider";
import  { type AzureResourcesExtensionApi } from "@microsoft/vscode-azureresources-api";

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
// tslint:disable-next-line: export-name
export namespace ext {
    export const prefix: string = 'webPubSub';
    export let state: TreeElementStateManager;
    export let branchDataProvider: ServicesDataProvider;
    export let rgApiV2: AzureResourcesExtensionApi;
    export let context: ExtensionContext;
    export let outputChannel: IAzExtOutputChannel;
    export let ignoreBundle: boolean | undefined;
}

