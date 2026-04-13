import { useEffect, useRef, useState } from "react";
import type { WebPubSubClient } from "@azure/web-pubsub-client";
import type { Order, MemberInfo } from "../types";

/**
 * Manages the WPS client lifecycle for a team member:
 * connects, subscribes to messages, joins groups, and cleans up on unmount.
 */
export function useWpsConnection(
  client: WebPubSubClient | undefined,
  memberInfo: MemberInfo | null
) {
  const [orders, setOrders] = useState<Order[]>([]);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!client || !memberInfo || connectedRef.current) return;
    connectedRef.current = true;

    client.on("group-message", (e) => {
      setOrders((prev) => [e.message.data as Order, ...prev]);
    });

    client.on("connected", async () => {
      const { name: teamName, accounts } = memberInfo.team;
      if (memberInfo.member.isManager) {
        await Promise.all(
          accounts.map((acc) =>
            client.joinGroup(`${teamName}.account.${acc}`)
          )
        );
      }
    });

    client.start();

    return () => {
      client.stop();
    };
  }, [client, memberInfo]);

  return { orders };
}
