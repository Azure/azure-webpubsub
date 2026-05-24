import { type Webview, type WebviewPanel, type Uri} from "vscode";
import { ViewColumn } from "vscode";
import { type ServiceModel } from "../tree/service/ServiceModel";
import { type WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { getClientAccessUrl, localize, postMessageToWebviewWithLog } from "../utils";
import { BasePanel } from "./BasePanel";
import { ext } from "../extensionVariables";

export class TestClientWebviewPanel extends BasePanel {
  public static currentPanel: TestClientWebviewPanel | undefined;
  private readonly _service: ServiceModel;
  private readonly _managementClient: WebPubSubManagementClient;

  public constructor(panel: WebviewPanel, extensionUri: Uri, service: ServiceModel, managementClient: WebPubSubManagementClient) {
    super(panel, extensionUri);
    this._service = service;
    this._managementClient = managementClient;
  }

  public static render(extensionUri: Uri, service: ServiceModel, managementClient: WebPubSubManagementClient) {
    // If the webview panel already exists reveal it
    if (TestClientWebviewPanel.currentPanel) {
      return TestClientWebviewPanel.currentPanel._panel.reveal(ViewColumn.One);
    }
    const panel = super.renderNew(extensionUri, "testClientView", `Test Client for ${service.name}`);
    TestClientWebviewPanel.currentPanel = new TestClientWebviewPanel(panel, extensionUri, service, managementClient);
  }

  public override dispose() {
    TestClientWebviewPanel.currentPanel = undefined;
    return super.dispose();
  }

  protected override setWebviewMessageListener(webview: Webview) {
    webview.onDidReceiveMessage(
      /* eslint-disable */
      async (message: any) => {
        const command = message.command;
        let payload = message.payload;
        ext.outputChannel.appendLog(`Receive message from webview, command = ${command}, payload = ${JSON.stringify(payload)}`);

        const commandName = command.split("-")[0];
        const commandIdx = command.split("-")[1];
        switch (commandName) {
          case "reportServiceConfiguration":
            const hubsIterator = this._managementClient.webPubSubHubs.list(this._service.resourceGroup, this._service.name);
            const hubNames: string[] = [];
            for await (const hub of hubsIterator) {
              hub.name && hubNames.push(hub.name);
            }
            await postMessageToWebviewWithLog(webview, {
              command: `ack-reportServiceConfiguration-${commandIdx}`,
              payload: {
                resourceGroup: this._service.resourceGroup,
                resourceName: this._service.name,
                hubNames: hubNames
              }
            });
            return;

          case "getClientAccessUrl":
            payload = { hub: payload.hub ?? "", userId: payload.userId ?? "", roles: payload.roles ?? [], groups: payload.groups ?? []};
            const { hub, userId, roles, groups } = payload;
            const connectionString = (await (this._managementClient.webPubSub.listKeys(this._service.resourceGroup, this._service.name))).primaryConnectionString;
            if (!connectionString) {
              throw new Error(localize('getConnectionStringError', `Failed to get connection string of ${this._service.name}.`));
            }
            const clientAccessUrl = await getClientAccessUrl(connectionString, hub, userId, roles, groups);
            postMessageToWebviewWithLog(webview, {
              command: `ack-getClientAccessUrl-${commandIdx}`,
              payload: clientAccessUrl
            });
            return ;
        }
      },
      /* eslint-enable */
      undefined,
      this._disposables
    );
  }
}