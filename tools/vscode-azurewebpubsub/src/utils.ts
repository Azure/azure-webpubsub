import { type ExtensionContext } from "vscode";
import * as vscode from "vscode";
import * as nls from 'vscode-nls';
import * as fs from "fs";
import { WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { type AzExtClientContext } from "@microsoft/vscode-azext-azureutils";
import { createAzureClient } from "@microsoft/vscode-azext-azureutils";
import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ExecuteActivityContext } from "@microsoft/vscode-azext-utils";
import { createSubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { type AzureResourcesExtensionApiWithActivity } from "@microsoft/vscode-azext-utils/activity";
import { ext } from "./extensionVariables";
import { WebPubSubServiceClient } from "@azure/web-pubsub";

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
    void vscode.window.showErrorMessage(`Command "${commandName}" fails. ${error.message}`);
}

export function getHealthApiUrl(endpoint: string): string {
    return `${endpoint}/api/health`;
}

export function createEndpointFromHostName(hostName: string): string {
    return `https://${hostName}`;
}

export function isUrlValid(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch (_err) {
        return false;
    }
}

export async function loadPackageInfo(context: ExtensionContext) {
    const raw = await fs.promises.readFile(context.asAbsolutePath("./package.json"), { encoding: 'utf-8' });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { publisher, name, version, aiKey } = JSON.parse(raw);
    return {
        publisher: publisher as string,
        name: name as string,
        version: version as string,
        applicationInsightKey: aiKey as string,
        extensionId: `${publisher}.${name}`
    };
}

export function createTerminalForTunnel(serviceName: string, hubName: string, ifShow: boolean = false): vscode.Terminal {
    const name = `AWPS Tunnel: ${serviceName} - ${hubName}`;
    const sameNameTerminal = vscode.window.terminals.filter((t) => t.name === name)?.[0] ?? undefined;
    sameNameTerminal && sameNameTerminal.dispose();
    const terminal = vscode.window.createTerminal({ name });
    ifShow && terminal.show();
    return terminal;
}

export async function getClientAccessUrl(connectionString: string, hubName: string, userId?: string, roles?: string[], groups?: string[]): Promise<string> {
    const client = new WebPubSubServiceClient(connectionString, hubName)
    const cat = await client.getClientAccessToken({ userId, roles, groups });
    return cat.url;
}

/**
 * A helper function that returns a unique alphanumeric identifier called a nonce.
 *
 * @remarks This function is primarily used to help enforce content security
 * policies for resources/scripts being executed in a webview context.
 *
 * @returns A nonce
 */
export function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * A helper function which will get the webview URI of a given file or resource.
 *
 * @remarks This URI can be used within a webview's HTML as a link to the
 * given file/resource.
 *
 * @param webview A reference to the extension webview
 * @param extensionUri The URI of the directory containing the extension
 * @param pathList An array of strings representing the path to a file/resource
 * @returns A URI pointing to the file/resource
 */
export function getWebviewUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]) {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}

export async function postMessageToWebviewWithLog(webview: vscode.Webview, message: unknown) {
    ext.outputChannel.appendLog(`Post message to webview: ${JSON.stringify(message)}`);
    await webview.postMessage(message);
}
