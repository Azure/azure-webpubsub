import React from 'react';
import type { ChatMessage } from '../contexts/ChatClientContext';
import { formatMessageContent } from '../utils/messageFormatting';

interface MessageComponentProps {
  message: ChatMessage;
}

export const MessageComponent: React.FC<MessageComponentProps> = ({ message }) => {
  const messageClasses = [
    'message',
    message.isFromCurrentUser ? 'user-message' : 'bot-message',
    message.streaming ? 'streaming' : '',
    message.isPlaceholder ? 'thinking' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={messageClasses} data-message-id={message.id}>
      <div className="message-sender">{message.sender}</div>
      <div className="message-content">
        <div
          className="message-text"
          dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }}
        />
      </div>
    </div>
  );
};
