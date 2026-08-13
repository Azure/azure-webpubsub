import { Icon } from "@fluentui/react/lib/Icon";
import { ConnectionStatus } from "../../models";

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
