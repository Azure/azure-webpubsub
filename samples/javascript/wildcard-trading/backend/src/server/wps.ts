import dotenv from "dotenv";
dotenv.config();

import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { DefaultAzureCredential } from "@azure/identity";
import { teamRepo, type Member } from "./users";

const WPS_ENDPOINT = process.env.WPS_ENDPOINT;
const WPS_HUB_NAME = process.env.WPS_HUB_NAME || "trading";
const USE_WILDCARD = process.env.USE_WILDCARD !== "false";

if (!WPS_ENDPOINT) {
  throw new Error("WPS_ENDPOINT environment variable is required");
}

export const wpsServiceClient = new WebPubSubServiceClient(
  WPS_ENDPOINT,
  new DefaultAzureCredential(),
  WPS_HUB_NAME,
);

// Group naming: {teamName}.account.{accountNum}
// Team leader uses wildcard group roles — {teamName}.**
// Team member uses literal group names — {teamName}.account.{accountNum}

export function getGroupName(accountNum: string): string {
  return `${teamRepo.getName()}.account.${accountNum}`;
}

export async function grantGroupPermissions(members: Member[]) {
  const team = teamRepo.getName();
  return Promise.all(members.map(async (m) => {
    const roles = m.isManager ? getLeaderRoles(team) : getMemberRoles(m, team);
    const groups = m.isManager ? undefined : getMemberGroups(m, team);
    const { url } = await wpsServiceClient.getClientAccessToken({ userId: m.id, roles, groups });
    return { userId: m.id, url };
  }));
}

export async function grantBotPermissions(botIds: string[]) {
  const team = teamRepo.getName();
  return Promise.all(botIds.map(async (botId) => {
    const { url } = await wpsServiceClient.getClientAccessToken({
      userId: botId,
      roles: [
        `webpubsub.joinLeaveGroups.${team}.**`,
        `webpubsub.sendToGroups.${team}.**`,
      ],
    });
    return { userId: botId, url };
  }));
}

function getLeaderRoles(team: string): string[] {
  if (USE_WILDCARD) {
    return [
      `webpubsub.joinLeaveGroups.${team}.**`,
      `webpubsub.sendToGroups.${team}.**`,
    ];
  }
  const accounts = teamRepo.getAllAccountNumbers();
  return [
    ...accounts.map((a) => `webpubsub.joinLeaveGroup.${team}.account.${a}`),
    ...accounts.map((a) => `webpubsub.sendToGroup.${team}.account.${a}`),
  ];
}

function getMemberGroups(member: Member, team: string): string[] {
  return teamRepo.getUserAccountNumbers(member).map((a) => `${team}.account.${a}`);
}

function getMemberRoles(member: Member, team: string): string[] {
  return [
    ...teamRepo.getUserAccountNumbers(member).map((a) => `webpubsub.sendToGroup.${team}.account.${a}`),
    "webpubsub.sendToServerEvent.order",
  ];
}