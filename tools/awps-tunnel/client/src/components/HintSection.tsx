import { MessageBar, MessageBarBody } from "@fluentui/react-components";
import { ResizablePanel } from "./ResizablePanel";

export const HintSection = () => (
  <div className="d-flex flex-column mt-1 flex-fill">
    <MessageBar intent="info">
      <MessageBarBody>Get a Client Access URL from Azure portal then use it with the client above.</MessageBarBody>
    </MessageBar>
    <div className="flex-fill">
      <div className="d-flex flex-column websocket-client-container m-2 flex-fill gap-2">
        <p className="mb-0">
          <b>Hints</b>
        </p>
        <p className="mb-0">
          In portal, open <b>Keys</b> and use <b>Client URL Generator</b> to produce a Client Access URL for quick testing. In real apps, please follow{" "}
          <a target="_blank" rel="noreferrer" href="https://aka.ms/awps/sdks">
            {" "}
            the SDK documents
          </a>
          .
        </p>
      </div>
      <div className="d-flex justify-content-center m-2">
        <img
          alt="Portal client URL generator"
          style={{ width: "100%", maxWidth: "900px", border: "1px solid #ddd", borderRadius: "4px" }}
          src="https://azure.github.io/azure-webpubsub/event-listener/webpubsub-client/images/portal_client_url.png"
        />
      </div>
      <ul>
        <li>
          <strong>Connection</strong>: connection stands for a WebSocket client connection.
        </li>{" "}
        <li>
          <strong>Hub</strong>: hub is the logical isolation for connections. Connections always connect to a hub, connections can only send to those within the same hub.
        </li>{" "}
        <li>
          <strong>User ID</strong>: A connection can belong to a user when it is auth-ed.
        </li>{" "}
        <li>
          <strong>Token Lifetime</strong>: Specifies the lifetime of this client URL’s token. When the token expires, you get 401 Unauthorized when connecting to the service with this URL.
        </li>{" "}
        <li>
          <strong>Roles</strong>: Specifies the roles for the connection. It can be used when the connection connects with{" "}
          <code className="language-plaintext highlighter-rouge">json.webpubsub.azure.v1</code>{" "}
          subprotocol that empowers the client to join/leave/send to groups.
        </li>
      </ul>
    </div>
  </div>
);
