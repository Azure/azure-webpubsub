import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { ext } from "../extensionVariables";
import { getNonce, getWebviewUri } from "../utils";

export class BasePanel {
    protected readonly _panel: WebviewPanel;
    protected _disposables: Disposable[] = [];

    /**
     * The BasePanel class private constructor (called only from the render method).
     *
     * @param panel A reference to the webview panel
     * @param extensionUri The URI of the directory containing the extension
     */
    public constructor(panel: WebviewPanel, extensionUri: Uri) {
        this._panel = panel;

        // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
        // the panel or when the panel is closed programmatically)
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Set the HTML content for the webview panel
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

        // Set an event listener to listen for messages passed from the webview context
        this._setWebviewMessageListener(this._panel.webview);
    }

    /**
     * Renders a new webview panel 
     * will be created and displayed.
     *
     * @param extensionUri The URI of the directory containing the extension.
     */
    protected static _render(extensionUri: Uri, viewType: string, title: string) {
        return window.createWebviewPanel(
            viewType,
            title,
            ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [Uri.joinPath(extensionUri, "out"), Uri.joinPath(extensionUri, "webview-ui/build")],
            }
        );
    }

    /**
     * Cleans up and disposes of webview resources when the webview panel is closed.
     */
    public dispose() {
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
    protected _getWebviewContent(webview: Webview, extensionUri: Uri) {
        const assetsPath = ["webview-ui", "build", "assets"];
        const stylesUri = getWebviewUri(webview, extensionUri, [...assetsPath, "index.css"]);
        const scriptUri = getWebviewUri(webview, extensionUri, [...assetsPath, "index.js"]);

        const nonce = getNonce();

        // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
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

    protected _setWebviewMessageListener(webview: Webview) {
        webview.onDidReceiveMessage(
            async (message: any) => {
                const command = message.command;
                let payload = message.payload;
                ext.outputChannel.appendLog(`Received a message from webview, command = ${command}, payload = ${JSON.stringify(payload)}`);
            },
            undefined,
            this._disposables
        );
    }
}
