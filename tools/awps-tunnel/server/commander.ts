import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createServer } from "http";
import path from "path";
import { DataHub } from "./dataHub";
import { HttpServerProxy } from "./serverProxies";
import { ConnectionStatus, ConnectionStatusPairs, EventHandlerSetting, HttpHistoryItem, ServiceConfiguration } from "../client/src/models";
import { printer } from "./output";
import { WebPubSubManagementClient } from "@azure/arm-webpubsub";
import fs from "fs";

import { Command, program } from "commander";
import { DefaultAzureCredential } from "@azure/identity";
import { parseUrl, dumpRawRequest, getRawResponse, tryParseInt } from "./util";

import packageJson from "./package.json";
const name = packageJson["cli-name"];

interface Settings {
  WebPubSub: {
    Endpoint?: string;
    Hub?: string;
    Upstream?: string;
    SubscriptionId?: string;
    ResourceGroup?: string;
    WebViewUrl?: string;
  };
}

interface BindCommandLineArgs {
  endpoint?: string | boolean;
  hub?: string | boolean;
  upstream?: string | boolean;
  subscription?: string | boolean;
  resourceGroup?: string | boolean;
  webViewUrl?: string | boolean;
}

interface RunCommandLineArgs {
  verbose?: boolean;
  endpoint?: string;
  hub?: string;
  upstream?: string;
  subscription?: string;
  resourceGroup?: string;
  webViewUrl?: string;
  noWebView?: boolean;
}

export function getCommand(appConfigPath: string, dbFile: string): Command {
  function configureHelpOptions(command: Command): Command {
    const helpText = "Show help details.";
    command.helpOption("-h, --help", helpText);
    return command;
  }
  const settings: Settings = fs.existsSync(appConfigPath) ? (JSON.parse(fs.readFileSync(appConfigPath, "utf-8")) as Settings) : { WebPubSub: {} };

  program.name(name).version(packageJson.version, undefined, "Show the version number.").description(packageJson.description);
  const status = program
    .command("status")
    .description("Show the current configuration status.")
    .action(() => createStatusAction(settings));
  configureHelpOptions(status);
  const bind = program.command("bind").description("Bind configurations to the tool so that you don't need to specify them every time running the tool.");
  bind
    .option("-e, --endpoint [endpoint]", "Sepcify the Web PubSub service endpoint URL to connect to")
    .option("--hub [hub]", "Specify the hub to connect to")
    .option("-u, --upstream [upstream]", "Specify the upstream URL to connect to, URL scheme could be ommited, defaults to http, e.g. localhost:3000 or https://localhost:5001")
    .option(
      "--webViewUrl [webViewUrl]",
      "Specify the webview URL to open, URL scheme could be ommited, defaults to http, e.g. localhost:4000 or https://127.0.0.1:5001. If not specified, the default webview listens to http://0.0.0.0:[upstreamPort+1000]",
    )
    .option("-s, --subscription [subscription]", "Specify the subscriptionId your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you")
    .option(
      "-g, --resourceGroup [resourceGroup]",
      "Specify the resource group your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you",
    )
    .action((update) =>
      createBindAction(bind, settings, update, (updatedSettings) => {
        fs.writeFileSync(appConfigPath, JSON.stringify(updatedSettings, null, 2));
        printer.text(`Settings stored to ${appConfigPath}`);
        print(updatedSettings);
      }),
    );
  configureHelpOptions(bind);
  const run = program.command("run").description("Run the tool.");
  run
    .option(
      "-e, --endpoint [endpoint]",
      "Specify the Web PubSub service endpoint URL to connect to, you don't need to set it if WebPubSubConnectionString environment variable is set. If both are set, this option will be used.",
    )
    .option("--hub [hub]", "Specify the hub to connect to. If not specified, the hub value set with `awps-tunnel bind --hub [hub]` will be used.")
    .option(
      "-u, --upstream [upstream]",
      "Specify the upstream URL to connect to, URL scheme could be ommited, defaults to http, e.g. localhost:3000 or https://localhost:5001. If not specified, http://localhost:3000 will be used.",
    )
    .option(
      "--webViewUrl [webViewUrl]",
      "Specify the webview URL to open, URL scheme could be ommited, defaults to http, e.g. 0.0.0.0:4000 or https://0.0.0.0:5001. If not specified, the default webview listens to http://127.0.0.1:[upstreamPort+1000]",
    )
    .option("--noWebView", "Disable the webview")
    .option("-s, --subscription [subscription]", "Specify the subscriptionId your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you")
    .option(
      "-g, --resourceGroup [resourceGroup]",
      "Specify the resource group your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you",
    )
    .option("--verbose", "Enable verbose logs")
    .action((updated) => {
      createRunCommand(run, dbFile, settings, updated);
    });
  configureHelpOptions(run);
  configureHelpOptions(program);
  program.addHelpCommand(true, "Display help details for subcommand.");
  program.addHelpText("after", `\nYou could also set WebPubSubConnectionString environment variable if you don't want to configure endpoint.`);
  return program;
}

