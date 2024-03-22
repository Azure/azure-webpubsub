/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, nonNullValue, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { localize } from "../../../utils";
import { type IPickHubSettingContext } from '../../common/contexts';

export class DeleteHubSettingConfirmStep extends AzureWizardPromptStep<IPickHubSettingContext> {
    private hubName?: string;

    public async prompt(context: IPickHubSettingContext): Promise<void> {
        this.hubName = context.hubName;
        const prompt = localize(
            'enterToDeleteHubSetting', 
            'Delete hub setting is irreversible. Are you sure you want to delete the hub setting? Enter "{0}" to confirm delete this Web PubSub resource',
            context.hubName
        );
        const result = await context.ui.showInputBox({
            prompt: prompt,
            validateInput: (val: string | undefined) => this.validateInput(val, prompt)
        });

        if (!this.isNameEqualToHubName(result)) { // Check again just in case `validateInput` didn't prevent the input box from closing
            context.telemetry.properties.cancelStep = 'mismatchDelete';
            throw new UserCancelledError();
        }
    }

    public shouldPrompt(): boolean { return true; }

    private validateInput(val: string | undefined, prompt: string): string | undefined {
        return this.isNameEqualToHubName(val) ? undefined : prompt;
    }

    private isNameEqualToHubName(val: string | undefined): boolean {
        return !!val && val.toLowerCase() === nonNullValue(this.hubName).toLowerCase();
    }
}
