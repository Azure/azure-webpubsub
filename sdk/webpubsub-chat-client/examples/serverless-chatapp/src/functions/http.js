const { app } = require("@azure/functions");
const { WebPubSubServiceClient } = require("@azure/web-pubsub");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const hubName = process.env.WebPubSubHub || "chat";
const allowLocalUserId = process.env.AllowLocalUserId === "true";

async function serve(fileName, contentType) {
  return {
    headers: { "content-type": contentType },
    body: await readFile(path.join(process.cwd(), "public", fileName)),
  };
}

app.http("index", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "index",
  handler: () => serve("index.html", "text/html; charset=utf-8"),
});

app.http("client-script", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "client.js",
  handler: () => serve("client.js", "text/javascript; charset=utf-8"),
});

app.http("styles", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "styles.css",
  handler: () => serve("styles.css", "text/css; charset=utf-8"),
});

app.http("negotiate", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "negotiate",
  handler: async (request) => {
    const authenticatedUserId = request.headers.get("x-ms-client-principal-name");
    const localUserId = allowLocalUserId ? request.query.get("userId") : undefined;
    const userId = authenticatedUserId || localUserId;
    if (!userId || !userId.trim()) {
      return { status: 401, jsonBody: { error: "Sign in before connecting to Chat." } };
    }
    if (!process.env.WebPubSubConnectionString) {
      return { status: 500, jsonBody: { error: "WebPubSubConnectionString isn't configured." } };
    }

    const serviceClient = new WebPubSubServiceClient(process.env.WebPubSubConnectionString, hubName);
    const token = await serviceClient.getClientAccessToken({ userId: userId.trim() });
    return { jsonBody: { url: token.url } };
  },
});
