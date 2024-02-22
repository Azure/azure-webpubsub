/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { AzureNameStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../../utils";
import { ICreateServiceContext } from "../ICreateServiceContext";
import { VALID_SERVICE_NAME_DESC, VALID_SERVICE_NAME_REGEX, webPubSubProvider } from "../../../../constants";


export class InputServiceNameStep extends AzureNameStep<ICreateServiceContext> {
    constructor(private readonly client: WebPubSubManagementClient) {
        super();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        // this.validateWebPubSubName = this.validateWebPubSubName.bind(this);
    }

    public async prompt(context: ICreateServiceContext): Promise<void> {
        const prompt: string = localize('webPubSubNamePrompt', 'Enter a valid and globally unique name for the new Web PubSub resource');
        context.webPubSubName = (await context.ui.showInputBox({ prompt, validateInput: this.validateWebPubSubName }));
    }

    private async validateWebPubSubName(name: string): Promise<string> {
        if (!name || !VALID_SERVICE_NAME_REGEX.test(name)) {
            return localize('invalidName', VALID_SERVICE_NAME_DESC);
        }
        const checkResult = await this.client.webPubSub.checkNameAvailability("eastus", { name: name, type: webPubSubProvider })
        return checkResult.nameAvailable ? "" : localize('usedServiceName', "The name was already taken. Please try a different name."); // "" means ok
    }

    public shouldPrompt(_context: ICreateServiceContext): boolean { return true; }
    protected async isRelatedNameAvailable(_context: ICreateServiceContext, _name: string): Promise<boolean> { return false; }
}
