import OpenAI from 'openai';

function createOpenAIChat(model, key) {
  let ai = new OpenAI({ apiKey: key });
  return (messages, stream) => ai.chat.completions.create({
    model, stream,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })),
  });
}

function createAzureOpenAIChat(name, deployment, key) {
  let ai = new OpenAI({
    baseURL: `https://${name}.openai.azure.com/openai/deployments/${deployment}`,
    apiKey: key,
    defaultHeaders: { 'api-key': key },
    defaultQuery: { 'api-version': '2023-03-15-preview' }
  });
  return (messages, stream) => ai.chat.completions.create({
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    stream
  });
}

class ChatGpt {
  constructor(chat, storage) {
    this.chat = chat;
    this.storage = storage;
  }

  async generateName(hint) {
    if (!hint) return;
    let res = await this.chat([
      {
        role: 'system',
        content: `Use a few words (better to be less than 10) to summarize user's question. If there is no question in user's input, output something like "User asks for help".`
      },
      {
        role: 'user',
        content: hint
      }
    ], false);
    let name = res.choices[0].message.content;
    if (name.endsWith('.')) name = name.substring(0, name.length - 1);
    return name;
  }

  async createSession(session) {
    let name = session?.name || await this.generateName(session?.nameHint) || `Chat on ${new Date().toLocaleString()}`;
    let i = await this.storage.createSession({ name, systemMessage: session?.systemMessage, createdAt: new Date().valueOf() });
    return this.session(i);
  }

  session(id) {
    return new ChatGptSession(id, this.chat, this.storage);
  }

  async *sessions() {
    for await (let i of this.storage.listSessions()) yield this.session(i);
  }
}

class ChatGptSession {
  constructor(id, chat, storage) {
    this.id = id;
    this.storage = storage;
    this.chat = chat;
  }

  async getCompletionResponse(input, stream) {
    await this.storage.appendMessage(this.id, {
      role: 'user',
      content: input,
      date: Date.now()
    });
    let { systemMessage } = await this.metadata();
    let messages = await this.storage.getMessages(this.id);
    if (systemMessage) messages = [{ role: 'system', content: systemMessage }].concat(messages);
    return await this.chat(messages, stream);
  }

  async getReplySync(input) {
    let res = await this.getCompletionResponse(input, false);
    let message = res.choices[0].message;
    await this.storage.appendMessage(this.id, {
      role: message.role,
      date: Date.now(),
      content: message.content
    });
    return message.content;
  }

  async *getReply(input) {
    let res = await this.getCompletionResponse(input, true);
    let message = { content: '' };
    for await (const chunk of res) {
      let delta = chunk.choices[0].delta;
      message.role = delta.role || message.role;
      if (delta.content) {
        message.content += delta.content;
        yield delta.content;
      }
    }

    message.date = Date.now();
    this.storage.appendMessage(this.id, message);
  }

  async messages() {
    return this.storage.getMessages(this.id);
  }

  async metadata() {
    return (await this.storage.getSession(this.id));
  }

  async updateName(name) {
    await this.storage.updateSession({ id: this.id, name });
  }

  async delete() {
    await this.storage.deleteSession(this.id);
  }
}

export { ChatGpt, ChatGptSession, createOpenAIChat, createAzureOpenAIChat };