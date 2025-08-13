import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChatSettingsProvider } from "../providers/ChatSettingsProvider";
import { ChatClientProvider } from "../providers/ChatClientProvider";
import { ChatApp } from "../components/ChatApp";

// Mock WebPubSubClient to simulate streaming events
vi.mock("@azure/web-pubsub-client", () => {
  type Listener = (...args: any[]) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  class MockWebPubSubClient {
    private listeners: Record<string, Listener[]> = {};
    on(event: string, cb: Listener) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(cb);
    }
    async start() {
      // simulate immediate connection
      this.listeners["connected"]?.forEach((fn) => fn({ connectionId: "c1" }));
      return Promise.resolve();
    }
    stop() {
      return Promise.resolve();
    }
    joinGroup() {
      return Promise.resolve();
    }
    leaveGroup() {
      return Promise.resolve();
    }
    sendEvent() {
      // simulate AI streaming: chunk then end
      setTimeout(() => {
        this.listeners["group-message"]?.forEach((fn) => fn({ message: { data: { messageId: "m1", streaming: true, message: "Hel", roomId: "public", from: "AI Assistant" } } }));
      }, 10);
      setTimeout(() => {
        this.listeners["group-message"]?.forEach((fn) => fn({ message: { data: { messageId: "m1", streaming: true, streamingEnd: true, roomId: "public" } } }));
      }, 40);
      setTimeout(() => {
        this.listeners["group-message"]?.forEach((fn) => fn({ message: { data: { messageId: "m1", message: "Hello", roomId: "public", from: "AI Assistant" } } }));
      }, 50);
      return Promise.resolve();
    }
  }
  return { WebPubSubClient: MockWebPubSubClient };
});

// Mock fetch for initial rooms + messages
vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url === "/api/rooms") {
    return Promise.resolve(
      new Response(JSON.stringify({ rooms: [{ roomId: "public", roomName: "Public Chat", userId: "system", description: "" }] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }
  if (url.includes("/messages")) {
    return Promise.resolve(new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  if (url.startsWith("/negotiate")) {
    return Promise.resolve(new Response("ws://dummy", { status: 200 }));
  }
  return Promise.reject(new Error("Unhandled fetch: " + url));
});

describe("Send lock during streaming", () => {
  it("disables send controls while AI streaming response", async () => {
    render(
      <ChatSettingsProvider>
        <ChatClientProvider>
          <ChatApp />
        </ChatClientProvider>
      </ChatSettingsProvider>,
    );

    const textarea = await screen.findByPlaceholderText(/type a message/i);
    fireEvent.change(textarea, { target: { value: "Hi" } });
    const sendBtn = screen.getByRole("button", { name: /send message/i });
    expect(sendBtn).not.toBeDisabled();

    // Send message
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // After sending user message, placeholder added, AI streaming kicks in, send should lock
    // Wait a bit for first streaming chunk
    await new Promise((r) => setTimeout(r, 25));
    expect(sendBtn).toBeDisabled();
    // Textarea remains enabled so user can keep typing while assistant responds
    expect(textarea).not.toBeDisabled();

    // After streaming ends
    await new Promise((r) => setTimeout(r, 120));
    expect(sendBtn).toBeDisabled(); // still empty input -> disabled
    fireEvent.change(textarea, { target: { value: "Next" } });
    expect(sendBtn).not.toBeDisabled();
  });
});
