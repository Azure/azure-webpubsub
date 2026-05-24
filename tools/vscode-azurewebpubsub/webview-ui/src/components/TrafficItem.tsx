import { Icon } from '@fluentui/react/lib/Icon';
import moment from 'moment';

export interface TrafficItemViewModel {
  Data: JSX.Element;
  Time: string;
  Length: number;
}

export function TrafficItem(content: string, up = false, time = moment().format()) : TrafficItemViewModel {
  // todo: binary
  return {
    Data: up ? <TrafficUp content={content}></TrafficUp> : <TrafficDown content={content}></TrafficDown>,
    Time: time,
    Length: content.length,
  };
}

function TrafficDown({ content }: { content: string }) {
  return <p><Icon iconName="DoubleChevronDown8" className="text-danger mx-2"></Icon>{content}</p>;
}

function TrafficUp({ content }: { content: string }) {
  return <p><Icon iconName="DoubleChevronUp8" className="text-success mx-2"></Icon>{content}</p>;

}
