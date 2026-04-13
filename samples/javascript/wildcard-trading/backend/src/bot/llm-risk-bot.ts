import type { Order } from "../server/order";
import type { Alert } from "./types";
import { RiskBot } from "./risk-bot";

const ALERT_PROBABILITY = 0.3;
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 3000;

const MOCK_ANALYSES = [
  "Unusual volume pattern detected — possible front-running activity",
  "Order clustering anomaly — correlated trades across multiple accounts",
  "Velocity spike — rapid successive orders may indicate algorithmic manipulation",
  "Deviation from historical trading profile for this account",
  "Potential wash trading pattern — similar buy/sell volumes detected",
];

function randomDelay(): Promise<void> {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock LLM risk bot that simulates AI analysis with a random delay.
 * Flags ~30% of orders with a fake analysis message.
 */
export class LlmRiskBot extends RiskBot {
  constructor(accessUrl: string) {
    super("AI-powered Bot", accessUrl);
  }

  protected async evaluate(order: Order): Promise<Alert | null> {
    await randomDelay();

    if (Math.random() > ALERT_PROBABILITY) {
      return null;
    }

    const analysis = MOCK_ANALYSES[Math.floor(Math.random() * MOCK_ANALYSES.length)];

    return {
      botName: this.name,
      ticker: order.ticker,
      accountId: order.accountId,
      severity: "warning",
      message: `${analysis} (${order.ticker}, qty ${order.quantity})`,
      timestamp: new Date().toISOString(),
    };
  }
}
