import React from "react";

import { ToggleButton } from "@fluentui/react-components";
export interface WorkflowStepProps {
  checked: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement | HTMLAnchorElement | HTMLButtonElement | HTMLSpanElement> | undefined;
  icon: React.ReactNode;
  text: string;
}

export function WorkflowStep({ checked, onClick, icon, text }: WorkflowStepProps) {
  return (
    <div className="d-flex flex-column align-items-center">
      <ToggleButton size="large" appearance="subtle" className="m-2" checked={checked} onClick={onClick}>
        <div>
          <span className="m-2">{icon}</span>
          <br></br>
          <span className="m-2">{text}</span>
        </div>
      </ToggleButton>
    </div>
  );
}
