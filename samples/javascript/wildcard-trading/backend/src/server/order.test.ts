import { describe, expect, it } from "vitest";
import { placeOrder } from "./order";

describe("placeOrder", () => {
  it("preserves the trade details and records a unique identity and timestamp", () => {
    const input = { traderId: "trader", accountId: "account", ticker: "MSFT", quantity: 10 };
    const before = Date.now();
    const first = placeOrder(input);
    const second = placeOrder(input);

    expect(first).toMatchObject(input);
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second.id).not.toBe(first.id);
    expect(Date.parse(first.timestamp)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(first.timestamp)).toBeLessThanOrEqual(Date.now());
  });

  it("keeps an accepted order independent of later input changes", () => {
    const input = { traderId: "trader", accountId: "account", ticker: "MSFT", quantity: 10 };
    const order = placeOrder(input);
    input.quantity = 20;
    input.ticker = "OTHER";

    expect(order.quantity).toBe(10);
    expect(order.ticker).toBe("MSFT");
  });
});
