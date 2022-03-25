import { GroupContext } from "./GroupContext";

export class GroupManager {
  groupDict: Map<string, GroupContext>;
  connectionDict: Map<string, string>;

  constructor() {
    this.groupDict = new Map();
    this.connectionDict = new Map();
  }

  getByConnectionId(connId: string): GroupContext {
    if (this.connectionDict.has(connId)) {
      let groupName = this.connectionDict.get(connId);
      if (this.groupDict.has(groupName)) {
        return this.groupDict.get(groupName);
      }
    }
    return undefined;
  }

  addConnection(username: string, connId: string, group: string) {
    this.connectionDict.set(connId, group);
    if (!this.groupDict.has(group)) {
      this.groupDict.set(group, new GroupContext(group));
    }
    let groupContext = this.groupDict.get(group);
    groupContext.setOnline(username, connId);
  }
}
