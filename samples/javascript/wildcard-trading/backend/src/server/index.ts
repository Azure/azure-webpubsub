import express from "express";
import cors from "cors";
import { WebPubSubEventHandler } from "@azure/web-pubsub-express";
import { teamRepo } from "./users";
import { wpsServiceClient, grantGroupPermissions, getGroupName } from "./wps";
import { placeOrder } from "./order";
import { startBots } from "../bot";

const handler = new WebPubSubEventHandler("trading", {
  path: "/event-handler",
  onConnected: async (req) => {
    console.log(`${req.context.userId} connected`);
  },
  handleUserEvent: async (req, res) => {
    if (req.context.eventName === "order") {
      const userId = req.context.userId;
      if (!userId) {
        return res.fail(400, "missing userId");
      }

      const { ticker, quantity, accountId } = req.data as {
        ticker: string;
        quantity: number;
        accountId: string;
      };

      const order = placeOrder({ traderId: userId, ticker, quantity, accountId });
      await wpsServiceClient.group(getGroupName(accountId)).sendToAll(order);

      return res.success();
    }
    res.fail(400, "Event not supported");
  },
});

const app = express();
app.use(handler.getMiddleware());
app.use(express.json());
app.use(cors());

app.get("/auth", async (_req, res) => {
  const members = teamRepo.getAllMembers();
  const permissions = await grantGroupPermissions(members);
  return res.json(permissions);
});

app.get("/api/members/:memberID", (req, res) => {
  const { memberID } = req.params;
  const member = teamRepo.getMemberById(memberID);
  if (!member) {
    return res.status(404).json({ error: "Member not found" });
  }
  return res.json({
    member,
    team: {
      name: teamRepo.getName(),
      accounts: teamRepo.getAllAccountNumbers(),
    },
  });
});

app.listen(8080, async () => {
  console.log("Server started on http://localhost:8080");
  await startBots();
});