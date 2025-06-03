import { openUrl, type IActionContext } from "@microsoft/vscode-azext-utils";

export async function createServiceInPortal(_context: IActionContext): Promise<void> {
    await openUrl('https://portal.azure.com/#create/Microsoft.AzureWebPubSub');
}
