/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports no-implicit-dependencies
import { window } from 'vscode';

export function showError(commandName: string, error: Error): void {
    void window.showErrorMessage(`Command "${commandName}" fails. ${error.message}`);
}
