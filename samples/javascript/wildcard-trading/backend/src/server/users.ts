export interface Member {
  id: string;
  name: string;
  isManager: boolean;
  avatarURL: string;
}

export interface TradingAccount {
  accountNum: string;
  managedBy: string[];
}

const team = {
  id: "oak",
  name: "Oak Team",
  members: [
    { id: "william", name: "William", isManager: true, avatarURL: "avatar-4.svg" },
    { id: "maya", name: "Maya", isManager: false, avatarURL: "avatar-1.svg" },
    { id: "james", name: "James", isManager: false, avatarURL: "avatar-2.svg" },
    { id: "sophie", name: "Sophie", isManager: false, avatarURL: "avatar-3.svg" },
    { id: "robert", name: "Robert", isManager: false, avatarURL: "avatar-5.svg" },
  ] satisfies Member[],
} as const;

const tradingAccounts: TradingAccount[] = [
  { accountNum: "XN41212", managedBy: ["maya", "james"] },
  { accountNum: "YK38293", managedBy: ["sophie", "robert"] },
];

export const teamRepo = {
  getName: () => team.id,
  getAllMembers: () => team.members as unknown as Member[],
  getMemberById: (id: string) => (team.members as unknown as Member[]).find((m) => m.id === id),
  getAllAccountNumbers: () => tradingAccounts.map((ta) => ta.accountNum),
  getUserAccountNumbers: (member: Member) =>
    tradingAccounts.filter((ta) => ta.managedBy.includes(member.id)).map((ta) => ta.accountNum),
};

