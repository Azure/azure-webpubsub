import express from "express";
import { WebPubSubServiceClient } from "@azure/web-pubsub";

const connectionString = process.env.WebPubSubConnectionString;
if (!connectionString) {
  throw new Error("Set WebPubSubConnectionString before starting the app.");
}

const hubName = process.env.WebPubSubHub ?? "chat";
const port = Number(process.env.PORT ?? 3000);
const serviceClient = new WebPubSubServiceClient(connectionString, hubName);
const app = express();

app.get("/negotiate", async (request, response) => {
  const userId = request.query.userId;
  if (typeof userId !== "string" || !userId.trim()) {
    return response.status(400).json({ error: "userId is required" });
  }

  try {
    const token = await serviceClient.getClientAccessToken({ userId: userId.trim() });
    return response.json({ url: token.url });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Unable to issue a client access URL." });
  }
});

app.use(express.static("public"));
app.listen(port, () => console.log(`Open http://localhost:${port}`));
