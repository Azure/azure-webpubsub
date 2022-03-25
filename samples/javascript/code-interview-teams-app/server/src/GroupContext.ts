export enum UserState {
  Online = 0,
  Offline,
}

export class GroupUser {
  connId: string;
  state: UserState;
  user: string;

  constructor(connId: string, user: string) {
    this.connId = connId;
    this.user = user;
    this.state = UserState.Online;
  }
}

export class GroupContext {
  groupName: string;
  users: { [key: string]: GroupUser };

  constructor(name: string) {
    this.groupName = name;
    this.users = {};
  }

  private state2status(state: UserState) {
    switch (state) {
      case UserState.Online:
        return "online";
      case UserState.Offline:
        return "offline";
    }
  }

  setOnline(user: string, connId: string) {
    this.users[user] = new GroupUser(connId, user);
  }

  setOffline(user: string, connId: string) {
    Object.entries(this.users).forEach(([k, v]) => {
      if (k == user && v.connId == connId) {
        v.state = UserState.Offline;
      }
    });
  }

  toJSON() {
    let res = {
      type: "lobby",
      users: [],
    };

    for (let [k, v] of Object.entries(this.users)) {
      res.users.push({
        connectionId: v.connId,
        name: v.user,
        status: this.state2status(v.state),
      });
    }
    return res;
  }
}
