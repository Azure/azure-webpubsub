import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ChatSettingsProvider } from './providers/ChatSettingsProvider'
import { ChatClientProvider } from './providers/ChatClientProvider'
import { ChatApp } from './components/ChatApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatSettingsProvider>
      <ChatClientProvider>
        <ChatApp />
      </ChatClientProvider>
    </ChatSettingsProvider>
  </StrictMode>,
)
