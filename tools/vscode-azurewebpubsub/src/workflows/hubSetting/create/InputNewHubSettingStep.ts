/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureNameStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../utils";
import { type ICreateOrUpdateHubSettingContext } from "../../common/contexts";
import { InputHubNameStep } from "../common/InputHubNameStep";
import { CreateOrUpdateEventHandlerStep } from "../common/CreateOrUpdateEventHandlerStep";

export class InputNewHubSettingStep extends AzureNameStep<ICreateOrUpdateHubSettingContext> {

    public async prompt(context: ICreateOrUpdateHubSettingContext): Promise<void> {
        if (!(context.hubProperties?.eventHandlers)) throw new Error(`Invalid hub properties ${context.hubProperties} or hub name ${context.hubName}`);
        await new InputHubNameStep(context).prompt(context);
        while (true) {
            await new CreateOrUpdateEventHandlerStep(true).prompt(context);

            const askForMoreEventHandler: boolean = (await context.ui.showQuickPick(
                [ { label: "No", data: false }, { label: "Yes", data: true } ],
                { placeHolder: localize('askIfMoreEventHandler', 'Do you want to add more event handler?') }
            )).data;
            if (!askForMoreEventHandler) break;
        }
    }

    public shouldPrompt(context: ICreateOrUpdateHubSettingContext): boolean {
        if (!context.hubProperties) throw new Error(`Invalid hub properties ${context.hubProperties}`);
        return true;
    }

    protected async isRelatedNameAvailable(_context: ICreateOrUpdateHubSettingContext, _name: string): Promise<boolean> {
        return false;
    }
}


