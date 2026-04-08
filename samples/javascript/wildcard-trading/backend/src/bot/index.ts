import { grantBotPermissions } from "../server/wps";
import { HardcodedRiskBot } from "./hardcoded-risk-bot";
import { LlmRiskBot } from "./llm-risk-bot";

export async function startBots() {
  const [hardcodedToken, llmToken] = await grantBotPermissions([
    "hardcoded-risk-bot",
    "llm-risk-bot",
  ]);

  const hardcodedBot = new HardcodedRiskBot(hardcodedToken.url);
  const llmBot = new LlmRiskBot(llmToken.url);

  await Promise.all([hardcodedBot.start(), llmBot.start()]);
  console.log("Risk bots started");
}
