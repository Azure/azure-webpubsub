/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type WebPubSubManagementClient } from "@azure/arm-webpubsub";
import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { createEndpointFromHostName, createTerminalForTunnel, localize } from "../../../utils";
import { type IPickHubSettingContext} from "src/workflows/common/contexts";
import { type ICreateOrUpdateHubSettingContext } from "src/workflows/common/contexts";
import * as vscode from "vscode";
import { LOCAL_TUNNEL_INSTALL_OR_UPDATE_COMMAND, LOCAL_TUNNEL_TYPICAL_EVENT_HANDLER, NODEJS_DOWNLOAD_URL, NO_LABEL, YES_LABEL } from "../../../constants";
import { inputUserEvents, selectSystemEvents } from "../common/InputEventHandlerStep";

export class AttachLocalTunnelStep extends AzureWizardExecuteStep<IPickHubSettingContext> {
    public priority: number = 135;

    constructor(private readonly client: WebPubSubManagementClient) { super(); }

    public async execute(context: IPickHubSettingContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        if (!context.subscription || !context.serviceName || !context.resourceGroupName || !context.hubName) {
            throw new Error(localize("invalidIPickHubSettingContext", "Invalid IPickHubSettingContext, subscription = {0}, serviceName = {1}, resourceGroupName = {2}, hubName = {3}",
            context.subscription?.subscriptionId, context.serviceName, context.resourceGroupName, context.hubName));
        }

        progress.report( { message: localize("retrievingInfoForTunnel", "Retrieving information for tunnel tool on hub setting {0}", context.hubName) });
        const resource = await this.client.webPubSub.get(context.resourceGroupName, context.serviceName);
        const hub = await this.client.webPubSubHubs.get(context.hubName, context.resourceGroupName, context.serviceName);

        // Step 1: Check if tunnel event handler exists. If not, add one
        if (hub.properties.eventHandlers?.filter(e => e.urlTemplate === LOCAL_TUNNEL_TYPICAL_EVENT_HANDLER.urlTemplate).length === 0) {
            const selection = await vscode.window.showInformationMessage(
                localize("askAddTunnelEventHandler", "Hub {0} doesn't have a tunnel-enabled event handler. Do you want to add one?", hub.name),
                ...[ YES_LABEL, NO_LABEL ]
            );
            if (selection === NO_LABEL) {
                // eslint-disable-next-line
                vscode.window.showInformationMessage(localize(`noEventHandlerForTunnel`, `Event handler for tunnel is NOT found on target hub setting.`));
                return ;
            }
            progress.report({ message: localize("configuringEventHandlerForTunnel", `Configuring event handler for tunnel tool on hub setting ${context.hubName}`)});
            const tunnelEventHandler = {
                urlTemplate: LOCAL_TUNNEL_TYPICAL_EVENT_HANDLER.urlTemplate,
                userEventPattern: await inputUserEvents(context.ui),
                systemEvents: await selectSystemEvents(context.ui)
            };
            const updatedEventHandlers = (hub.properties.eventHandlers ?? []).concat(tunnelEventHandler);
            progress.report({ message: localize("creatingEventHandlerForTunnel", `Creating event handler for tunnel tool on hub setting ${context.hubName}`)});
            await this.client.webPubSubHubs.beginCreateOrUpdateAndWait(context.hubName, context.resourceGroupName, context.serviceName, 
                {
                properties: {
                    eventHandlers: updatedEventHandlers,
                }
            });
        }

        // Step 2: decide use connection string or credential
        const tunnelOptionalParameter = { connectionString: "", endpoint: "" };
        if (!resource.disableLocalAuth) {
            progress.report({ message: localize(`retrievingConnectionString`, `Retrieving connection string, please wait...`)});
            const connString = (await this.client.webPubSub.listKeys(context.resourceGroupName, context.serviceName)).primaryConnectionString;
            if (!connString) {
                throw new Error(localize(`noConnectionString`, `No connection string found for service {0}`, context.serviceName));
            }
            tunnelOptionalParameter.connectionString = connString;
        }
        else {
            // eslint-disable-next-line
            vscode.window.showInformationMessage(localize(`confirmLocalTunnelAad`, `You have disabled access key. The tool will use Azure Identity.`));
            tunnelOptionalParameter.endpoint = createEndpointFromHostName(resource.hostName!);
        }

        // Step 3: create a new terminal to run tunnel tool. If exists, dispose the old one.
        const terminal = createTerminalForTunnel(context.serviceName, context.hubName, true);

        // Step 4: run the tunnel tool command
        const upstreamPort = await context.ui.showInputBox({ 
            prompt: localize(`inputUpstreamPort`, `Please input the port number of the upstream server`), 
            value: "3000", 
            validateInput: (value: string) => Number(value).toString() !== value ? localize(`invalidPortNumber`, `The port number should be a valid port number.`) : ""
        });
        const runTunnelCommand = getLocalTunnelParameterCommand(Number(upstreamPort), context.subscription.subscriptionId, context.resourceGroupName, context.hubName, tunnelOptionalParameter.connectionString, tunnelOptionalParameter.endpoint);
        terminal.sendText(`node -e "${LOCAL_TUNNEL_INSTALL_OR_UPDATE_COMMAND}"`)
        terminal.sendText(runTunnelCommand);
        progress.report({ message: localize(`runningTunnelTool`, `Running tunnel tool. Please ensure Node.js is available in your terminal environment. If not, install Node.js from ${NODEJS_DOWNLOAD_URL}`)});

        // Step 5: ask user if open the tunnel portal
        const selection = await vscode.window.showInformationMessage(
            localize("promptOpenTunnelPortal", "After the local tunnel is started, you could click the button below to open its Web portal"),
            ...[ localize("openTunnel", "Open Local Tunnel Portal"), localize("ignore", "Ignore") ]
        );
        if (selection === localize("openTunnel", "Open Local Tunnel Portal")) {
            await vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${(Number(upstreamPort) ?? 3000) + 1000}`));
        }
    }

    public shouldExecute(_context: ICreateOrUpdateHubSettingContext): boolean { return true; }
}

function getLocalTunnelParameterCommand(upstreamPort: number, subscriptionId: string, resourceGroup: string, hubName: string, connectionString?: string, endpoint?: string): string {
    if (connectionString && endpoint || !connectionString && !endpoint) throw new Error("Either connectionString or endpoint should be provided.");
    const baseCommand = `awps-tunnel run --hub "${hubName}" --subscription "${subscriptionId}" --resourceGroup "${resourceGroup}" --upstream "http://localhost:${upstreamPort}"`;
    const suffixCommand = connectionString ? `--connection "${connectionString}"` : (`--endpoint "${endpoint}"`);
    return `${baseCommand} ${suffixCommand}`;
}
