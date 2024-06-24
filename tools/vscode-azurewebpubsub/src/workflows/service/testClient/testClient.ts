/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import { commands, ExtensionContext, Uri } from "vscode";
import { HelloWorldPanel } from "./panels/HelloWorldPanel";

export async function testClient(extensionUri: Uri): Promise<void> {
    HelloWorldPanel.render(extensionUri);
}
