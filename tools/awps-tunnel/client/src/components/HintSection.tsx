import { MessageBar, MessageBarBody } from "@fluentui/react-components";
import { ResizablePanel } from "./ResizablePanel";

export const HintSection = () => (
  <div className="d-flex flex-column mt-1 flex-fill">
    <MessageBar intent="info" style={{ marginBottom: "6px" }}>
      <MessageBarBody>Get a Client Access URL from portal Keys &gt; Client URL Generator, then use it with the client above.</MessageBarBody>
    </MessageBar>
    <ResizablePanel
      className="flex-fill"
      left={
        <div className="d-flex flex-column websocket-client-container m-2 flex-fill gap-2">
          <p className="mb-0"><b>Hints</b></p>
          <p className="mb-0">
            In portal, open <b>Keys</b> and use <b>Client URL Generator</b> to produce a Client Access URL for quick testing. In real apps, generate URLs with SDKs using the connection string from this tab.
          </p>
        </div>
      }
      right={
        <div className="d-flex justify-content-center m-2">
          <img
            alt="Portal client URL generator"
            style={{ width: "100%", maxWidth: "900px", border: "1px solid #ddd", borderRadius: "4px" }}
            src="https://azure.github.io/azure-webpubsub/event-listener/webpubsub-client/images/portal_client_url.png"
          />
        </div>
      }
    />
  </div>
);
