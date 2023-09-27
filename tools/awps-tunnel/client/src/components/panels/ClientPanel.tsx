import React, { useState, useRef } from "react";
import { DefaultButton, ComboBox, SelectableOptionMenuItemType, Checkbox, DetailsList, DetailsListLayoutMode, SelectionMode, Icon, TextField, Dropdown } from "@fluentui/react";
import { ResizablePanel } from "../ResizablePanel";
import { TrafficItem, TrafficItemProps } from "../TrafficItem";
import { ConnectionStatus } from "../../models";
import { useDataContext } from "../../providers/DataContext";
import { Playground } from "./Playground";

export interface ClientPanelProps {
  onStatusChange: (status: ConnectionStatus) => void;
}
export const ClientPanel = ({ onStatusChange }: ClientPanelProps) => {
  return (
    <div className="d-flex flex-column mx-4 flex-fill">
      <h5>Client</h5>
      <p>Connect your own client to the Web PubSub service following
      🔗<a target="_blank" rel="noreferrer" href="https://aka.ms/awps/sdks">the SDK documents</a>🔗.
          <br></br>Or have a 🚀<b>quick try</b>🚀 with below <b>Test Client:</b></p>
      <Playground onStatusChange={onStatusChange}></Playground>
    </div>
  );
};
