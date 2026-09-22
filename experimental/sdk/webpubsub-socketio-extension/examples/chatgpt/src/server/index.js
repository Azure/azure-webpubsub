import http from 'http';
import express from 'express';
import dotenv from 'dotenv';
import { useAzureSocketIO } from '@azure/web-pubsub-socket.io';
import { Server } from 'socket.io';
import { ChatGpt, createAzureOpenAIChat, createOpenAIChat } from './chatgpt.js';
import { Storage } from './storage.js';
import { parse } from "url";

function handleAsync(handler) {
  return (req, res, next) => {
    handler(req, res, next).catch(e => next(e));
  }
}

dotenv.config();
const app = express();
const server = http.createServer(app);
let ai = process.env.MODE == "native"
        ? createOpenAIChat('gpt-3.5-turbo', process.env.OPENAI_API_KEY)
        : createAzureOpenAIChat(process.env.AZURE_OPENAI_RESOURCE_NAME, process.env.AZURE_OPENAI_DEPLOYMENT_NAME, process.env.AZURE_OPENAI_API_KEY);

let chatGpt = new ChatGpt(ai, new Storage('sessions'));
app.use(express.static('public'));
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ limit: '1mb' }));
app
  .get('/chat', handleAsync(async (req, res) => {
    let l = [];
    for await (let s of chatGpt.sessions()) 
    {
        l.push({ id: s.id, ...await s.metadata() });
    }
    res.json(l);
  }))
  .post('/chat', handleAsync(async (req, res) => {
    let s = await chatGpt.createSession(req.body);
    res.json({
      id: s.id,
      ...await s.metadata()
    });
  }))
  .put('/chat/:id', handleAsync(async (req, res) => {
    let name = req.body.name;
    if (!name) throw new Error('missing session name', { cause: 'bad_request' });
    await chatGpt.session(req.params.id).updateName(name);
    res.status(204).end();
  }))
  .delete('/chat/:id', handleAsync(async (req, res) => {
    await chatGpt.session(req.params.id).delete();
    res.status(204).end();
  }))
  .get('/chat/:id/messages', handleAsync(async (req, res) => {
    res.json(await chatGpt.session(req.params.id).messages());
  }))
  .post('/chat/:id/messages', handleAsync(async (req, res) => {
    let c = req.body;
    if (!c) throw new Error('missing message body', { cause: 'bad_request ' });
    res.header('Content-Type', 'text/plain');
    for await (let cc of chatGpt.session(req.params.id).getReply(c)) res.write(cc);
    res.end();
  }));

app.use((err, req, res, next) => {
  console.log(`Error: ${err}`);
  switch (err.cause) {
    case 'bad_request': res.status(400); break;
    case 'not_found': res.status(404); break;
    case 'too_many_requests': res.status(429); break;
    default: res.status(500); break;
  }

  if (err.message) res.send(err.message);
  res.end();
});

const io = new Server(server);

await useAzureSocketIO(io, { 
  hub: "eio_hub",
  connectionString: process.env.WebPubSubConnectionString,
  configureNegotiateOptions: (req) => {
    const query = parse(req.url || "", true).query
    return { expirationTimeInMinutes: query["expirationMinutes"] ?? 600 }
  }
});


io.on('connection', client => {
  client.on('message', async (id, message) => {
    if (!id || !message) return;
    try {
      for await (let cc of chatGpt.session(id).getReply(message))
        client.emit('message', cc);
    } catch (e) {
      client.emit('error', e.message);
    }
  });
});

server.listen(3000, () => console.log('server started'));