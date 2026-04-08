import type { Order } from "../types";

interface Props {
  orders: Order[];
}

export default function OrderTable({ orders }: Props) {
  return (
    <div className="rounded-lg border border-gray-100 mt-2 overflow-x-scroll">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-4 py-1 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Time
            </th>
            <th className="px-4 py-1 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Ticker
            </th>
            <th className="px-4 py-1 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Qty
            </th>
            <th className="px-4 py-1 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              By
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr>
              <td colSpan={4} className="text-center text-xs py-3 text-gray-300">
                No transactions yet
              </td>
            </tr>
          ) : (
            orders.map((order) => (
              <tr
                className="border-b border-gray-50 animate-row-highlight"
                key={order.id + order.traderId}
              >
                <td className="px-4 py-1 text-xs text-gray-500 tabular-nums">
                  {new Date(order.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </td>
                <td className="px-4 py-1 text-xs font-medium text-gray-700">
                  {order.ticker}
                </td>
                <td className="px-4 py-1 text-xs text-gray-600 tabular-nums">
                  {order.quantity}
                </td>
                <td className="px-4 py-1 text-xs text-gray-500 capitalize">
                  {order.traderId}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
