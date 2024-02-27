import { window } from "vscode";
import * as nls from 'vscode-nls';
import { WebPubSubManagementClient } from "@azure/arm-webpubsub";
import  { type AzExtClientContext} from "@microsoft/vscode-azext-azureutils";
import { createAzureClient } from "@microsoft/vscode-azext-azureutils";
import  { type IActionContext} from "@microsoft/vscode-azext-utils";
import  { type ExecuteActivityContext} from "@microsoft/vscode-azext-utils";
import { createSubscriptionContext } from "@microsoft/vscode-azext-utils";
import  { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { type AzureResourcesExtensionApiWithActivity } from "@microsoft/vscode-azext-utils/activity";
import { ext } from "./extensionVariables";

export const localize: nls.LocalizeFunc = nls.loadMessageBundle();

export async function createAzureApiClient(context: AzExtClientContext): Promise<WebPubSubManagementClient> {
    return createAzureClient(context, WebPubSubManagementClient);
}

export async function createWebPubSubAPIClient(context: IActionContext, subscription: AzureSubscription): Promise<WebPubSubManagementClient> {
    return createAzureApiClient([context, createSubscriptionContext(subscription)]);
}

export async function createActivityContext(): Promise<ExecuteActivityContext> {
    return {
        registerActivity: async (activity) => (ext.rgApiV2 as AzureResourcesExtensionApiWithActivity).activity.registerActivity(activity),
    };
}

export function showError(commandName: string, error: Error): void {
    void window.showErrorMessage(`Command "${commandName}" fails. ${error.message}`);
}
