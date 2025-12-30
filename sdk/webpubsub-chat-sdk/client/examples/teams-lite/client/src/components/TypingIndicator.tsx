import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="typing-indicator flex" aria-label="Typing">
      <span></span>
      <span></span>
      <span></span>
    </div>
  );
};
