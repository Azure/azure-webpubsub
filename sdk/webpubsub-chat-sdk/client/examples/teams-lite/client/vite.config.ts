import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    exclude: ['@azure/web-pubsub-client', '@azure/web-pubsub-chat-client']
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
      events: 'events/'
    }
  },
  define: {
    'global': 'globalThis'
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
      '/eventhandler': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
