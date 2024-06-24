import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { ServiceModel } from "../../../../tree/service/ServiceModel";
import { WebPubSubManagementClient } from "@azure/arm-webpubsub";

/**
 * This class manages the state and behavior of HelloWorld webview panels.
 *
 * It contains all the data and methods for:
 *
 * - Creating and rendering HelloWorld webview panels
 * - Properly cleaning up and disposing of webview resources when the panel is closed
 * - Setting the HTML (and by proxy CSS/JavaScript) content of the webview panel
 * - Setting message listeners so data can be passed between the webview and extension
 */
export class TestClientWebviewPanel {
  public static currentPanel: TestClientWebviewPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private readonly _service: ServiceModel;
  private readonly _managementClient: WebPubSubManagementClient;

  /**
   * The HelloWorldPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: WebviewPanel, extensionUri: Uri, service: ServiceModel, managementClient: WebPubSubManagementClient) {
    this._panel = panel;
    
    // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
    // the panel or when the panel is closed programmatically)
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Set the HTML content for the webview panel
    this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

    // Set an event listener to listen for messages passed from the webview context
    this._setWebviewMessageListener(this._panel.webview);

    this._service = service;
    this._managementClient = managementClient;
  }

  /**
   * Renders the current webview panel if it exists otherwise a new webview panel
   * will be created and displayed.
   *
   * @param extensionUri The URI of the directory containing the extension.
   */
  public static render(extensionUri: Uri, service: ServiceModel, managementClient: WebPubSubManagementClient) {
    if (TestClientWebviewPanel.currentPanel) {
      // If the webview panel already exists reveal it
      TestClientWebviewPanel.currentPanel._panel.reveal(ViewColumn.One);
    } else {
      // If a webview panel does not already exist create and show a new one
      const panel = window.createWebviewPanel(
        // Panel view type
        "testClientView",
        // Panel title
        `Test Client for ${service.name}`,
        // The editor column the panel should be displayed in
        ViewColumn.One,
        // Extra panel configurations
        {
          // Enable JavaScript in the webview
          enableScripts: true,
          // Restrict the webview to only load resources from the `out` and `webview-ui/build` directories
          localResourceRoots: [Uri.joinPath(extensionUri, "out"), Uri.joinPath(extensionUri, "webview-ui/build")],
          portMapping: [
            { webviewPort: 4000, extensionHostPort: 4000 }
          ]
        }
      );

      TestClientWebviewPanel.currentPanel = new TestClientWebviewPanel(panel, extensionUri, service, managementClient);
    }
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    TestClientWebviewPanel.currentPanel = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();

    // Dispose of all disposables (i.e. commands) for the current webview panel
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Defines and returns the HTML that should be rendered within the webview panel.
   *
   * @remarks This is also the place where references to the React webview build files
   * are created and inserted into the webview HTML.
   *
   * @param webview A reference to the extension webview
   * @param extensionUri The URI of the directory containing the extension
   * @returns A template string literal containing the HTML that should be
   * rendered within the webview panel
   */
  private _getWebviewContent(webview: Webview, extensionUri: Uri) {
    // The CSS file from the React build output
    const stylesUri = getUri(webview, extensionUri, ["webview-ui", "build", "assets", "index.css"]);
    // The JS file from the React build output
    const scriptUri = getUri(webview, extensionUri, ["webview-ui", "build", "assets", "index.js"]);

    const nonce = getNonce();

    // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
    // <meta http-equiv="Content-Security-Policy" content="connect-src http://localhost:4000/*; img-src ${webview.cspSource} https:; script-src ${webview.cspSource}; style-src ${webview.cspSource};"/>
    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="default-src *; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">          
          <link rel="stylesheet" type="text/css" href="${stylesUri}">
          <title>AWPS Test Client Title</title>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>
    `;
  }

  /**
   * Sets up an event listener to listen for messages passed from the webview context and
   * executes code based on the message that is recieved.
   *
   * @param webview A reference to the extension webview
   * @param context A reference to the extension context
   */
  private _setWebviewMessageListener(webview: Webview) {
    webview.onDidReceiveMessage(
      (message: any) => {
        const command = message.command;
        const payload = message.payload;
        window.showInformationMessage(`Receive message from webview: ${command} with payload: ${JSON.stringify(payload)}`);

        switch (command) {
          case "getServiceInformation":
            // Code that should run in response to the hello message command
            webview.postMessage({
              command: "setServiceInformation",
              payload: {
                resourceGroupName: this._service.resourceGroup,
                serviceName: this._service.name
              }
            });
            return;

          case "getClientAccessUrl":
            webview.postMessage({
              command: "setClientAccessUrl",
              payload: "dummy-url"
            });
            return ;
        }
      },
      undefined,
      this._disposables
    );
  }
}