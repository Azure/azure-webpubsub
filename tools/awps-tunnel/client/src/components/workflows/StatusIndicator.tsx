import { Icon } from "@fluentui/react/lib/Icon";
import { ConnectionStatus, ConnectionStatusPair } from "../../models";

export function StatusIndicator({ status }: { status?: ConnectionStatus }) {
  let className = status === ConnectionStatus.Connected ? "text-success" : status === ConnectionStatus.Disconnected ? "text-error" : "text-warning";
  return <Icon iconName="StatusCircleInner" className={`${className} mx-2`}></Icon>;
}

export function StatusDescriptor({ status }: { status?: ConnectionStatus }) {
  switch (status) {
    case ConnectionStatus.Connected:
      return (
        <span className="text-success">
          <Icon iconName="StatusCircleInner" className="text-success mx-2"></Icon>Connected
        </span>
      );
    case ConnectionStatus.Disconnected:
      return (
        <span className="text-error">
          <Icon iconName="StatusCircleInner" className="text-error mx-2"></Icon>Disconnected
        </span>
      );
    default:
      return (
        <span className="text-warning">
          <Icon iconName="StatusCircleInner" className="text-warning mx-2"></Icon>Connecting
        </span>
      );
  }
}

export function StatusDisplayText({ status }: { status?: ConnectionStatusPair }) {
  if (!status) {
    return <span className="text-secondary">Unknown</span>;
  }

  if (status.statusOut === ConnectionStatus.Connected) {
    return <span className="text-success">Succeeded</span>;
  }

  if (status.statusOut === ConnectionStatus.Disconnected) {
    return <span className="text-error">Response error</span>;
  }

  return <span className="text-secondary">Unknown</span>;
}
