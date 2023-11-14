import React from "react";

import { CounterBadge, ToggleButton } from "@fluentui/react-components";
export interface WorkflowStepProps {
  checked: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement | HTMLAnchorElement | HTMLButtonElement | HTMLSpanElement> | undefined;
  icon: React.ReactNode;
  text: string;
  unread: number;
}

export function WorkflowStep({ checked, onClick, icon, text, unread }: WorkflowStepProps) {
  return (
    <div className="d-flex flex-column align-items-center">
      <ToggleButton size="large" appearance="subtle" className="m-2" checked={checked} onClick={onClick}>
        <div className="container position-relative">
          <span className="m-2">{icon}</span>
          {unread > 0 && <CounterBadge size="small" className="position-absolute top-0 start-12 p-2">{unread}</CounterBadge>}
          <br></br>
          <span className="m-2">{text}
          </span>
        </div>
      </ToggleButton>
    </div>
  );
}
