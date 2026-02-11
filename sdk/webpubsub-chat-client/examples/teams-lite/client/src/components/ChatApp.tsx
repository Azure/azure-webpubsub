import React, { useContext, useEffect, useRef } from 'react';
import { ChatRoomProvider } from '../providers/ChatRoomProvider';
import { ChatWindow } from './ChatWindow';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { ChatClientContext } from '../contexts/ChatClientContext';
import { Sidebar } from './Sidebar';
import { ChatFooter } from './ChatFooter';

// Auto-close timeout for notifications
const NOTIFICATION_AUTO_CLOSE_MS = 8000;

export const ChatApp: React.FC = () => {
  const settingsContext = useContext(ChatSettingsContext);
  const clientContext = useContext(ChatClientContext);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  if (!settingsContext) {
    throw new Error('ChatApp must be used within ChatSettingsProvider');
  }
  
  const successNotification = clientContext?.successNotification;
  const setSuccessNotification = clientContext?.setSuccessNotification;
  
  // Debug: log notification changes
  useEffect(() => {
    console.log('[ChatApp] successNotification changed to:', successNotification);
  }, [successNotification]);
  
  // Auto-close success notification after timeout
  useEffect(() => {
    if (successNotification && setSuccessNotification) {
      console.log('[ChatApp] Setting up 5s timer for notification:', successNotification);
      // Clear any existing timer
      if (autoCloseTimerRef.current) {
        console.log('[ChatApp] Clearing existing timer');
        clearTimeout(autoCloseTimerRef.current);
      }
      
      // Set new auto-close timer
      autoCloseTimerRef.current = setTimeout(() => {
        console.log('[ChatApp] Timer fired, clearing notification');
        setSuccessNotification("");
      }, NOTIFICATION_AUTO_CLOSE_MS);
      
      // Cleanup on unmount or when notification changes
      return () => {
        console.log('[ChatApp] Cleanup: clearing timer');
        if (autoCloseTimerRef.current) {
          clearTimeout(autoCloseTimerRef.current);
        }
      };
    }
  }, [successNotification, setSuccessNotification]);
  
  return (
    <>
      <div className="app-container">
        {/* Success Notification Banner */}
        {successNotification && setSuccessNotification && (
          <div className="success-banner">
            <span className="success-banner-icon">✓</span>
            <span className="success-banner-text">{successNotification}</span>
            <button
              onClick={() => setSuccessNotification("")}
              className="success-banner-close"
              aria-label="Close success message"
            >
              ×
            </button>
          </div>
        )}
        
        <div className="layout">
          <Sidebar />
          <ChatRoomProvider>
            <ChatWindow />
          </ChatRoomProvider>
        </div>
      </div>
      <ChatFooter />
    </>
  );
};
