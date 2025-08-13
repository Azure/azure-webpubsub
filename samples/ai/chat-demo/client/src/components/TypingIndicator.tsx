import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="typing-indicator" aria-label="Typing" style={{ display: 'flex' }}>
      <span></span>
      <span></span>
      <span></span>
    </div>
  );
};
