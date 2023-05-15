const { Configuration, OpenAIApi } = require("openai");

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OpenAI API key not configured");
}

const apiVersion = "2023-03-15-preview";
const endpoint = process.env.OPENAI_API_Endpoint;
const deployment = process.env.OPENAI_API_Deployment;
let apiBase = "https://api.openai.com/v1";
if (endpoint && deployment) {
  apiBase = `${endpoint}openai/deployments/${deployment}`;
}

const configuration = new Configuration({
  basePath: apiBase,
  apiKey: apiKey,
});
const openai = new OpenAIApi(configuration);

const session = { messages: [{ role: "system", content: "You are a nice bot, love telling jokes." }] };

function add(role, message) {
  session.messages.push({ role: role, content: message });
}

module.exports = async function invokeChatgpt(message) {
  if (!message) {
    return "Say something.";
  }

  if (message.length > 200) {
    return "Too long message.";
  }
  if (session.messages.length > 20) {
    return "20 round reaches. Let's start a new round.";
  }
  add("user", message);
  try {
    const response = await openai.createChatCompletion(
      {
        model: "gpt-3.5-turbo",
        messages: session.messages,
        temperature: 0.6,
      },
      {
        headers: {
          "api-key": configuration.apiKey,
        },
        params: {
          "api-version": apiVersion,
        },
      }
    );
    const message = response.data.choices[0].message;
    add(message.role, message.content);
    return message.content;
  } catch (error) {
    // Consider adjusting the error handling logic for your use case
    if (error.response) {
      console.error(error.response.status, error.response.data);
      return `${error.response.status} ${error.response.data}`;
    } else {
      console.error(`Error with OpenAI API request: ${error.message}`);
      return `An error occurred during your request, please retry.`;
    }
  }
};
