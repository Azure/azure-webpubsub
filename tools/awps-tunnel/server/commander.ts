import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createServer } from "http";
import path from "path";
import { DataHub } from "./dataHub";
import { HttpServerProxy } from "./serverProxies";
import { ConnectionStatus, ConnectionStatusPairs, HttpHistoryItem, ServiceConfiguration } from "../client/src/models";
import { logger } from "./logger";
import fs from "fs";

import { Command, program } from "commander";
import { DefaultAzureCredential } from "@azure/identity";

import packageJson from "./package.json";
const name = packageJson["cli-name"];

interface Settings {
  WebPubSub: {
    Endpoint?: string;
    Hub?: string;
    Upstream?: string;
    SubscriptionId?: string;
    ResourceGroup?: string;
  };
}

interface CommandLineArgs {
  endpoint?: string;
  hub?: string;
  upstream?: string;
  subscription?: string;
  resourceGroup?: string;
}

export function getCommand(appConfigPath: string, dbFile: string): Command {
  const settings: Settings = fs.existsSync(appConfigPath) ? (JSON.parse(fs.readFileSync(appConfigPath, "utf-8")) as Settings) : { WebPubSub: {} };

  program.name(name).version(packageJson.version).description(packageJson.description);
  program.command("status").action(() => createStatusAction(settings));
  const bind = program.command("bind");
  bind
    .option("-e, --endpoint <endpoint>", "Sepcify the Web PubSub service endpoint URL to connect to")
    .option("--hub <hub>", "Specify the hub to connect to")
    .option("-u, --upstream <upstream>", "Specify the upstream URL to connect to")
    .option("-s, --subscription <subscription>", "Specify the subscriptionId your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you")
    .option(
      "-g, --resourceGroup <resourceGroup>",
      "Specify the resource group your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you",
    )
    .action((update) =>
      createBindAction(bind, settings, update, (updatedSettings) => {
        fs.writeFileSync(appConfigPath, JSON.stringify(updatedSettings, null, 2));
        console.log(`Settings stored to ${appConfigPath}`);
        print(updatedSettings);
      }),
    );

  const run = program.command("run");
  run
    .option(
      "-e, --endpoint <endpoint>",
      "Sepcify the Web PubSub service endpoint URL to connect to, you don't need to set it if WebPubSubConnectionString environment variable is set. If both are set, this option will be used.",
    )
    .option("--hub <hub>", "Specify the hub to connect to")
    .option("-u, --upstream <upstream>", "Specify the upstream URL to redirect traffic to")
    .option("-s, --subscription <subscription>", "Specify the subscriptionId your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you")
    .option(
      "-g, --resourceGroup <resourceGroup>",
      "Specify the resource group your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you",
    )
    .action((updated) => {
      createRunCommand(run, dbFile, settings, updated);
    });
  program.addHelpText("after", `You could also set WebPubSubConnectionString environment variable if you don't want to configure endpoint.`);
  return program;
}

function print(settings: Settings) {
  console.log(`Current Web PubSub service endpoint: ${settings?.WebPubSub?.Endpoint ?? "<Not binded>"}`);
  console.log(`Current hub: ${settings?.WebPubSub?.Hub ?? "<Not binded>"}`);
  console.log(`Current upstream: ${settings?.WebPubSub?.Upstream ?? "<Not binded>"}`);
  console.log(`Current subscription Id: ${settings?.WebPubSub?.SubscriptionId ?? "<Not binded>"}`);
  console.log(`Current resource group: ${settings?.WebPubSub?.ResourceGroup ?? "<Not binded>"}`);
}

function createStatusAction(settings: Settings) {
  print(settings);
  console.log(`Use ${name} bind to set/reset the settings.`);
}

