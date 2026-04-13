import { WebPubSubClient } from "@azure/web-pubsub-client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AUTH_ENDPOINT } from "../config";
import type { Alert } from "../types";

interface UserClient {
  userId: string;
  client: WebPubSubClient;
}

const WebPubSubContext = createContext<UserClient[]>([]);
const AlertsContext = createContext<Alert[]>([]);

export function useWpsClient(userId: string): WebPubSubClient | undefined {
  return useContext(WebPubSubContext).find((uc) => uc.userId === userId)?.client;
}

export function useAlerts(): Alert[] {
  return useContext(AlertsContext);
}

export function WebPubSubProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<UserClient[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const initializedRef = useRef(false);
  const alertsListeningRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      try {
        const res = await fetch(`${AUTH_ENDPOINT}/auth`);
        const users: { userId: string; url: string }[] = await res.json();

        setClients(
          users.map((u) => ({
            userId: u.userId,
            client: new WebPubSubClient(u.url),
          }))
        );
      } catch (error) {
        console.error("[WPS] Failed to initialize:", error);
      }
    };

    init();
  }, []);

  // Listen for alerts broadcast as server messages (sent by bots via service client)
  useEffect(() => {
    if (clients.length === 0 || alertsListeningRef.current) return;
    alertsListeningRef.current = true;

    const firstClient = clients[0].client;
    firstClient.on("server-message", (e) => {
      const data = e.message.data as Record<string, unknown>;
      if (data && "botName" in data) {
        setAlerts((prev) => [data as unknown as Alert, ...prev]);
      }
    });
  }, [clients]);

  return (
    <WebPubSubContext.Provider value={clients}>
      <AlertsContext.Provider value={alerts}>
        {children}
      </AlertsContext.Provider>
    </WebPubSubContext.Provider>
  );
}