function print(settings: Settings) {
  printer.text(`Current Web PubSub service endpoint: ${settings?.WebPubSub?.Endpoint ?? "<Not binded>"}`);
  printer.text(`Current hub: ${settings?.WebPubSub?.Hub ?? "<Not binded>"}`);
  printer.text(`Current upstream: ${settings?.WebPubSub?.Upstream ?? "<Not binded>"}`);
  printer.text(`Current subscription Id: ${settings?.WebPubSub?.SubscriptionId ?? "<Not binded>"}`);
  printer.text(`Current resource group: ${settings?.WebPubSub?.ResourceGroup ?? "<Not binded>"}`);
  printer.text(`Current webview URL: ${settings?.WebPubSub?.WebViewUrl ?? "<Not binded>"}`);
}

function createStatusAction(settings: Settings) {
  print(settings);
  printer.suggestions(`Use ${name} bind to set/reset the settings.`);
}

function createBindAction(bind: Command, settings: Settings, updated: BindCommandLineArgs, onDone: (updatedSettings: Settings) => void) {
  const endpoint = updated.endpoint;
  const hub = updated.hub;
  const upstream = updated.upstream;
  const subscription = updated.subscription;
  const resourceGroup = updated.resourceGroup;
  const webViewUrl = updated.webViewUrl;
  if (!endpoint && !hub && !upstream && !subscription && !resourceGroup && !webViewUrl) {
    printer.error("Error: Please specify at least one option to bind.");
    bind.outputHelp();
    return;
  }
  if (endpoint) {
    if (endpoint === true) {
      // the option to clear the endpoint
      settings.WebPubSub.Endpoint = undefined;
    } else {
      const parsed = parseUrl(endpoint, "https");
      if (!parsed) {
        printer.error(`Error: binding to invalid endpoint: ${endpoint}`);
        return;
      }
      settings.WebPubSub.Endpoint = parsed.toString();
    }
  }
  if (upstream) {
    if (upstream === true) {
      settings.WebPubSub.Upstream = undefined;
    } else {
      const parsed = parseUrl(upstream, "http");
      if (!parsed) {
        printer.error(`Error: binding to invalid upstream: ${upstream}`);
        return;
      }
      settings.WebPubSub.Upstream = parsed.toString();
    }
  }

  if (webViewUrl) {
    if (webViewUrl === true) {
      settings.WebPubSub.WebViewUrl = undefined;
    } else {
      const parsed = parseUrl(webViewUrl, "http");
      if (!parsed) {
        printer.error(`Error: binding to invalid webview URL: ${webViewUrl}`);
        return;
      }
      settings.WebPubSub.WebViewUrl = parsed.toString();
    }
  }

  if (hub) {
    settings.WebPubSub.Hub = hub === true ? undefined : hub;
  }
  if (subscription) {
    settings.WebPubSub.SubscriptionId = subscription === true ? undefined : subscription;
  }
  if (resourceGroup) {
    settings.WebPubSub.ResourceGroup = resourceGroup === true ? undefined : resourceGroup;
  }
  onDone(settings);
}

async function reportServiceConfiguration(dataHub: DataHub, subscriptionId: string | undefined, resourceGroup: string | undefined, endpoint: URL, hub: string) {
  const config = await loadHubSettings(subscriptionId, resourceGroup, endpoint, hub);
  dataHub.ReportServiceConfiguration(config);
}

async function loadHubSettings(subscriptionId: string | undefined, resourceGroup: string | undefined, endpoint: URL, hub: string): Promise<ServiceConfiguration> {
  let message = "";
  let resourceName = "";
  let eventHandlers: EventHandlerSetting[] | undefined = [];
  if (subscriptionId && resourceGroup) {
    resourceName = endpoint.hostname.split(".")[0];
    if (!resourceName) {
      message = `Unable to get valid resource name from endpoint ${endpoint}, skip fetching hub settings.`;
      printer.warn(message);
    } else {
      // use DefaultAzureCredential to connect to the control plane
      const client = new WebPubSubManagementClient(new DefaultAzureCredential(), subscriptionId);
      try {
        const result = await client.webPubSubHubs.get(hub, resourceGroup, resourceName);
        eventHandlers = result.properties.eventHandlers?.map((s) => s as EventHandlerSetting);
      } catch (err) {
        message = `Failed to fetch hub settings: ${err}`;
        printer.warn(message);
      }
    }
  } else {
    message = `Unable to fetch hub settings: subscriptionId and resourceGroup are not specified. You can use options '-s <subscriptionId> -g <resourceGroup>' to set them or call '${name} bind -s <subscriptionId> -g <resourceGroup>' to bind the values.}`;
    printer.warn(message);
  }

  return { message, eventHandlers, subscriptionId, resourceGroup, resourceName, loaded: true };
}

