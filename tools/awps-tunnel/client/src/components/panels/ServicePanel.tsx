import { Icon } from "@fluentui/react/lib/Icon";
import { ConnectionStatus } from "../../models";
import { Switch } from "@fluentui/react-components";
import { useState } from "react";
import { LiveTraceSection } from "../LiveTraceSection";

export interface ServicePanelProps {
  endpoint?: string;
  status?: ConnectionStatus;
  liveTraceUrl?: string;
  tokenGenerator(): Promise<string>;
}

export function ServicePanel({ endpoint, status, liveTraceUrl, tokenGenerator }: ServicePanelProps) {
  const [showLiveTrace, setShowLiveTrace] = useState<boolean>(false);
  return (
    <div className="mx-4 d-flex flex-column flex-fill">
      <h5>Web PubSub Live Trace</h5>
      <p>
        <Icon className="mx-2" iconName="Cloud"></Icon>
        <a href="https://learn.microsoft.com/azure/azure-web-pubsub/howto-troubleshoot-resource-logs#visit-live-trace-tool" target="_blank" rel="noreferrer">
          Learn more about live trace.
        </a>
      </p>
      {liveTraceUrl && (
        <>
          <Switch label={showLiveTrace ? "Disconnect live trace" : "connect to live trace"} checked={showLiveTrace} onChange={(ev) => setShowLiveTrace(ev.currentTarget.checked)}></Switch>
          {showLiveTrace && <LiveTraceSection url={liveTraceUrl} tokenGenerator={tokenGenerator}></LiveTraceSection>}
        </>
      )}
    </div>
  );
}
