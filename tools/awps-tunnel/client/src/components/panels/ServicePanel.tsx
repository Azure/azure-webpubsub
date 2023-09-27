import React from "react";
import { Icon } from "@fluentui/react/lib/Icon";
import { StatusDescriptor } from "../workflows/StatusIndicator";
import { ConnectionStatus } from "../../models";

export interface ServicePanelProps {
  endpoint?: string;
  status?: ConnectionStatus;
  liveTraceUrl?: string;
}

export function ServicePanel({ endpoint, status, liveTraceUrl }: ServicePanelProps) {
  return (
    <div className="mx-4 d-flex flex-column flex-fill">
      <h5>Web PubSub Live Trace</h5>
      <p>
        <Icon className="mx-2" iconName="Cloud"></Icon>
        <a href={liveTraceUrl} target="_blank" rel="noreferrer">
          Open live trace
        </a>
      </p>
      {liveTraceUrl && <iframe className="flex-fill" src={liveTraceUrl} title="Live trace"></iframe>}
    </div>
  );
}
