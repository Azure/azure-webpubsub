import React from 'react';
import type { ChatMessage } from '../contexts/ChatClientContext';
import { formatMessageContent } from '../utils/messageFormatting';
import { formatMessageTime, formatFullMessageTime } from '../utils/timeFormatting';
import { usePrivateChat } from '../hooks/usePrivateChat';
import { AvatarWithOnlineStatus } from './AvatarWithOnlineStatus';

interface MessageComponentProps {
  message: ChatMessage;
}

export const MessageComponent: React.FC<MessageComponentProps> = ({ message }) => {
  const { createOrJoinPrivateChat } = usePrivateChat();
  
  const messageClasses = [
    'message',
    message.isFromCurrentUser ? 'user-message' : 'bot-message',
    message.streaming ? 'streaming' : '',
    message.isPlaceholder ? 'thinking' : '',
  ].filter(Boolean).join(' ');

  // Render simple avatar for non-current user messages
  const renderAvatar = () => {
    if (message.isFromCurrentUser) return null;
    
    return (
      <div className="message-avatar">
        <AvatarWithOnlineStatus
          userOrRoomId={message.sender || ''}
          size={32}
          fontSize={14}
          cursor="pointer"
          title={`Click to chat with ${message.sender}`}
          onClick={() => createOrJoinPrivateChat(message.sender || '')}
          isUser={false}
          isPrivateChat={true} // Messages are in chat context, show online status
        />
      </div>
    );
  };

  // Render acknowledgment status icon for user messages
  const renderAckIcon = () => {
    if (!message.isFromCurrentUser) return null;

    if (message.isAcked) {
      // Acknowledged - circle with checkmark
      return (
        <div 
          className="ack-icon acked"
          title="Message sent successfully"
        >
          ✓
        </div>
      );
    } else {
      // Not acknowledged - empty circle
      return (
        <div 
          className="ack-icon pending"
          title="Sending message..."
        />
      );
    }
  };

  return (
    <div className={`message-wrapper ${message.isFromCurrentUser ? 'from-user' : 'from-other'}`}>
      {/* User ID and timestamp above message bubble */}
      <div 
        className={`message-meta ${message.isFromCurrentUser ? 'from-user' : 'from-other'}`}
        title={formatFullMessageTime(message.timestamp)}
      >
        {!message.isFromCurrentUser && <span>{message.sender}</span>}
        <span>{formatMessageTime(message.timestamp)}</span>
      </div>
      
      {/* Message bubble with avatar and ack icon */}
      <div className={`message-bubble-row ${message.isFromCurrentUser ? 'from-user' : 'from-other'}`}>
        {renderAvatar()}
        <div className={messageClasses} data-message-id={message.id}>
          <div className="message-content">
            <div
              className="message-text"
              dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }}
            />
          </div>
        </div>
        {renderAckIcon()}
      </div>
    </div>
  );
};
