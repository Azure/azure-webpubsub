import React from 'react';
import { useChatClient } from '../hooks/useChatClient';

export const ChatFooter: React.FC = () => {
  const { connectionStatus } = useChatClient();

  return (
    <footer>
      <p>UserId: {connectionStatus.userId} | ConnectionId: {connectionStatus.connectionId}</p>
    </footer>
  );
};