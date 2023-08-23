import React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { Status } from '../../providers/DataContext';

export function StatusIndicator({ status } : { status?: Status} ) {
  let className = status === Status.Connected ? "text-success" : (status === Status.Disconnected ? "text-error" : "text-warning");
  return <Icon iconName="StatusCircleInner" className={`${className} mx-2`}></Icon>;
}
