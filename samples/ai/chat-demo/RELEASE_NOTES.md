# AI Chat Demo – Release Notes

Plain-language updates focused on what demo users can try. Non-customer internal details intentionally omitted.

## [0.1.1] - 2025-10-30 (Preview)

### Added
- `config.json` configuration file added to support different models with distinct parameters.

### Changed
- Provide `githubModelsToken` parameter for `azd`
- AI error visibility: early initialization surfaces missing/invalid token directly to users via broadcast message.
- Logging improved around streaming start / completion / error states.

### Upgrade Guidance (0.1.0 → 0.1.1)
1. If you want AI immediately, set the token before running `azd up` (or pass `--set githubModelsToken=...`).
2. If you deployed without a token, just run `azd provision --set githubModelsToken=<token>` to enable AI.
3. To change the token later, repeat provision with the new value.

## [0.1.0] - 2025-10-11 (Preview)
Initial preview release.

### Snapshot
| Area | What you get |
|------|--------------|
| Chat Core | Create / switch rooms instantly (default `public`), per-room cached history |
| AI | Optional GitHub Models answers; app still works without a token |
| Runtime Modes | `self` (local WebSocket) or `webpubsub` (managed service) – toggle with env var |
| Storage Modes | `memory` (ephemeral) or `table` (Azure Table / Azurite) |
| Streaming UX | Token-by-token AI output + typing indicator |
| Messaging UX | Markdown (sanitized), simple formatting, removable non-default rooms |
| Diagnostics | Connection / error banner |
| One-Command Start | Local: `python start_dev.py`; Azure: `azd up` |

### Limitations
| Limitation | Impact |
|------------|--------|
| No history pagination | Very long rooms may load slower over time |
| No auth / identity | All users are anonymous sessions |
| Single AI strategy | Must edit `chat_model_client.py` to change model logic |
| Basic accessibility & theming | Visual polish / a11y incomplete |

### Explore More (Optional)
| If you want to… | Do this |
|------------------|---------|
| Use managed service | Set `TRANSPORT_MODE=webpubsub` and deploy with `azd up` |
| Keep history between runs | Set `STORAGE_MODE=table` (Azure or Azurite) |
| Adjust AI tone | Edit prompt/model in `python_server/chat_model_client.py` |
| Build a minimal custom feature | Fork and add a new room action or message type |

---
