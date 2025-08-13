import React from 'react';
import type { ChatMessage } from '../contexts/ChatClientContext';
import { formatMessageContent } from '../utils/messageFormatting';

interface MessageComponentProps {
  message: ChatMessage;
}

export const MessageComponent: React.FC<MessageComponentProps> = ({ message }) => {
  const messageClasses = [
    'message',
    message.isUser ? 'user-message' : 'bot-message',
    message.streaming ? 'streaming' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={messageClasses} data-message-id={message.id}>
      <div className="message-sender">{message.sender}</div>
      <div 
        className="message-content"
        dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }}
      />
    </div>
  );
};