function createBindAction(bind: Command, settings: Settings, updated: CommandLineArgs, onDone: (updatedSettings: Settings) => void) {
  const endpoint = updated.endpoint;
  const hub = updated.hub;
  const upstream = updated.upstream;
  const subscription = updated.subscription;
  const resourceGroup = updated.resourceGroup;
  if (!endpoint && !hub && !upstream && !subscription && !resourceGroup) {
    console.error("Error: none of --endpoint|--hub|--upstream|--subscription|--resourceGroup is specified.");
    bind.outputHelp();
    return;
  }
  if (endpoint) {
    if (validateEndpoint(endpoint)) {
      settings.WebPubSub.Endpoint = endpoint;
    } else {
      console.error(`Error: binding to invalid endpoint: ${endpoint}`);
      return;
    }
  }
  if (upstream) {
    if (validateEndpoint(upstream)) {
      settings.WebPubSub.Upstream = upstream;
    } else {
      console.error(`Error: binding to invalid upstream: ${upstream}`);
      return;
    }
  }
  if (hub) {
    settings.WebPubSub.Hub = hub;
  }
  if (subscription) {
    settings.WebPubSub.SubscriptionId = subscription;
  }
  if (resourceGroup) {
    settings.WebPubSub.ResourceGroup = resourceGroup;
  }
  onDone(settings);
}

async function reportServiceConfigurations(dataHub: DataHub, subscriptionId: string | undefined, resourceGroup: string | undefined, endpoint: URL, hub: string) {
  const config = await loadHubSettings(subscriptionId, resourceGroup, endpoint, hub);
  dataHub.ReportServiceConfiguration(config);
}

async function loadHubSettings(subscriptionId: string | undefined, resourceGroup: string | undefined, endpoint: URL, hub: string): Promise<ServiceConfiguration> {
  let message = "";
  let resourceName = "";
  let eventHandlers = [];
  if (subscriptionId && resourceGroup) {
    resourceName = endpoint.hostname.split(".")[0];
    if (!resourceName) {
      message = `Unable to get valid resource name from endpoint ${endpoint}, skip fetching hub settings.`;
      console.warn(message);
    } else {
      // use DefaultAzureCredential to connect to the control plane
      const { WebPubSubManagementClient } = require("@azure/arm-webpubsub");
      const { DefaultAzureCredential } = require("@azure/identity");
      const client = new WebPubSubManagementClient(new DefaultAzureCredential(), subscriptionId);
      const result = await client.webPubSubHubs.get(hub, resourceGroup, resourceName);
      if (result.statusCode >= 400) {
        message = `Failed to fetch hub settings: ${result.code} ${result.code} ${result.details.error.message}`;
        console.warn(message);
      }
      eventHandlers = result.properties.eventHandlers;
    }
  } else {
    message = `Unable to fetch hub settings: subscriptionId and resourceGroup are not specified. You can use options '-s <subscriptionId> -g <resourceGroup>' to set them or call '${name} bind -s <subscriptionId> -g <resourceGroup>' to bind the values.}`;
    console.warn(message);
  }

  return {message, eventHandlers, subscriptionId, resourceGroup, resourceName, loaded: true};
}

function createRunCommand(run: Command, dbFile: string, settings: Settings, updated: CommandLineArgs) {
  const endpoint = updated.endpoint;
  const hub = updated.hub;
  const upstream = updated.upstream;
  const subscription = updated.subscription ?? settings.WebPubSub.SubscriptionId;
  const resourceGroup = updated.resourceGroup ?? settings.WebPubSub.ResourceGroup;

  let currentUpstream = settings.WebPubSub.Upstream;
  if (upstream) {
    if (!validateEndpoint(upstream)) {
      console.error(`Error: invalid upstream: ${upstream}`);
      return;
    }
    currentUpstream = upstream;
  }
  if (!currentUpstream) {
    console.error(`Error: upstream is not specified.`);
    run.outputHelp();
    return;
  }

  const currentHub = hub ?? settings.WebPubSub.Hub;
  if (!currentHub) {
    console.error(`Error: hub is not specified.`);
    run.outputHelp();
    return;
  }

  const connectionString = process.env.WebPubSubConnectionString;
  // endpoint > connectionString > settings.WebPubSub.Endpoint
  let currentEndpoint = connectionString ? undefined : settings.WebPubSub.Endpoint;
  if (endpoint) {
    if (!validateEndpoint(endpoint)) {
      console.error(`Error: invalid endpoint: ${endpoint}`);
      return;
    }

    currentEndpoint = endpoint;
  }
  start(run, dbFile, connectionString, currentEndpoint, currentHub, currentUpstream, subscription, resourceGroup);
}

