import { WebPubSubClient, WebPubSubClientProtocol, WebPubSubMessage } from "@azure/web-pubsub-client";


class ServerConnectionProtocol implements WebPubSubClientProtocol{
  public name: string = "serverConnectionProtocol";
  public version: number = 1;
  public isReliableSubProtocol: boolean = false;
  constructor() {}
  public   parseMessages(input: string | ArrayBuffer | Buffer): WebPubSubMessage | null
  {
return null;
  }

  public     writeMessage(message: WebPubSubMessage): string | ArrayBuffer
{
return "";
  }
}

const client = new WebPubSubClient("http://localhost:8080ws://localhost:19081/server/tunnel/?hub=secondconnectioncanconnect&access_token=eyJhbGciOiJIUzI1NiIsImtpZCI6IjE2MjQ2NDA2NzUiLCJ0eXAiOiJKV1QifQ.eyJuYmYiOjE2ODg3ODU3MDcsImV4cCI6MTY4ODc4OTMwNywiaWF0IjoxNjg4Nzg1NzA3LCJhdWQiOiJ3czovL2xvY2FsaG9zdC9zZXJ2ZXIvdHVubmVsLz9odWI9c2Vjb25kY29ubmVjdGlvbmNhbmNvbm5lY3QifQ.qDFrsYOHrjZ8GGddkLIPtTsBTaIXgfR9Iq6Jb9lgTII", 
{
  protocol : new ServerConnectionProtocol()
});

client.on("connected", () => {});