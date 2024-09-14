import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createServer } from "http";
import path from "path";
import { DataHub } from "./dataHub";
import { HttpServerProxy } from "./serverProxies";
import { ConnectionStatus, ConnectionStatusPairs, EventHandlerSetting, HttpHistoryItem, ServiceConfiguration } from "../client/src/models";
import { printer, setLogLevel } from "./output";
import { WebPubSubManagementClient } from "@azure/arm-webpubsub";
import fs from "fs";

import { Command, program } from "commander";
import { AzureCliCredential, ChainedTokenCredential, EnvironmentCredential, ManagedIdentityCredential, AzurePowerShellCredential } from "@azure/identity";
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
    WebviewPort?: string;
    WebviewHost?: string;
  };
}

interface BindCommandLineArgs {
  endpoint?: string | boolean;
  hub?: string | boolean;
  upstream?: string | boolean;
  subscription?: string | boolean;
  resourceGroup?: string | boolean;
  webviewPort?: string | boolean;
  webviewHost?: string | boolean;
}

interface RunCommandLineArgs {
  verbose?: boolean;
  endpoint?: string;
  hub?: string;
  upstream?: string;
  subscription?: string;
  resourceGroup?: string;
  webviewPort?: string;
  webviewHost?: string;
  noWebview?: boolean;
  connection?: string;
}

