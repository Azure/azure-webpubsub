import { ConnectionStatus } from "../models";
import { Playground } from "./Playground";
export interface ClientPanelProps {
  onStatusChange: (status: ConnectionStatus) => void;
}
export const ClientPanel = ({ onStatusChange }: ClientPanelProps) => {
  return (
    <div className="d-flex flex-column mx-4 flex-fill overflow-auto">
      <h5>Client</h5>
      <p>
        Connect <b>your own client</b> following{" "}
        <a target="_blank" rel="noreferrer" href="https://aka.ms/awps/sdks">
          {" "}
          the SDK documents
        </a>
        , or have a 🚀<b>quick try</b>🚀 with a <b>Test Client</b> below.
      </p>
      <Playground onStatusChange={onStatusChange}></Playground>
    </div>
  );
};
