import { ChatClient } from "../src/chatClient.js";
import { randomInt as secureRandomInt } from "crypto";

// Test configuration
export const negotiateUrl = "http://localhost:3000/negotiate";
export const SHORT_TEST_TIMEOUT = 5 * 1000;
export const LONG_TEST_TIMEOUT = 10 * 1000;

// Helper functions
export const randomInt = () => secureRandomInt(0, 10000000);

export const getUserIds = (count: number): string[] => {
  const userIds: string[] = [];
  for (let i = 0; i < count; i++) {
    userIds.push(`user-${i}-${randomInt()}`);
  }
  return userIds;
};

export async function createTestClient(userId?: string): Promise<ChatClient> {
  if (!userId) {
    userId = `uid-${randomInt()}`;
  }
  return await ChatClient.start({
    getClientAccessUrl: async () => {
      const res = await fetch(negotiateUrl + (userId ? `?userId=${encodeURIComponent(userId)}` : ""));
      const value = (await res.json()) as { url?: string };
      if (!value?.url) throw new Error("Failed to get negotiate url");
      return value.url;
    },
  });
}

export async function getMultipleClients(count: number): Promise<ChatClient[]> {
  const userIds = getUserIds(count);
  const clients: ChatClient[] = [];
  for (const userId of userIds) {
    clients.push(await createTestClient(userId));
  }
  return clients;
}

// Helper to stop multiple clients in parallel.
export async function stopClients(clients: ChatClient[]): Promise<void> {
  await Promise.all(clients.map((c) => c.stop()));
}

// Force exit after all tests complete (call this at the end of test file)
export function forceExitAfterTests(): void {
  // Use setImmediate to allow the test runner to finish reporting
  setImmediate(() => {
    process.exit(0);
  });
}
