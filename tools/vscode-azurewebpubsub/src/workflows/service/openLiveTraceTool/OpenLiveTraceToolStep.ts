/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type IPickServiceContext } from "src/workflows/common/contexts";
import * as vscode from 'vscode';
import { createAzureApiClient, createEndpointFromHostName, localize } from '../../../utils';
import * as jwt from "jsonwebtoken";
import { LIVE_TRACE_HELP_LINK } from "../../../constants";

export class OpenLiveTraceToolStep extends AzureWizardExecuteStep<IPickServiceContext> {
    public priority: number = 110;

    public async execute(context: IPickServiceContext, progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        if (!context.serviceName || !context.resourceGroupName || !context.subscription) {
            throw new Error(localize('invalidIPickServiceContext', `Invalid IPickService Context, subscription {0}, service name {1}, resource group {2}`, context.subscription?.subscriptionId, context.serviceName, context.resourceGroupName));
        }

        const client = await createAzureApiClient([context, context.subscription]);
        progress.report({ message: localize('openingLiveTraceTool', 'Opening LiveTrace Tool, please wait...') });

        const resource = (await (client.webPubSub.get(context.resourceGroupName, context.serviceName)));
        if (!resource.hostName) {
            throw new Error(localize('invalidResource', `Invalid resource, hostName {0}`, resource.hostName));
        }

        const endpoint = createEndpointFromHostName(resource.hostName);
        const authType = resource.disableLocalAuth ? "aad" : "key";
        let token: string | undefined;

        if (authType === "aad") {
            await vscode.window.showInformationMessage(localize(
                "unableViewLiveTrace",
                `You have disabled access key and using Azure Entra ID to access Live Trace Tool.`
                + `\nMake sure you have added correct role assignment. Visit ${LIVE_TRACE_HELP_LINK} for detail.`
            ), localize("ok", "Ok"));
        }
        else {
            const primaryKey = (await (client.webPubSub.listKeys(context.resourceGroupName, context.serviceName))).primaryKey;
            if (!primaryKey) throw new Error(localize(`invalidPrimaryKey`, `Invalid primary key, key {0}`, primaryKey));
            // eslint-disable-next-line
            token = jwt.sign({}, primaryKey, { audience: `${endpoint}/livetrace`, expiresIn: "2h", algorithm: "HS256" });
        }
        // eslint-disable-next-line
        await vscode.env.openExternal(createLiveTraceToolUrl(authType, resource.location, endpoint, token) as any);
    }

    public shouldExecute(_context: IPickServiceContext): boolean { return true; }
}


function createLiveTraceToolUrl(authType: "key" | "aad", location: string, endpoint: string, accessToken?: string): string {
    const liveTraceHost = `${location}.livetrace.webpubsub.azure.com`;
    const state = {
        negotiation: { "url": `${endpoint}/livetrace`, "accessToken": accessToken ?? null },
        serviceType: "wps",
        authType: authType
    };
    return `https://${liveTraceHost}?state=${encodeURIComponent(JSON.stringify(state))}`;
    // Example: https://eastus.livetrace.webpubsub.azure.com/?state={"negotiation":{"url":"https://abcdef.webpubsub.azure.com/livetrace","accessToken":"a.b.c"},"serviceType":"wps","authType":"key"}
}