import { Icon } from "@fluentui/react/lib/Icon";
import { ConnectionStatus } from "../../models";
import { Switch } from "@fluentui/react-components";
import { useState } from "react";

export interface ServicePanelProps {
  endpoint?: string;
  status?: ConnectionStatus;
  liveTraceUrl?: string;
}

export function ServicePanel({ endpoint, status, liveTraceUrl }: ServicePanelProps) {
  const [showLiveTrace, setShowLiveTrace] = useState<boolean>(false);
  return (
    <div className="mx-4 d-flex flex-column flex-fill">
      <h5>Web PubSub Live Trace</h5>
      <p>
        <Icon className="mx-2" iconName="Cloud"></Icon>
        <a href={liveTraceUrl} target="_blank" rel="noreferrer">
          Open live trace
        </a>
      </p>
      {liveTraceUrl && (
        <>
          <Switch label={showLiveTrace ? "Disconnect live trace" : "connect to live trace"} checked={showLiveTrace} onChange={(ev) => setShowLiveTrace(ev.currentTarget.checked)}></Switch>
          {showLiveTrace && <iframe className="flex-fill" src={liveTraceUrl} title="Live trace"></iframe>}
        </>
      )}
    </div>
  );
}
