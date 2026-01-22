import React, { useRef, useEffect, useContext } from 'react';
import { useChatClient } from '../hooks/useChatClient';
import { MessageComponent } from './MessageComponent';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';

export const ChatMessages: React.FC = () => {
  const { messages } = useChatClient();
  const settings = useContext(ChatSettingsContext);
  
  if (!settings) throw new Error('ChatMessages must be used within ChatSettingsProvider');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const anchor = messagesEndRef.current;
    if (!anchor) return;
    // On large list swaps (e.g., room switch), instant jump is smoother than smooth animation
    const behavior: ScrollBehavior = messages.length > 30 ? 'auto' : 'smooth';
    type ScrollIntoViewFn = (arg?: unknown) => void;
    const maybeFn = (anchor as HTMLElement & { scrollIntoView?: unknown }).scrollIntoView;
    if (typeof maybeFn === 'function') {
      const fn = maybeFn as ScrollIntoViewFn;
      try {
        fn.call(anchor, { behavior });
      } catch {
        try { fn.call(anchor); } catch { /* ignore */ }
      }
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
