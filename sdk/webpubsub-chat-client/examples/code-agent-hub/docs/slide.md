# Code Agent + WPS Chat

---

## Problem with WPS + AI Scenarios

- Classical AI Chat
    - Example: ChatGPT Web (1 AI Bot + 1 User)
    - User asks, AI streams a response. SSE is enough.
    - WebSocket two-way communication is more than needed, and costs more than SSE
    - WPS capabilities are also more than needed. Broadcast / Group / Presence are all unused.

- AI Group Chat
    - Example: One Chat Group, 1 AI Bot + N Human Users
    - In practice, apps just reuse the IM platform's API; nobody builds a standalone chat app for this. WPS is also not necessary.

---

## WPS fits code agent scenario well

Typical events in a session:

- **prompt**: user sends instructions, not just at the start. Users can send more messages while the agent is still replying.
- **streaming message**: agent replies token by token
- **reasoning**: agent's chain of thought
- **tool call**: agent reads files, writes files, runs terminal commands
- **permission request**: agent asks for user approval
- **status update**: processing / idle / error

How this differs from Classical AI Chat and AI Group Chat:
- Requires frequent two-way communication
    - SSE is not enough
- Requires high performance, scalability and more advanced features
    - There are far more messages, and they come much more often than in normal chat
    - A session can last a long time, which keeps steady load on the server
    - Reconnect is necessary for the long-lived sessions

---

## ACP Protocol

ACP (Agent Client Protocol) defines a common way for editors or IDEs to talk to coding agents, similar to what LSP did for language servers.

- Agent implements ACP → works with any editor that supports ACP
- Editor supports ACP → can work with any ACP agent
- Local mode: subprocess + JSON-RPC over stdio
- Remote mode: HTTP / WebSocket (WIP)
- Problem it solves: a common way for `one editor ↔ one agent` communication

What ACP does NOT solve:
- Multi-session, multi-user, cross-device, or different client apps
- Persistence (code agents only store state locally)

---

## CodeAgentHub - Arch

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Azure Web PubSub Chat                               │
│                                                                              │
│   public room                  session room 1                session room 2  │
│   (daemon discovery)          (agent session)               (agent session)  │
└──────────────────┬────────────────────────┬──────────────────────────────────┘
                   │                        │
         ┌─────────┴─────────┐       ┌────────┴───────────────────────────────────┐
         │    Web Portal     │       │               Same Machine                 │
         └─────────┬─────────┘       │                                            │
                   │                 │            ┌──────────────┐                │
        ┌──────────┼──────────┐      │            │    Agent     │                │
        │          │          │      │            │    Daemon    │                │
   ┌────┴────┐ ┌───┴────┐ ┌───┴────┐ │            └──────┬───────┘                │
   │ Mobile  │ │Desktop │ │  Web   │ │                   │ ACP (JSON-RPC / stdio) │
   │   App   │ │  App   │ │ Client │ │            ┌──────┴────────────────────┐   │
   │ Client  │ │ Client │ │        │ │            │ Copilot  Claude  Codex    │   │
   └─────────┘ └────────┘ └────────┘ │            │ Gemini   OpenCode  ...    │   │
                                     │            └───────────────────────────┘   │
                                     └────────────────────────────────────────────┘
```

---

## How a Session Works

```
  Web Portal              WPS Chat              Agent Daemon          Code Agent
      │                      │                       │                     │
      │                      │    daemon.online      │                     │
      │                      │◄──────────────────────│                     │
      │   control.create     │                       │                     │
      │─────────────────────►│   control.create      │                     │
      │                      │──────────────────────►│  spawn + init       │
      │                      │                       │────────────────────►│
      │   user.prompt        │                       │                     │
      │─────────────────────►│   user.prompt         │                     │
      │                      │──────────────────────►│  prompt             │
      │                      │                       │────────────────────►│
      │                      │                       │  tool / msg / perm  │
      │                      │   session events      │◄────────────────────│
      │   session events     │◄──────────────────────│                     │
      │◄─────────────────────│                       │                     │
```

Portal and Daemon have **no direct communication**. All messages go through WPS Chat.

---
### More Separation (ACP supports it, but it is not supported by major agents)

- Currently the code agent's execution environment and the user's code workspace are on the same machine (Go back to the arch page)
- ACP actually supports separating these. The agent can avoid reading or writing files directly, and instead use RPC to tell the IDE what it wants to read or write.
- The IDE then decides how to perform the actual file operations
- This is an optional feature; in practice, Copilot and Claude Code do not support this mode

---

## Conclusion

- Code Agent is a good fit for WPS.
- The demand for shared code agent sessions is real
    - repo `slopus/happy` (mobile phone control code agents) got real adoption by many real users soon and got 17.4K stars
- As ACP evolves its Remote Mode support, the need for shared session transport will only grow
