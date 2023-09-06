import React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';

export interface ServerPanelProps {
  endpoint?: string;
}

export function ServerPanel({ endpoint }: ServerPanelProps) {
  return (
    <p className="m-2">
      <Icon className="mx-2" iconName="ServerEnviroment"></Icon>
      <b>Requests are sending to your local server: {endpoint}</b>
    </p>
  );
}
