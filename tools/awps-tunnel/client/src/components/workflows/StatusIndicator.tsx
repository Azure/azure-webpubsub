import React from "react";
import { Icon } from "@fluentui/react/lib/Icon";
import { ConnectionStatus } from "../../models";

export function StatusIndicator({ status }: { status?: ConnectionStatus }) {
  let className = status === ConnectionStatus.Connected ? "text-success" : status === ConnectionStatus.Disconnected ? "text-error" : "text-warning";
  return <Icon iconName="StatusCircleInner" className={`${className} mx-2`}></Icon>;
}
