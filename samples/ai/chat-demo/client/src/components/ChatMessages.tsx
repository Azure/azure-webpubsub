import React, { useRef, useEffect } from 'react';
import { useChatClient } from '../hooks/useChatClient';
import { MessageComponent } from './MessageComponent';

export const ChatMessages: React.FC = () => {
  const { messages } = useChatClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="messages">
      {messages.map((message) => (
        <MessageComponent key={message.id} message={message} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};
