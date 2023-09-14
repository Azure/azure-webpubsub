import React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import moment from 'moment';

export interface TrafficItemProps {
  content?: string;
  up?: boolean
}
export function TrafficItem({ content = "", up = false }: TrafficItemProps) {
  // todo: binary
  return {
    Data: up ? <TrafficUp content={content}></TrafficUp> : <TrafficDown content={content}></TrafficDown>,
    Time: moment().format(),
    Length: content.length,
  };
}

function TrafficDown({ content }: { content: string }) {
  return <p><Icon iconName="DoubleChevronDown8" className="text-danger mx-2"></Icon>{content}</p>;
}

function TrafficUp({ content }: { content: string }) {
  return <p><Icon iconName="DoubleChevronUp8" className="text-success mx-2"></Icon>{content}</p>;

}
