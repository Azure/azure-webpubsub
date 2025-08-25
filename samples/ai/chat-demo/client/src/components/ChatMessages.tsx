import React, { useRef, useEffect } from 'react';
import { useChatClient } from '../hooks/useChatClient';
import { MessageComponent } from './MessageComponent';

export const ChatMessages: React.FC = () => {
  const { messages } = useChatClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      // On large list swaps (e.g., room switch), instant jump is smoother than smooth animation
      const behavior: ScrollBehavior = messages.length > 4 ? 'auto' : 'smooth';
      messagesEndRef.current.scrollIntoView({ behavior });
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
