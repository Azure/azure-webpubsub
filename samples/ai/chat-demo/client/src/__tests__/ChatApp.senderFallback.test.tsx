import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ChatSettingsProvider } from '../providers/ChatSettingsProvider';
import { ChatClientProvider } from '../providers/ChatClientProvider';
import { ChatApp } from '../components/ChatApp';

vi.mock('@azure/web-pubsub-client', () => {
  class MockWebPubSubClient {
    on(event: string, cb: (ev: unknown) => void) {
      if (event === 'connected') {
        setTimeout(() => cb({ connectionId: 'conn-test' }), 0);
      }
    }
    start() { return Promise.resolve(); }
    stop() { return Promise.resolve(); }
    joinGroup() { return Promise.resolve(); }
    leaveGroup() { return Promise.resolve(); }
    sendEvent() { return Promise.resolve(); }
  }
  return { WebPubSubClient: MockWebPubSubClient };
});

// Mock fetch for history: returns one message lacking 'from'
vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
  if (typeof input === 'string' && input.includes('/api/rooms/')) {
  return Promise.resolve({
      ok: true,
      json: async () => ({ messages: [ { messageId: 'm1', message: 'History message with no from' } ] }),
    }) as unknown as Response;
  }
  if (typeof input === 'string' && input.startsWith('/negotiate')) {
    return Promise.resolve({ ok: true, text: async () => 'ws://dummy' }) as unknown as Response;
  }
  return Promise.reject(new Error('Unexpected fetch ' + input));
});

describe('Sender fallback', () => {
  test('history message without from uses AI Assistant sender', async () => {
    render(
      <ChatSettingsProvider>
        <ChatClientProvider>
          <ChatApp />
        </ChatClientProvider>
      </ChatSettingsProvider>
    );

    // Wait for history load to complete and message to appear
    await screen.findByText(/History message with no from/i);

    // The sender div precedes content; ensure we see AI Assistant label
    const senderEls = screen.getAllByText(/AI Assistant/i);
    expect(senderEls.length).toBeGreaterThan(0);
  });
});
