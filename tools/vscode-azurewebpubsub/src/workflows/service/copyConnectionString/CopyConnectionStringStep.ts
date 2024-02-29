/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KnownKeyType } from "@azure/arm-webpubsub";
import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type IPickKeyContext } from "src/workflows/common/contexts";
import * as vscode from 'vscode';
import { env, type Progress } from "vscode";
import { createAzureApiClient, localize } from '../../../utils';

export class CopyConnectionStringStep extends AzureWizardExecuteStep<IPickKeyContext> {
    public priority: number = 110;

    public async execute(context: IPickKeyContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        if (!context.subscription || !context.serviceName || !context.resourceGroupName) {
            throw new Error(`invalidIPickKeyContext, subscription: ${context.subscription}, serviceName: ${context.serviceName}, resourceGroupName: ${context.resourceGroupName}`);
        }

        const client = await createAzureApiClient([context, context.subscription]);
        progress.report({ message: localize('takeSeveralSeconds', 'Copying connection string, please wait...') });

        const keys = await client.webPubSub.listKeys(context.resourceGroupName, context.serviceName);
        const connString = context.keyType === KnownKeyType.Primary ? keys.primaryConnectionString : keys.secondaryConnectionString;
        if (!connString) {
            throw new Error(localize('copyConnectionStringError', `Failed to copy connection string of ${context.serviceName}.`));
        }
        else {
            await env.clipboard.writeText(connString);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises    
            vscode.window.showInformationMessage(localize("copiedConnectionString", "Copied {0} connection string of {1} to clipboard", context.keyType, context.serviceName));
        }
    }

    public shouldExecute(_context: IPickKeyContext): boolean { return true; }
}
