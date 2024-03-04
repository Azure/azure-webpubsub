/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullValue, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { localize } from "../../../utils";
import { type IPickKeyContext } from '../../common/contexts';

export class RegenerateKeyConfirmStep extends AzureWizardPromptStep<IPickKeyContext> {
    private serviceName?: string;

    public async prompt(context: IPickKeyContext): Promise<void> {
        this.serviceName = context.serviceName;
        const prompt: string = localize(
            'confirmRegenerateKey',
            'The current key will immediately become invalid and it is not recoverable. Do you want to regenerate access key "{0}"? Enter "{1}" to confirm',
            context.keyType,
            context.serviceName
        );

        const result: string = await context.ui.showInputBox({
            prompt: prompt,
            validateInput: (val?: string) => this.validateInput(val, prompt)
        });

        if (!this.isNameEqualToResource(result)) { // Check again just in case `validateInput` didn't prevent the input box from closing
            context.telemetry.properties.cancelStep = 'mismatchRegenerateKey';
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
