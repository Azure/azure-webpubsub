import { window } from "vscode";
import * as nls from 'vscode-nls';
import { WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { AzExtClientContext, createAzureClient } from "@microsoft/vscode-azext-azureutils";
import { IActionContext, createSubscriptionContext } from "@microsoft/vscode-azext-utils";
import { AzureSubscription } from "@microsoft/vscode-azureresources-api";


export const localize: nls.LocalizeFunc = nls.loadMessageBundle();

export async function createAzureApiClient(context: AzExtClientContext): Promise<WebPubSubManagementClient> {
    return createAzureClient(context, WebPubSubManagementClient);
}

export async function createWebPubSubAPIClient(context: IActionContext, subscription: AzureSubscription): Promise<WebPubSubManagementClient> {
    return createAzureApiClient([context, createSubscriptionContext(subscription)]);
}

export function showError(commandName: string, error: Error): void {
    void window.showErrorMessage(`Command "${commandName}" fails. ${error.message}`);
}
