import "./Connector.css";
import { ConnectionStatus, ConnectionStatusPair } from "../models";
export function Connector({ status }: { status: ConnectionStatus }) {
  if (status === ConnectionStatus.Connecting || status === ConnectionStatus.None) {
    return <div className="dashed-line arrow-line connecting"></div>;
  }

  if (status === ConnectionStatus.Connected) {
    return <div className="arrow-line connected"></div>;
  }

  return <div className="dashed-line arrow-line"></div>;
}

export function TwoDirectionConnector({ statusPair }: { statusPair: ConnectionStatusPair }) {
  if (statusPair.statusOut === ConnectionStatus.None || statusPair.statusIn === ConnectionStatus.None) {
    return <div className="two-direction-arrow-line dashed-line"></div>;

  }
  if (statusPair.statusOut === ConnectionStatus.Connected && statusPair.statusIn === ConnectionStatus.Connected) {
    return <div className="two-direction-arrow-line connected"></div>;
  }

  if (statusPair.statusOut === ConnectionStatus.Disconnected) {
    return <div className="two-direction-arrow-line requesterror"></div>;
  }

  if (statusPair.statusOut === ConnectionStatus.Connected && statusPair.statusIn === ConnectionStatus.Disconnected) {
    return <div className="two-direction-arrow-line responseerror"></div>;
  }

  return <div className="two-direction-arrow-line dashed-line"></div>;
}
