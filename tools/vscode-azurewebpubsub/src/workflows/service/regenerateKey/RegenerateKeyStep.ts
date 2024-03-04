/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type IPickKeyContext } from "src/workflows/common/contexts";
import * as vscode from 'vscode';
import { type Progress } from "vscode";
import { createAzureApiClient, localize } from '../../../utils';

export class RegenerateKeyStep extends AzureWizardExecuteStep<IPickKeyContext> {
    public priority: number = 110;

    public async execute(context: IPickKeyContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        if (!context.subscription || !context.serviceName || !context.resourceGroupName) {
            throw new Error(localize('invalidIPickKeyContext', 'Invalid IPickKeyContext, subscription: {0}, serviceName: {1}, resourceGroupName: {2}', context.subscription?.subscriptionId, context.serviceName, context.resourceGroupName));
        }

        progress.report({ message: localize('regeneratingKey', 'Regenerating {0} key of {1}, please wait...', context.keyType, context.serviceName) });

        const client = await createAzureApiClient([context, context.subscription]);
        await client.webPubSub.beginRegenerateKeyAndWait(context.resourceGroupName, context.serviceName, { keyType: context.keyType });
        // eslint-disable-next-line @typescript-eslint/no-floating-promises    
        vscode.window.showInformationMessage(localize("regeneratedKeyWithType", 'Regenerated {0} Key of {1}', context.keyType, context.serviceName));
    }

    public shouldExecute(_context: IPickKeyContext): boolean { return true; }
}
