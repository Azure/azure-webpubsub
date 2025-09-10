# Chat Demo Client (React + TypeScript + Vite)

This is the frontend for the AI-powered chat demo, built with React, TypeScript, and Vite. It connects to the Python server via Azure Web PubSub protocol.
## Features
- Real-time chat UI with streaming AI responses
- Room-based conversations (default room: "public")
- Manual creation and switching of rooms by ID
- Connection status indicator
- AI streaming placeholder and typing indicator
- TailwindCSS styling

## Prerequisites
- Node.js >=16
- The Python server running on http://localhost:5000 (see `../python_server`)

## Setup & Run
```bash
# Install dependencies
cd client
npm install

# Start Vite dev server
npm run dev
```

The client will be available at http://localhost:5173 and will negotiate WebSocket URLs against the Python server.

## Build for Production
```bash
npm run build
```

## Configuration
- Backend URL: configured in `src/providers/ChatClientProvider.tsx` (defaults to `http://localhost:5000`)
  - WebSocket negotiation: GET `/negotiate?roomId={roomId}`

## Project Structure
```
client/
├── src/
│   ├── components/   # UI components (ChatApp, Sidebar, ChatInput, etc.)
│   ├── providers/    # Context providers (ChatClientProvider, ChatSettingsProvider)
│   ├── contexts/     # Context types and defaults
│   ├── reducers/     # messagesReducer
│   └── utils/        # utility functions
├── public/           # static assets
├── package.json
└── vite.config.ts
```
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
