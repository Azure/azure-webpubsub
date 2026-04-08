import { WebPubSubClient } from "@azure/web-pubsub-client";
import { wpsServiceClient, getGroupName } from "../server/wps";
import { teamRepo } from "../server/users";
import type { Order } from "../server/order";
import type { Alert } from "./types";

export abstract class RiskBot {
  protected client: WebPubSubClient;

  constructor(
    public readonly name: string,
    private accessUrl: string
  ) {
    this.client = new WebPubSubClient(accessUrl);
  }

  async start() {
    this.client.on("group-message", async (e) => {
      const order = e.message.data as Order;
      const alert = await this.evaluate(order);
      if (alert) {
        console.log(`[${this.name}] Alert:`, alert.message);
        // Broadcast alert to all connected clients as a server message
        await wpsServiceClient.sendToAll(alert);
      }
    });

    this.client.on("connected", async () => {
      const accounts = teamRepo.getAllAccountNumbers();
      await Promise.all(
        accounts.map((acc) => this.client.joinGroup(getGroupName(acc)))
      );
      console.log(`[${this.name}] Connected and joined ${accounts.length} account groups`);
    });

    await this.client.start();
  }

  protected abstract evaluate(order: Order): Promise<Alert | null>;
}
