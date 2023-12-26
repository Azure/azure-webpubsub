/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports no-implicit-dependencies
import { OpenInPortalOptions } from "@microsoft/vscode-azext-azureutils";
import { AzureSubscription } from "@microsoft/vscode-azureresources-api/dist/vscode-azureresources-api";
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

export const localize: nls.LocalizeFunc = nls.loadMessageBundle();

export function createPortalUrl(subscription: AzureSubscription, id: string, options?: OpenInPortalOptions): vscode.Uri {
    const queryPrefix: string = (options && options.queryPrefix) ? `?${options.queryPrefix}` : '';
    const url: string = `${subscription.environment.portalUrl}/${queryPrefix}#@${subscription.tenantId}/resource${id}`;

    return vscode.Uri.parse(url);
}


export function showError(commandName: string, error: Error): void {
    void window.showErrorMessage(`Command "${commandName}" fails. ${error.message}`);
}
