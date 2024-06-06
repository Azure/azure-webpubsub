/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import * as utils from "../../../utils";
import { pickService } from "../../../tree/service/pickService";
import { createActivityContext, localize } from "../../../utils";
import { type IUpdateServiceContext } from "../../common/contexts";
import { InputServiceSkuNameStep } from "../create/steps/InputServiceSkuNameStep";
import { UpdateServiceStep } from "../../common/UpdateServiceStep";
import { ext } from "../../../extensionVariables";
import * as vscode from "vscode";

export async function testClient(context: IActionContext, node?: ServiceItem): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'testClientWebView', // Identifies the type of the webview. Used internally
        'Web PubSub Test Client', // Title of the panel displayed to the user
        vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        {} // Webview options. More on these later.
    );
    panel.webview.html = getWebviewContent();
}

function getWebviewContent() {
    return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Cat Coding</title>
  </head>
  <body>
      <img src="https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif" width="300" />
  </body>
  </html>`;
  }