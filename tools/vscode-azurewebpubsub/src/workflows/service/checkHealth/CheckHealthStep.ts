/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import fetch from "node-fetch";
import * as vscode from 'vscode';
import { type Progress } from "vscode";
import { getHealthApiUrl, localize } from "../../../utils";
import { type ICheckHealthContext } from "./ICheckHealthContext";

export class CheckHealthStep extends AzureWizardExecuteStep<ICheckHealthContext> {
    public priority: number = 110;

    public async execute(context: ICheckHealthContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        if (!context.endpoint) {
            throw new Error(localize('noEndpoint', 'No endpoint is provided for Web PubSub {0}', context.serviceName));
        }
        progress.report({ message: localize('checkingHealth', 'Checking resource health for {0}, please wait...', context.serviceName)});

        const response = await fetch(getHealthApiUrl(context.endpoint));
        if (response.status !== 200) {
            throw new Error(localize('checkHealthError', `Bad health of {0}. Status code = {1}`, context.serviceName, response.status));
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            vscode.window.showInformationMessage(`${context.serviceName} is healthy!`)
        }
    }

    public shouldExecute(_context: ICheckHealthContext): boolean { return true; }
}
