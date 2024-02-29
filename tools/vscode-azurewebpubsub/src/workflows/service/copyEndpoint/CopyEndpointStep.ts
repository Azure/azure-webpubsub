/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { env, type Progress } from "vscode";
import { type ICopyEndpointContext } from "./ICopyEndpointContext";

export class CopyEndpointStep extends AzureWizardExecuteStep<ICopyEndpointContext> {
    public priority: number = 110;

    public async execute(context: ICopyEndpointContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        if (!context.subscription || !context.serviceName || !context.resourceGroupName || !context.endpoint) {
            throw new Error(`invalid ICopyEndpointContext, subscription: ${context.subscription}, serviceName: ${context.serviceName}, resourceGroupName: ${context.resourceGroupName}, endpoint: ${context.endpoint}`);
        }

        await env.clipboard.writeText(context.endpoint);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises    
        vscode.window.showInformationMessage(`Copied endpoint of ${context.serviceName} to clipboard`);
    }
    
    public shouldExecute(_context: ICopyEndpointContext): boolean { return true; }
}
