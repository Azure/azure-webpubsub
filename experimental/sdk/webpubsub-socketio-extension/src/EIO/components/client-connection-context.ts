import { debugModule } from "../../common/utils";
import { HubSendToConnectionOptions, WebPubSubServiceClient } from "@azure/web-pubsub";
import EventEmitter from "events";

const debug = debugModule("wps-sio-ext:EIO:ClientConnectionContext");

/**
 * A logical concept that stands for an Engine.IO client connection, every connection has a unique `connectionId`.
 * It maps Engine.IO Transport behaviours to Azure Web PubSub service REST API calls.
 */
export class ClientConnectionContext extends EventEmitter {
  public serviceClient: WebPubSubServiceClient;
  public connectionId: string;

  constructor(serviceClient: WebPubSubServiceClient, connectionId: string) {
    super();
    this.serviceClient = serviceClient;
    this.connectionId = connectionId;
  }

  public async send(packet: any, cb?: (err?: Error) => void) {
    debug(`send packet ${packet}, type = ${typeof packet}`);

    var options: HubSendToConnectionOptions = {};
    options["contentType"] = typeof packet == "string" ? "text/plain" : "application/octet-stream";
    await this.serviceClient.sendToConnection(this.connectionId, packet, options);

    cb && cb();
  }
}
