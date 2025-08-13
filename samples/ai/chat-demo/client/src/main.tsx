import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ThemeProvider } from './providers/ThemeProvider'
import { AvatarProvider } from './providers/AvatarProvider'
import { ChatSettingsProvider } from './providers/ChatSettingsProvider'
import { ChatClientProvider } from './providers/ChatClientProvider'
import { ChatApp } from './components/ChatApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AvatarProvider>
        <ChatSettingsProvider>
          <ChatClientProvider>
            <ChatApp />
          </ChatClientProvider>
        </ChatSettingsProvider>
      </AvatarProvider>
    </ThemeProvider>
  </StrictMode>,
)
