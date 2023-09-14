// a command tool accepting parameters
// host the website
// start the server connection
import dotenv from "dotenv";
dotenv.config();
import appDirs from "appdirsjs";
import express from "express";
import { createServer } from "http";
import path from "path";
import { DataHub } from "./dataHub";
import { HttpServerProxy } from "./serverProxies";
import { ConnectionStatus, ConnectionStatusPairs } from "../client/src/models";
import { logger } from "./logger";
import fs from "fs";

import { program } from "commander";
import { DefaultAzureCredential } from "@azure/identity";

import packageJson from "./package.json";
const name = packageJson.name;

// /home/user/.config/app on Linux
// /Users/User/Library/Preferences/app on MacOS
// C:\Users\User\AppData\Roaming\app
const dir = appDirs({ appName: name }).config;
fs.mkdirSync(dir, { recursive: true });

interface Settings {
  WebPubSub: {
    Endpoint?: string;
    Hub?: string;
    Upstream?: string;
  };
}

function print(settings: Settings) {
  console.log(`Current Web PubSub service endpoint: ${settings?.WebPubSub?.Endpoint ?? "<Not binded>"}`);
  console.log(`Current hub: ${settings?.WebPubSub?.Hub ?? "<Not binded>"}`);
  console.log(`Current upstream: ${settings?.WebPubSub?.Upstream ?? "<Not binded>"}`);
}

const appConfigPath = path.join(dir, "appsettings.json");
const settings: Settings = fs.existsSync(appConfigPath) ? (JSON.parse(fs.readFileSync(appConfigPath, "utf-8")) as Settings) : { WebPubSub: {} };
if (!settings.WebPubSub) settings.WebPubSub = {};

program.name(name).version(packageJson.version).description(packageJson.description);

function validateEndpoint(endpoint: string) {
  try {
    new URL(endpoint);
    return true;
  } catch (e) {
    return false;
  }
}
program.command("status").action(() => {
  print(settings);
  console.log(`Use ${name} bind to set/reset the settings.`);
});
const bind = program.command("bind");
bind
  .option("-e, --endpoint <endpoint>", "Sepcify the Web PubSub service endpoint URL to connect to")
  .option("--hub <hub>", "Specify the hub to connect to")
  .option("-u, --upstream <upstream>", "Specify the upstream URL to connect to")
  .action(({ endpoint, hub, upstream }) => {
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
    fs.writeFileSync(appConfigPath, JSON.stringify(settings, null, 2));
    console.log(`Settings stored to ${appConfigPath}`);
    print(settings);
  });

const run = program.command("run");
run
  .option(
    "-e, --endpoint <endpoint>",
    "Sepcify the Web PubSub service endpoint URL to connect to, you don't need to set it if WebPubSubConnectionString environment variable is set. If both are set, this option will be used.",
  )
  .option("--hub <hub>", "Specify the hub to connect to")
  .option("-u, --upstream <upstream>", "Specify the upstream URL to redirect traffic to")
  .action(({ endpoint, hub, upstream }) => {
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

    let currentHub = hub ?? settings.WebPubSub.Hub;
    if (!currentHub) {
      console.error(`Error: hub is not specified.`);
      run.outputHelp();
      return;
    }

    let connectionString = process.env.WebPubSubConnectionString;
    // endpoint > connectionString > settings.WebPubSub.Endpoint
    let currentEndpoint = !!connectionString ? undefined : settings.WebPubSub.Endpoint;
    if (endpoint) {
      if (!validateEndpoint(endpoint)) {
        console.error(`Error: invalid endpoint: ${endpoint}`);
        return;
      }

      currentEndpoint = endpoint;
    }

    if (!connectionString && !currentEndpoint) {
      console.error(`Error: neither WebPubSubConnectionString env is set nor endpoint is not specified.`);
      run.outputHelp();
      return;
    } else if (connectionString) {
      console.log(`Using endpoint and credential from WebPubSubConnectionString env.`);
    } else {
      console.log(`Using endpoint ${currentEndpoint} from settings. Please make sure the Access Policy is correctly configured to allow your access.`);
    }
    start(connectionString, currentEndpoint, currentHub, currentUpstream);
  });

program.parse(process.argv);
program.addHelpText("after", `You could also set WebPubSubConnectionString environment variable if you don't want to configure endpoint.`);
program.action(() => {
  program.outputHelp();
});

function start(connectionString: string | undefined, endpoint: string | undefined, hub: string, upstreamUrl: string) {
  const app = express();
  const server = createServer(app);
  let tunnel: HttpServerProxy;
  if (endpoint) {
    // when endpoint is specified, it must be specified through CLI, it takes the highest priority
    tunnel = new HttpServerProxy(endpoint, new DefaultAzureCredential(), hub, { target: upstreamUrl });
  } else {
    tunnel = HttpServerProxy.fromConnectionString(connectionString!, hub, { target: upstreamUrl });
  }
  console.log(`Connect to ${tunnel.endpoint}, hub: ${tunnel.hub}, upstream: ${upstreamUrl}`);
  const dataHub = new DataHub(server, tunnel, upstreamUrl);
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
        const decoder = new TextDecoder("utf-8");
        dataHub.UpdateTraffics([
          {
            code: response.StatusCode,
            methodName: request.HttpMethod,
            url: request.Url,
            requestRaw: decoder.decode(request.Content),
            responseRaw: decoder.decode(response.Content),
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

  const port = process.env.AWPS_TUNNEL_SERVER_PORT || 8888;

  app.use(express.static(path.join(__dirname, "../client/build")));
  server.listen(port, () => {
    console.log(`Open webview at: http://localhost:${port}`);
  });
}
