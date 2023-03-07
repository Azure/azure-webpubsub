const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubEventHandler } = require('@azure/web-pubsub-express');
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!configuration.apiKey) {
  throw new error("OpenAI API key not configured");
}

const openai = new OpenAIApi(configuration);

const app = express();
const hubName = 'chatgpt';
const port = 8888;

let connectionString = process.argv[2] || process.env.WebPubSubConnectionString;
let serviceClient = new WebPubSubServiceClient(connectionString, hubName);
let handler = new WebPubSubEventHandler(hubName, {
  path: '/eventhandler',
  onConnected: async req => {
    console.log(`${req.context.userId} connected`);
    await serviceClient.sendToAll({
      type: "system",
      message: `${req.context.userId} joined`
    });
  },
  handleUserEvent: async (req, res) => {
    if (req.context.eventName === 'message') {
      // store chat context to state
      // todo: what is the max length of the state?
      let context = req.context.states["chat-context"];
      // the first time, cook chatGPT
      if (!context) context = cook();
      console.log(context);
      // add current round chat into the context
      if (context.length > 5) {
        res.setState("chat-context", null);
        res.success(JSON.stringify({from: "ChatGPT", message: "5 round reaches. Let's start a new round."}), "json");
        return;
      }
      add(context, req.data);
      res.setState("chat-context", context);
      // simply return the message back to the client
      res.success(JSON.stringify({
          from: "ChatGPT",
          message: await invokeChatGpt(context)
      }), "json");
      return;
    }
    res.success();
  }
});

app.use(handler.getMiddleware());
app.get('/negotiate', async (req, res) => {
  let id = req.query.id;
  if (!id) {
    res.status(400).send('missing user id');
    return;
  }
  let token = await serviceClient.getClientAccessToken({ userId: id });
  res.json({
    url: token.url
  });
});

app.use(express.static('public'));
app.listen(port, () => console.log(`Event handler listening at http://localhost:${port}${handler.path}`));

function cook(){
  return [{"role": "system", "content": "You are a helpful chatbot."}]
}
function add(messages, message){
  messages.push({"role": "user", "content": message});
}

async function invokeChatGpt(message) {
  if (!message) {
    return "Say something.";
  }
  console.log(message);

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: message,
      temperature: 0.6,
      stream: true,
    });
    return response.data.choices[0].message.content;
  } catch(error) {
    // Consider adjusting the error handling logic for your use case
    if (error.response) {
      console.error(error.response.status, error.response.data);
      return `${error.response.status} ${error.response.data}`;
    } else {
      console.error(`Error with OpenAI API request: ${error.message}`);
      return `An error occurred during your request, please retry.`
    }
  }
}
