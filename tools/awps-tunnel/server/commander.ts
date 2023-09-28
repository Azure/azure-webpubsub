import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createServer } from "http";
import path from "path";
import { DataHub } from "./dataHub";
import { HttpServerProxy } from "./serverProxies";
import { ConnectionStatus, ConnectionStatusPairs } from "../client/src/models";
import { logger } from "./logger";
import fs from "fs";

import { Command, program } from "commander";
import { DefaultAzureCredential } from "@azure/identity";

import packageJson from "./package.json";
import { TunnelIncomingMessage, TunnelOutgoingMessage } from "../../../sdk/server-proxies/src/tunnels/TunnelConnection";
const name = packageJson["cli-name"];

interface Settings {
  WebPubSub: {
    Endpoint?: string;
    Hub?: string;
    Upstream?: string;
  };
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
}

function createStatusAction(settings: Settings) {
  print(settings);
  console.log(`Use ${name} bind to set/reset the settings.`);
}

function createBindAction(bind: Command, settings: Settings, updated: { endpoint: string; hub: string; upstream: string }, onDone: (updatedSettings: Settings) => void) {
  const endpoint = updated.endpoint;
  const hub = updated.hub;
  const upstream = updated.upstream;
  if (!endpoint && !hub && !upstream) {
    console.error("Error: none of --endpoint|--hub|--upstream is specified.");
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
  onDone(settings);
}

function createRunCommand(run: Command, dbFile: string, settings: Settings, updated: { endpoint: string; hub: string; upstream: string }) {
  const endpoint = updated.endpoint;
  const hub = updated.hub;
  const upstream = updated.upstream;
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
  start(run, dbFile, connectionString, currentEndpoint, currentHub, currentUpstream);
}

function start(run: Command, dbFile: string, connectionString: string | undefined, endpoint: string | undefined, hub: string, upstreamUrl: string) {
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

  const app = express();
  const server = createServer(app);
  console.log(`Connect to ${tunnel.endpoint}, hub: ${tunnel.hub}, upstream: ${upstreamUrl}`);
  const dataHub = new DataHub(server, tunnel, upstreamUrl, dbFile);
  dataHub.ReportStatusChange(ConnectionStatus.Connecting);
  tunnel
    .runAsync({
      onProxiedRequestEnd: (request, arrivedAt, proxiedUrl, response, err) => {
        if (err) {
          logger.error(`Error on proxy request ${proxiedUrl}: ${err}`);
          dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPairs.Disconnected);
        } else {
          logger.info(`Success on getting proxy response ${proxiedUrl}: ${response.StatusCode}`);
          if (response.StatusCode < 400) {
            dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPairs.Connected);
          } else {
            dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPairs.ErrorResponse);
          }
        }
        dataHub.UpdateTraffics([
          {
            code: response.StatusCode,
            methodName: request.HttpMethod,
            url: proxiedUrl.toString(),
            requestRaw: getRawRequest(request),
            responseRaw: getRawResponse(response),
            requestAtOffset: arrivedAt,
            unread: true,
          },
        ]);
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

function getRawRequest(message: TunnelIncomingMessage): string {
  const headers = message.Headers
    ? Object.entries(message.Headers)
        .map(([name, values]) => values.map((value) => `${name}: ${value}`).join("\r\n"))
        .join("\r\n")
    : "";

  const content = message.Content ? new TextDecoder().decode(message.Content) : "";

  return `${message.HttpMethod} ${message.Url} HTTP/1.1\r\n${headers}\r\n\r\n${content}`;
}

function getRawResponse(message: TunnelOutgoingMessage) {
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
