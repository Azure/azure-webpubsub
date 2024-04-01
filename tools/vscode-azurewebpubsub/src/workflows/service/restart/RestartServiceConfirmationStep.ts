/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullValue, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { localize } from "../../../utils";
import { type IPickServiceContext } from '../../common/contexts';

export class RestartWebPubSubConfirmationStep extends AzureWizardPromptStep<IPickServiceContext> {
    private serviceName: string | undefined;

    public async prompt(context: IPickServiceContext): Promise<void> {
        this.serviceName = context.serviceName;
        const prompt: string = localize('confirmRestart', 'Restarting causes the service to be temporarily unavailable. Would you like to continue? Enter "{0}" to confirm', context.serviceName);

        const result: string = await context.ui.showInputBox({
            prompt: prompt,
            validateInput: (val?: string) => this.validateInput(val, prompt)
        });

        if (!this.isNameEqualToResource(result)) { // Check again just in case `validateInput` didn't prevent the input box from closing
            context.telemetry.properties.cancelStep = 'mismatchRestart';
            throw new UserCancelledError();
        }
    }

    private validateInput(val: string | undefined, prompt: string): string | undefined {
        return this.isNameEqualToResource(val) ? undefined : prompt;
    }

    private isNameEqualToResource(val: string | undefined): boolean {
        return !!val && val.toLowerCase() === nonNullValue(this.serviceName).toLowerCase();
    }

    public shouldPrompt(): boolean { return true; }
}
