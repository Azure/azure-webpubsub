export interface Alert {
  botName: string;
  ticker: string;
  message: string;
  accountId: string;
  severity: "warning" | "critical";
  timestamp: string;
}
