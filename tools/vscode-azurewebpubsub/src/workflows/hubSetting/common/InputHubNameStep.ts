/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureNameStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../utils";
import { type ICreateOrUpdateHubSettingContext } from "src/workflows/common/contexts";
import { VALID_HUB_NAME_DESC, VALID_HUB_NAME_REGEX } from "../../../constants";

export class InputHubNameStep extends AzureNameStep<ICreateOrUpdateHubSettingContext> {
    constructor(private readonly context: ICreateOrUpdateHubSettingContext) {
        super();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this.validateHubSettingName = this.validateHubSettingName.bind(this);
    }

    public async prompt(context: ICreateOrUpdateHubSettingContext): Promise<void> {
        context.hubName = (await context.ui.showInputBox({ 
            prompt: localize('enterHubName', 'Enter name for the new hub setting'), 
            validateInput: this.validateHubSettingName
        })).trim();
    }

    async validateHubSettingName(name: string): Promise<string | undefined> {
        name = name.trim();
        if (!name || !VALID_HUB_NAME_REGEX.test(name)) {
            return localize('invalidHubName', VALID_HUB_NAME_DESC);
        }
        if (this.context.hubName === name) {
            return localize('existingHubSettingName', 'Hub Setting name "{0}" already exists', name);
        }
        return ; // undefined means valid
    }
    
    public shouldPrompt(_context: ICreateOrUpdateHubSettingContext): boolean { return true; }
    protected async isRelatedNameAvailable(_context: ICreateOrUpdateHubSettingContext, _name: string): Promise<boolean> { return false; }
}
