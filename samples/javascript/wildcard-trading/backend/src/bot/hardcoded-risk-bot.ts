import type { Order } from "../server/order";
import type { Alert } from "./types";
import { RiskBot } from "./risk-bot";

const QUANTITY_THRESHOLD = 30;

/**
 * Deterministic risk bot that tracks cumulative quantity per ticker.
 * Triggers an alert when any ticker's total exceeds the threshold.
 */
export class HardcodedRiskBot extends RiskBot {
  private tickerTotals = new Map<string, number>();

  constructor(accessUrl: string) {
    super("Rule-based Bot", accessUrl);
  }

  protected async evaluate(order: Order): Promise<Alert | null> {
    const current = (this.tickerTotals.get(order.ticker) ?? 0) + order.quantity;
    this.tickerTotals.set(order.ticker, current);

    if (current > QUANTITY_THRESHOLD) {
      return {
        botName: this.name,
        ticker: order.ticker,
        accountId: order.accountId,
        severity: "critical",
        message: `Position limit exceeded: ${order.ticker} total is ${current} (threshold: ${QUANTITY_THRESHOLD})`,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }
}
