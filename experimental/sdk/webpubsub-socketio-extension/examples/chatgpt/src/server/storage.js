import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

class Storage {
  constructor(path) {
    this.basePath = path;
    fs.mkdir(path, { recursive: true });
  }

  path(id) {
    return path.join(this.basePath, `${id}.yml`);
  }

  messagesPath(id) {
    return path.join(this.basePath, `${id}.messages.yml`);
  }

  async *listSessions() {
    for (let f of await fs.readdir(this.basePath))
      if (f.endsWith('.yml') && !f.endsWith('.messages.yml')) yield path.parse(f).name;
  }

  async createSession(session) {
    let id = crypto.randomBytes(4).toString('hex');
    await fs.writeFile(this.path(id), yaml.dump(session));
    await fs.writeFile(this.messagesPath(id), '');
    return id;
  }

  async updateSession(session) {
    try {
      let { id, ...m } = session;
      let s = await this.getSession(id);
      await fs.writeFile(this.path(id), yaml.dump({ ...s, ...m }));
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('session does not exist', { cause: 'not_found' });
      throw e;
    }
  }

  async getSession(id) {
    try {
      return { id: id, ...yaml.load(await fs.readFile(this.path(id))) };
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('session does not exist', { cause: 'not_found' });
      throw e;
    }
  }

  async deleteSession(id) {
    try {
      await fs.rm(this.messagesPath(id));
      await fs.rm(this.path(id));
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('session does not exist', { cause: 'not_found' });
      throw e;
    }
  }

  async getMessages(id) {
    try {
      return yaml.load(await fs.readFile(this.messagesPath(id), 'utf-8')) || [];
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('session does not exist', { cause: 'not_found' });
      throw e;
    }
  }

  async appendMessage(id, message) {
    try {
      await fs.stat(this.messagesPath(id));
      await fs.appendFile(this.messagesPath(id), yaml.dump([message]));
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('session does not exist', { cause: 'not_found' });
      throw e;
    }
  }
}

export { Storage };