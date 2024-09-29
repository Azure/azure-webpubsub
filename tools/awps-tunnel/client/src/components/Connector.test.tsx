import { render } from '@testing-library/react';
import { Connector } from './Connector';
import { ConnectionStatus } from '../models';

test('renders connecting connector', () => {
  const {container} = render(<Connector status={ConnectionStatus.Connecting}/>);
  const linkElement = container.getElementsByClassName('connecting')[0];
  expect(linkElement).toBeInTheDocument();
});
