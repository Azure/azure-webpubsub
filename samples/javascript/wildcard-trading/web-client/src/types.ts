export interface MemberInfo {
  member: {
    id: string;
    name: string;
    isManager: boolean;
    avatarURL: string;
  };
  team: {
    name: string;
    accounts: string[];
  };
}

export interface Order {
  id: string;
  ticker: string;
  quantity: number;
  traderId: string;
  timestamp: string;
}

export interface Alert {
  botName: string;
  ticker: string;
  message: string;
  accountId: string;
  severity: "warning" | "critical";
  timestamp: string;
}
