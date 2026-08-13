import { type ConnectionStatus } from "../models";
import { Playground } from "./Playground";

export interface ClientPanelProps {
  onStatusChange: (status: ConnectionStatus) => void;
}
export const ClientPanel = ({ onStatusChange }: ClientPanelProps) => {
  return (
    <div className="d-flex flex-column mx-4 flex-grow">
      <Playground onStatusChange={onStatusChange}></Playground>
    </div>
  );
};
