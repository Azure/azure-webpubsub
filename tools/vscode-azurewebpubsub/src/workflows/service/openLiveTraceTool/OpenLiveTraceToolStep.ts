/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import  { type IPickServiceContext } from "src/workflows/common/contexts";
import * as vscode from 'vscode';
import { createAzureApiClient, createEndpointFromHostName, localize } from '../../../utils';
import * as jwt from "jsonwebtoken";

export class OpenLiveTraceToolStep extends AzureWizardExecuteStep<IPickServiceContext> {
    public priority: number = 110;

    public async execute(context: IPickServiceContext, progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        if (!context.serviceName || !context.resourceGroupName || !context.subscription) {
            throw new Error(localize('invalidIPickServiceContext', `Invalid IPickService Context, subscription {0}, service name {1}, resource group {2}`, context.subscription?.subscriptionId, context.serviceName, context.resourceGroupName));
        }

        const client = await createAzureApiClient([context, context.subscription]);
        progress.report({ message: localize('openingLiveTraceTool', 'Opening LiveTrace Tool, please wait...') });

        const resource = (await (client.webPubSub.get(context.resourceGroupName, context.serviceName)));
        const keys = await (client.webPubSub.listKeys(context.resourceGroupName, context.serviceName));
        if (!resource.hostName) {
            throw new Error(localize('invalidResource', `Invalid resource, hostName {0}`, resource.hostName));
        }
        const endpoint = createEndpointFromHostName(resource.hostName);
        /* eslint-disable */
        const accessToken = jwt.sign({}, keys.primaryKey, {
            audience: `${endpoint}/livetrace`,
            expiresIn: "2h",
            algorithm: "HS256",
        });
        await vscode.env.openExternal(createLiveTraceToolUrl(resource.location, endpoint, accessToken as string) as any);
        /* eslint-enable */
    }

    public shouldExecute(_context: IPickServiceContext): boolean { return true; }
}


function createLiveTraceToolUrl(location: string, endpoint: string, accessToken: string): string {
    const liveTraceHost = `${location}.livetrace.webpubsub.azure.com`;
    const state = {
        negotiation: { "url": `${endpoint}/livetrace`, "accessToken": accessToken },
        serviceType: "wps",
        authType: "key"
    };
    return `https://${liveTraceHost}?state=${encodeURIComponent(JSON.stringify(state))}`;
    // Example: https://eastus.livetrace.webpubsub.azure.com/?state={"negotiation":{"url":"https://abcdef.webpubsub.azure.com/livetrace","accessToken":"a.b.c"},"serviceType":"wps","authType":"key"}
}