function start(run: Command, dbFile: string, connectionString: string | undefined, endpoint: string | undefined, hub: string, upstreamUrl: string, subscription?: string, resourceGroup?: string) {
  if (!connectionString && !endpoint) {
    console.error(`Error: neither WebPubSubConnectionString env is set nor endpoint is not specified.`);
    run.outputHelp();
    return;
  }

  let tunnel: HttpServerProxy;
  if (connectionString) {
    console.log(`Using endpoint and credential from WebPubSubConnectionString env.`);
    tunnel = HttpServerProxy.fromConnectionString(connectionString, hub, { target: upstreamUrl });
  } else {
    console.log(`Using endpoint ${endpoint} from settings. Please make sure the Access Policy is correctly configured to allow your access.`);
    tunnel = new HttpServerProxy(endpoint!, new DefaultAzureCredential(), hub, { target: upstreamUrl });
  }

  loadHubSettings(subscription, resourceGroup, new URL(tunnel.endpoint), tunnel.hub);

  const app = express();
  const server = createServer(app);
  console.log(`Connect to ${tunnel.endpoint}, hub: ${tunnel.hub}, upstream: ${upstreamUrl}`);
  const dataHub = new DataHub(server, tunnel, upstreamUrl, dbFile);
  dataHub.ReportStatusChange(ConnectionStatus.Connecting);
  tunnel
    .runAsync({
      handleProxiedRequest: async (request, time, proxiedUrl, invoke) => {
        const item: HttpHistoryItem = {
          methodName: request.HttpMethod,
          url: proxiedUrl.toString(),
          requestRaw: dumpRawRequest(request),
          requestAtOffset: time,
          unread: true,
        };
        dataHub.AddTraffic(item);
        const response = await invoke();
        logger.info(`Success on getting proxy response ${proxiedUrl}: ${response.StatusCode}`);
        if (response.StatusCode < 400) {
          dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPairs.Connected);
        } else {
          dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPairs.ErrorResponse);
        }
        item.code = response.StatusCode;
        item.responseRaw = getRawResponse(response);
        dataHub.UpdateTraffic(item);
        return response;
      },
    })
    .then(() => {
      dataHub.ReportStatusChange(ConnectionStatus.Connected);
    })
    .catch((err) => {
      logger.error(`Error on tunnel connection: ${err}`);
      dataHub.ReportStatusChange(ConnectionStatus.Disconnected);
    });

  const upstream = new URL(upstreamUrl);
  const upstreamPort = parseInt(upstream.port) ?? 7888;
  const port = process.env.AWPS_TUNNEL_SERVER_PORT || upstreamPort + 1000;

  app.use(express.static(path.join(__dirname, "../client/build")));
  server.listen(port, () => {
    console.log(`Open webview at: http://localhost:${port}`);
  });
}

function dumpRawRequest(message: { Url: string; HttpMethod: string; Headers?: Record<string, string[]>; Content?: Uint8Array }): string {
  const headers = message.Headers
    ? Object.entries(message.Headers)
        .map(([name, values]) => values.map((value) => `${name}: ${value}`).join("\r\n"))
        .join("\r\n")
    : "";

  const content = message.Content ? new TextDecoder().decode(message.Content) : "";

  return `${message.HttpMethod} ${message.Url} HTTP/1.1\r\n${headers}\r\n\r\n${content}`;
}

function getRawResponse(message: { StatusCode: number; Headers: Record<string, string[]>; Content: Uint8Array }) {
  const headers = message.Headers
    ? Object.entries(message.Headers)
        .map(([name, values]) => values.map((value) => `${name}: ${value}`).join("\r\n"))
        .join("\r\n")
    : "";

  const content = message.Content ? new TextDecoder().decode(message.Content) : "";
  return `HTTP/1.1 ${message.StatusCode}\r\n${headers}\r\n\r\n${content}`;
}

function validateEndpoint(endpoint: string) {
  try {
    new URL(endpoint);
    return true;
  } catch (e) {
    return false;
  }
}
