export interface Order {
  id: string;
  traderId: string;
  accountId: string;
  ticker: string;
  quantity: number;
  timestamp: string;
}

const orders: Order[] = [];

export function placeOrder(input: { traderId: string; accountId: string; ticker: string; quantity: number }): Order {
  const order: Order = {
    id: crypto.randomUUID(),
    traderId: input.traderId,
    accountId: input.accountId,
    ticker: input.ticker,
    quantity: input.quantity,
    timestamp: new Date().toISOString(),
  };
  orders.push(order);
  return order;
}