import readline from 'readline';
import dotenv from 'dotenv';
import { createAzureOpenAIChat, createOpenAIChat, ChatGpt } from './chatgpt.js';
import { Storage } from './storage.js';

dotenv.config();
const r = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function getInput() {
  return new Promise(resolve => {
    r.question('> ', a => resolve(a));
  });
}

// let ai = createOpenAIChat('gpt-3.5-turbo', process.env.OPENAI_API_KEY);
let ai = createAzureOpenAIChat(process.env.AZURE_OPENAI_RESOURCE_NAME, process.env.AZURE_OPENAI_DEPLOYMENT_NAME, process.env.AZURE_OPENAI_API_KEY);
let session = await new ChatGpt(ai, new Storage('sessions')).createSession({ name: `Chat on ${new Date().toLocaleString()}` });

for (;;) {
  let i = await getInput();
  for await (let t of session.getReply(i)) process.stdout.write(t);
  process.stdout.write('\n');
  // console.log(await session.getReplySync(i));
}