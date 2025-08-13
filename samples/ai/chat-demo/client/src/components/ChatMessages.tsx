import React, { useRef, useEffect } from 'react';
import { useChatClient } from '../hooks/useChatClient';
import { MessageComponent } from './MessageComponent';
import { TypingIndicator } from './TypingIndicator';

interface ChatMessagesProps {
  enableTypingIndicators: boolean;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({ enableTypingIndicators }) => {
  const { messages, showTypingIndicator } = useChatClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showTypingIndicator]);

  return (
    <div className="messages">
      {messages.map((message) => (
        <MessageComponent key={message.id} message={message} />
      ))}
      {enableTypingIndicators && showTypingIndicator && <TypingIndicator />}
      <div ref={messagesEndRef} />
    </div>
  );
};
