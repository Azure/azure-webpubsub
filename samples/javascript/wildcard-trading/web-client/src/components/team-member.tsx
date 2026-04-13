import { useState, useEffect } from "react";
import { useWpsClient } from "../hooks/wps-provider";
import { useWpsConnection } from "../hooks/use-wps-connection";
import { API_BASE } from "../config";
import type { MemberInfo } from "../types";
import PlaceOrder from "./place-order";
import OrderTable from "./order-table";

interface Props {
  leader?: boolean;
  userId: string;
  accountId?: string;
}

export default function TeamMember({
  leader = false,
  userId,
  accountId,
}: Props) {
  const client = useWpsClient(userId);
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const { orders } = useWpsConnection(client, memberInfo);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/members/${userId}`);
        if (!res.ok) throw new Error(`Failed to load member ${userId}`);
        setMemberInfo(await res.json());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const [placing, setPlacing] = useState(false);

  const handlePlaceOrder = async (order: {
    ticker: string;
    quantity: number;
  }) => {
    if (!client) return;
    setPlacing(true);
    try {
      await client.sendEvent("order", { ...order, accountId }, "json");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <header className="border-b pb-2 border-gray-200">
        <div className="flex justify-end gap-2 items-center mb-2">
          <h3 className="text-right text-sm font-medium text-gray-700">
            {memberInfo?.member.name}
          </h3>
          <div className="size-7 rounded-full bg-amber-100 overflow-hidden">
            <img
              src={memberInfo?.member.avatarURL}
              alt={memberInfo?.member.name}
            />
          </div>
        </div>
        {!leader && (
          <PlaceOrder onPlaceOrder={handlePlaceOrder} isLoading={placing} />
        )}
      </header>

      <OrderTable orders={orders} />
    </div>
  );
}
