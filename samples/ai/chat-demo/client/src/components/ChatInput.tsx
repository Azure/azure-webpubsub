import React, { useState } from 'react';
import { useChatClient } from '../hooks/useChatClient';

export const ChatInput: React.FC = () => {
  const { sendMessage, connectionStatus, isStreaming } = useChatClient();
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;

    await sendMessage(inputValue);
    setInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const isDisabled = connectionStatus.status !== 'connected' || isStreaming;

  return (
    <div className="input-area">
      <input
        type="text"
        className="message-input"
        placeholder="Type a message..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={isDisabled}
      />
      <button 
        className="send-button" 
        onClick={handleSubmit}
        disabled={isDisabled || !inputValue.trim()}
      >
        ➤
      </button>
    </div>
  );
};
