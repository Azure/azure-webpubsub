import React from "react";
import { Icon } from "@fluentui/react/lib/Icon";
import { StatusIndicator } from "../workflows/StatusIndicator";
import { ConnectionStatus } from "../../models";

export interface ServicePanelProps {
  endpoint?: string;
  status?: ConnectionStatus;
  liveTraceUrl?: string;
}

export function ServicePanel({ endpoint, status, liveTraceUrl }: ServicePanelProps) {
  return (
    <div className="m-2 d-flex flex-column flex-fill">
      <p>
        <StatusIndicator status={status}></StatusIndicator>
        <b>{status}</b>
        <a className="mx-2" href={endpoint + "/api/health"} target="_blank" rel="noreferrer">
          {endpoint}
        </a>
      </p>
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
