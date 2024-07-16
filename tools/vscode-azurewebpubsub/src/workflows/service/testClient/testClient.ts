/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ServiceItem } from "../../../tree/service/ServiceItem";
import { Uri } from "vscode";
import { TestClientWebviewPanel } from "../../../panels/TestClientWebviewPanel";
import { pickService } from "../../../tree/service/pickService";
import { createWebPubSubAPIClient, localize } from "../../../utils";

export async function testClient(extensionUri: Uri, actionContext: IActionContext, node?: ServiceItem): Promise<void> {
    const { subscription, service } = node ?? await pickService(actionContext, {
        title: localize('startTestClient', 'Start Test Client'),
    });
    const managementClient = await createWebPubSubAPIClient(actionContext, subscription);
    TestClientWebviewPanel.render(extensionUri, service, managementClient);
}