function createRunCommand(run: Command, dbFile: string, settings: Settings, command: RunCommandLineArgs) {
  if (command.verbose) {
    printer.enableVerboseLogging();
  }

  const hub = command.hub ?? settings.WebPubSub.Hub;
  if (!hub) {
    printer.error(`Error: hub is neither specified nor binded. Use --hub to specify the hub.`);
    run.outputHelp();
    return;
  }

  const subscription = command.subscription ?? settings.WebPubSub.SubscriptionId;
  const resourceGroup = command.resourceGroup ?? settings.WebPubSub.ResourceGroup;

  let currentUpstream = command.upstream ?? settings.WebPubSub.Upstream;
  let upstream: URL;
  if (currentUpstream) {
    const parsed = parseUrl(currentUpstream, "http");
    if (!parsed) {
      printer.error(`Error: invalid upstream: ${currentUpstream}. Use -u|--upstream to specify the upstream URL.`);
      return;
    }
    upstream = parsed;
  } else {
    printer.status(`Upstream is not specified. http://localhost:3000 is used as the default upstream value. Use -u|--upstream to specify the upstream URL.`);
    currentUpstream = "http://localhost:3000";
    upstream = new URL(currentUpstream);
  }

  const connectionString = process.env.WebPubSubConnectionString;
  // endpoint > connectionString > settings.WebPubSub.Endpoint
  let endpoint = connectionString ? undefined : settings.WebPubSub.Endpoint;
  if (command.endpoint) {
    // override the endpoint value if it is set from the command directly
    if (!parseUrl(command.endpoint)) {
      printer.error(`Error: invalid endpoint: ${command.endpoint}`);
      return;
    }

    endpoint = command.endpoint;
  }

  if (!connectionString && !endpoint) {
    printer.error(`Error: neither WebPubSubConnectionString env is set nor endpoint is not specified.`);
    run.outputHelp();
    return;
  }

  let tunnel: HttpServerProxy;
  if (connectionString) {
    printer.status(`Using endpoint and credential from WebPubSubConnectionString env.`);
    tunnel = HttpServerProxy.fromConnectionString(connectionString, hub, { target: currentUpstream });
  } else {
    printer.status(`Using endpoint ${endpoint} from settings. Please make sure the Access Policy is correctly configured to allow your access.`);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    tunnel = new HttpServerProxy(endpoint!, new DefaultAzureCredential(), hub, { target: currentUpstream });
  }

  const app = express();
  const server = createServer(app);
  printer.status(`Connecting to ${tunnel.endpoint}, hub: ${tunnel.hub}, upstream: ${currentUpstream}`);
  const dataHub = new DataHub(server, tunnel, upstream, dbFile);
  dataHub.ReportStatusChange(ConnectionStatus.Connecting);

  reportServiceConfiguration(dataHub, subscription, resourceGroup, new URL(tunnel.endpoint), tunnel.hub);

  tunnel
    .runAsync({
      handleProxiedRequest: async (request, time, proxiedUrl, invoke) => {
        const item: HttpHistoryItem = {
          methodName: request.HttpMethod,
          url: proxiedUrl.toString(),
          requestRaw: dumpRawRequest(proxiedUrl, request),
          requestAtOffset: time,
          unread: true,
        };
        await dataHub.AddTraffic(item);
        printer.log(`[${new Date(time).toISOString()}]Proxy request to ${proxiedUrl.toString()}`);
        const response = await invoke();
        printer.log(`[${new Date().toISOString()}]Get response ${proxiedUrl}: ${response.StatusCode}`);
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
      printer.status(`Established tunnel connection ${tunnel.id}.`);
      dataHub.ReportStatusChange(ConnectionStatus.Connected);
    })
    .catch((err) => {
      printer.error(`Error on tunnel connection: ${err}`);
      dataHub.ReportStatusChange(ConnectionStatus.Disconnected);
    });

  const upstreamPort = tryParseInt(upstream.port) ?? 80;
  if (!command.noWebView) {
    let webViewPort = tryParseInt(process.env.AWPS_TUNNEL_SERVER_PORT) || upstreamPort + 1000;
    let webViewHostName = "127.0.0.1";
    const webViewUrl = command.webViewUrl ?? settings.WebPubSub.WebViewUrl;
    if (webViewUrl) {
      const parsed = parseUrl(webViewUrl, "http");
      if (!parsed) {
        printer.error(`Error: invalid webview URL: ${webViewUrl}`);
        return;
      }
      webViewPort = tryParseInt(parsed.port) ?? webViewPort;
      webViewHostName = parsed.hostname;
    }
    app.use(express.static(path.join(__dirname, "../client/build")));
    server
      .listen(webViewPort, webViewHostName, () => {
        printer.text(`Open webview at: http://${webViewHostName}:${webViewPort}`);
      })
      .on("error", (err) => {
        printer.error(`Error on starting webview server: ${err}`);
      });
  }
}
