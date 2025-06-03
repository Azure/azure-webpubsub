/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { AzureNameStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../../utils";
import { type ICreateServiceContext } from "../ICreateServiceContext";
import { VALID_SERVICE_NAME_DESC, VALID_SERVICE_NAME_REGEX, WEB_PUBSUB_PROVIDER } from "../../../../constants";

export class InputServiceNameStep extends AzureNameStep<ICreateServiceContext> {
    constructor(private readonly client: WebPubSubManagementClient) {
        super();
        // otherwise the validation method cannot access `this.client`
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this.validateServiceNameAvailability = this.validateServiceNameAvailability.bind(this);
    }

    public async prompt(context: ICreateServiceContext): Promise<void> {
        const prompt: string = localize('webPubSubNamePrompt', 'Enter a valid and globally unique name for the service');
        context.webPubSubName = (await context.ui.showInputBox({ 
            prompt, 
            validateInput: this.validateServiceNameFormat, 
            asyncValidationTask: this.validateServiceNameAvailability
        }));
    }

    // return "" means ok for validation methods
    private async validateServiceNameFormat(name: string): Promise<string> {
        return name && VALID_SERVICE_NAME_REGEX.test(name) ? "" : localize('invalidName', VALID_SERVICE_NAME_DESC);
    }

    private async validateServiceNameAvailability(name: string): Promise<string> {
        // location doesn't affect check result
        const checkResult = await this.client.webPubSub.checkNameAvailability("eastus", { name: name, type: WEB_PUBSUB_PROVIDER })
        return checkResult.nameAvailable ? "" : localize('usedServiceName', "The name was already taken. Please try a different name.");
    }

    public shouldPrompt(_context: ICreateServiceContext): boolean { return true; }
    protected async isRelatedNameAvailable(_context: ICreateServiceContext, _name: string): Promise<boolean> { return false; }
}
