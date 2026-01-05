import React from 'react';

interface TypingIndicatorProps {
  typingUsers: string[];
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ typingUsers }) => {
  if (typingUsers.length === 0) return null;

  const getTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0]} is typing ...`;
    } else if (typingUsers.length === 2) {
      return `${typingUsers[0]} and ${typingUsers[1]} are typing ...`;
    } else {
      return `${typingUsers[0]} and ${typingUsers.length - 1} others are typing ...`;
    }
  };

  return (
    <div className="typing-indicator">
      {getTypingText()}
    </div>
  );
};