export function getCommand(appConfigPath: string, dbFile: string): Command {
  function configureHelpOptions(command: Command): Command {
    const helpText = "Show help details.";
    command.helpOption("-h, --help", helpText);
    return command;
  }
  const settings: Settings = fs.existsSync(appConfigPath) ? (JSON.parse(fs.readFileSync(appConfigPath, "utf-8")) as Settings) : { WebPubSub: {} };

  program.name(name).version(packageJson.version, "-v, --version", "Show the version number.").description(packageJson.description);
  const status = program
    .command("status")
    .description("Show the current configuration status.")
    .action(() => createStatusAction(settings));
  configureHelpOptions(status);
  const bind = program.command("bind").description("Bind configurations to the tool so that you don't need to specify them every time running the tool.");
  bind
    .option("-e, --endpoint [endpoint]", "Sepcify the Web PubSub service endpoint URL to connect to.")
    .option("--hub [hub]", "Specify the hub to connect to.")
    .option("-u, --upstream [upstream]", "Specify the upstream URL to connect to, URL scheme could be ommited, defaults to http, e.g. localhost:3000 or https://localhost:5001.")
    .option("--webviewPort [webviewPort]", "Specify the webview port to use. If not specified, it defaults to [upstreamPort+1000].")
    .option("--webviewHost [webviewHost]", "Specify the webview hostname to use. If not specified, it defaults to 127.0.0.1.")
    .option("-s, --subscription [subscription]", "Specify the subscriptionId your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you.")
    .option(
      "-g, --resourceGroup [resourceGroup]",
      "Specify the resource group your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you.",
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
    .option(
      "-c, --connection [connection]",
      "Specify the Web PubSub service connection string to connection to, this option overrides the --endpoint option or WebPubSubConnectionString environment variable.",
    )
    .option("--hub [hub]", "Specify the hub to connect to. If not specified, the hub value set with `awps-tunnel bind --hub [hub]` will be used.")
    .option(
      "-u, --upstream [upstream]",
      "Specify the upstream URL to connect to, URL scheme could be ommited, defaults to http, e.g. localhost:3000 or https://localhost:5001. If not specified, http://localhost:3000 will be used.",
    )
    .option("--webviewPort [webviewPort]", "Specify the webview port to use. If not specified, it defaults to [upstreamPort+1000].")
    .option("--webviewHost [webviewHost]", "Specify the webview hostname to use. If not specified, it defaults to 127.0.0.1.")
    .option("--noWebview", "Disable the webview")
    .option("-s, --subscription [subscription]", "Specify the subscriptionId your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you.")
    .option(
      "-g, --resourceGroup [resourceGroup]",
      "Specify the resource group your Web PubSub service belongs to. Specify subscriptionId and resource group to let the tool fetch hub settings for you.",
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
  printer.text(`Current Web PubSub service endpoint: ${settings?.WebPubSub?.Endpoint ?? "<Not binded>"}. Use 'awps-tunnel bind --endpoint [endpoint]' to bind the value.`);
  printer.text(`Current hub: ${settings?.WebPubSub?.Hub ?? "<Not binded>"}. Use 'awps-tunnel bind --hub [hub]' to bind the value.`);
  printer.text(`Current upstream: ${settings?.WebPubSub?.Upstream ?? "<Not binded>"}. Use 'awps-tunnel bind --upstream [upstream]' to bind the value.`);
  printer.text(`Current subscription Id: ${settings?.WebPubSub?.SubscriptionId ?? "<Not binded>. Use 'awps-tunnel bind -s [subscriptionId]' to bind the value."}`);
  printer.text(`Current resource group: ${settings?.WebPubSub?.ResourceGroup ?? "<Not binded>"}. Use 'awps-tunnel bind -g [resourceGroup]' to bind the value.`);
  printer.text(`Current webview port: ${settings?.WebPubSub?.WebviewPort ?? "<Not binded>"}. Use 'awps-tunnel bind --webviewPort [port]' to bind the value.`);
  printer.text(`Current webview hostname: ${settings?.WebPubSub?.WebviewHost ?? "<Not binded>"}. Use 'awps-tunnel bind --webviewHost [hostname]' to bind the value.`);
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
  const webviewPort = updated.webviewPort;
  const webviewHost = updated.webviewHost;
  if (!endpoint && !hub && !upstream && !subscription && !resourceGroup && !webviewHost && !webviewPort) {
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

  if (webviewHost) {
    if (webviewHost === true) {
      settings.WebPubSub.WebviewHost = undefined;
    } else {
      settings.WebPubSub.WebviewHost = webviewHost;
    }
  }

  if (webviewPort) {
    if (webviewPort === true) {
      settings.WebPubSub.WebviewPort = undefined;
    } else {
      settings.WebPubSub.WebviewPort = webviewPort;
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
      // connect to the control plane
      const client = new WebPubSubManagementClient(getCredential(), subscriptionId);
      try {
        const result = await client.webPubSubHubs.get(hub, resourceGroup, resourceName);
        eventHandlers = result.properties.eventHandlers?.map((s) => s as EventHandlerSetting);
      } catch (err) {
        message = `Failed to fetch hub settings: ${err}`;
        printer.warn(message);
      }
    }
  } else {
    message = `Unable to fetch hub settings: subscriptionId and resourceGroup are not specified. Use '-s <subscriptionId> -g <resourceGroup>' to set or call '${name} bind -s <subscriptionId> -g <resourceGroup>' to bind the values.`;
    printer.warn(message);
  }

  return { message, eventHandlers, subscriptionId, resourceGroup, resourceName, loaded: true };
}

function createRunCommand(run: Command, dbFile: string, settings: Settings, command: RunCommandLineArgs) {
  if (command.verbose) {
    printer.enableVerboseLogging();
    setLogLevel("verbose");
  } else {
    setLogLevel("info");
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

  // --connection > --endpoint > env WebPubSubConnectionString > binded settings.WebPubSub.Endpoint
  let connectionString: string | undefined = undefined;
  let endpoint: string | undefined = undefined;
  if (command.connection) {
    if (command.endpoint) {
      printer.warn(`Warning: both --connection and --endpoint are set, --connection will be used.`);
    } else {
      printer.status(`Using connection string specified using --connection.`);
    }
    connectionString = command.connection;
  } else {
    if (command.endpoint) {
      // override the endpoint value if it is set from the command directly
      if (!parseUrl(command.endpoint)) {
        printer.error(`Error: invalid endpoint: ${command.endpoint}`);
        return;
      }
      if (process.env.WebPubSubConnectionString) {
        printer.warn(`Warning: both --endpoint and env WebPubSubConnectionString are set, --endpoint will be used.`);
      } else {
        printer.status(`Using endpoint specified using --endpoint.`);
      }
      endpoint = command.endpoint;
    } else {
      connectionString = process.env.WebPubSubConnectionString;
      if (connectionString) {
        printer.status(`Using connection string from env WebPubSubConnectionString.`);
      } else {
        endpoint = settings.WebPubSub.Endpoint;
        if (endpoint) {
          printer.status(`Using endpoint ${endpoint} from binded settings. Please make sure the Access Policy is correctly configured to allow your access.`);
        } else {
          printer.error(`Error: SET WebPubSubConnectionString env or specify --endpoint <endpoint> or specify --connection <connectionString>`);
          run.outputHelp();
          return;
        }
      }
    }
  }

  let tunnel: HttpServerProxy;
  if (connectionString) {
    tunnel = HttpServerProxy.fromConnectionString(connectionString, hub, { target: currentUpstream });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    tunnel = new HttpServerProxy(endpoint!, getCredential(), hub, { target: currentUpstream });
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
      printer.error(`Error establishing tunnel connection: ${err}. Please make sure the Access Policy is correctly configured to allow your access.`);
      dataHub.ReportStatusChange(ConnectionStatus.Disconnected);
    });

  const upstreamPort = tryParseInt(upstream.port) ?? 80;
  if (!command.noWebview) {
    const webviewHost = command.webviewHost ?? settings.WebPubSub.WebviewHost ?? "127.0.0.1";
    const webviewPort = command.webviewPort ?? settings.WebPubSub.WebviewPort ?? process.env.AWPS_TUNNEL_SERVER_PORT;
    let port: number | undefined = upstreamPort + 1000;
    if (webviewPort) {
      port = tryParseInt(webviewPort);
      if (!port) {
        printer.error(`Error: invalid webview port: ${port}`);
        return;
      }
    }
    app.use(express.static(path.join(__dirname, "../client/build")));
    server
      .listen(port, webviewHost, () => {
        printer.text(`Open webview at: http://${webviewHost}:${port}`);
      })
      .on("error", (err) => {
        printer.error(`Error on starting webview server: ${err}`);
      });
  }
}

function getCredential() {
  return new ChainedTokenCredential(new AzureCliCredential(), new AzurePowerShellCredential(), new EnvironmentCredential(), new ManagedIdentityCredential());
}
