import React from 'react';
import { DefaultButton, BaseButton, Button, } from '@fluentui/react/lib/Button';
import { Icon } from '@fluentui/react/lib/Icon';

export interface WorkflowStepProps {
  checked: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement | HTMLAnchorElement | HTMLButtonElement | BaseButton | Button | HTMLSpanElement> | undefined;
  iconName: string;
  text: string
}

export function WorkflowStep({ checked, onClick, iconName, text } : WorkflowStepProps) {
  return (
    <div className="d-flex flex-column align-items-center">
      <DefaultButton className="m-2" checked={checked} toggle
        onClick={onClick}
      >
        <Icon iconName={iconName}></Icon><b className="m-2">{text}</b>
      </DefaultButton>
    </div>
  );
}
